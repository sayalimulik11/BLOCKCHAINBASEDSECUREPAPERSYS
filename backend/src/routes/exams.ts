import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import { z } from "zod";
import multer from "multer";
import { ExamVaultABI } from "@sigil/contracts-types";
import { canonical, schemas } from "@sigil/core";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { prisma } from "../db.js";
import type { Config } from "../config.js";

const MAX_BATCH_BYTES = 5 * 1024 * 1024;
const BATCH_MIME_TYPE = "application/octet-stream";

function isPathInside(rootPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(rootPath, candidatePath);
  return (
    relativePath !== "" &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}

function isValidStoragePath(blobDir: string, blobPath: string): boolean {
  if (!blobPath || typeof blobPath !== "string") {
    return false;
  }
  if (blobPath.includes("\0") || blobPath.includes("\\")) {
    return false;
  }
  if (path.isAbsolute(blobPath) || blobPath.startsWith("/") || /^[a-zA-Z]:/.test(blobPath)) {
    return false;
  }
  const segments = blobPath.split(/[/\\]/);
  if (segments.some((segment) => segment === "..")) {
    return false;
  }
  const blobRoot = path.resolve(blobDir);
  const candidatePath = path.resolve(blobRoot, blobPath);
  const rootWithSep = blobRoot.endsWith(path.sep) ? blobRoot : `${blobRoot}${path.sep}`;
  if (!candidatePath.startsWith(rootWithSep) || !isPathInside(blobRoot, candidatePath)) {
    return false;
  }
  return true;
}

async function getSafeBlobPath(blobDir: string, blobPath: string): Promise<string | null> {
  if (!isValidStoragePath(blobDir, blobPath)) return null;

  const rootPath = await realpath(blobDir);
  const rootWithSep = rootPath.endsWith(path.sep) ? rootPath : `${rootPath}${path.sep}`;
  const candidatePath = path.resolve(rootPath, blobPath);
  if (!candidatePath.startsWith(rootWithSep) || !isPathInside(rootPath, candidatePath)) return null;

  const actualPath = await realpath(candidatePath);
  if (!actualPath.startsWith(rootWithSep) || !isPathInside(rootPath, actualPath)) return null;

  const details = await stat(actualPath);
  return details.isFile() ? actualPath : null;
}

async function isUserAssignedOrCreator(
  examId: string,
  userAddress: string,
  contract: ethers.Contract
): Promise<boolean> {
  const normUser = ethers.getAddress(userAddress);

  // 1. Check database PanelMember
  const member = await prisma.panelMember.findFirst({
    where: { examId, address: normUser },
  });
  if (member) return true;

  // 2. Check on-chain exam authority and panel members
  try {
    const onChainExam = await contract.getExam(BigInt(examId));
    if (ethers.getAddress(onChainExam.authority) === normUser) {
      return true;
    }
    const [holders, setters, centres] = await contract.getPanel(BigInt(examId));
    const all = [
      ...holders.map((h: string) => ethers.getAddress(h)),
      ...setters.map((s: string) => ethers.getAddress(s)),
      ...centres.map((c: string) => ethers.getAddress(c)),
    ];
    if (all.includes(normUser)) {
      return true;
    }
  } catch {
    // contract read failed or exam not on chain
  }

  return false;
}

export function createExamsRouter(
  getConfigFn: () => Config,
  customContract?: ethers.Contract
) {
  const router = Router();
  router.param("id", (req, res, next, value) => {
    const parsed = z.string().regex(/^\d+$/).safeParse(value);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "INVALID_EXAM_ID", message: "Exam id must be a non-negative integer" },
      });
    }
    next();
  });
  router.param("batchId", (req, res, next, value) => {
    const parsed = z.string().min(1).max(128).safeParse(value);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "INVALID_BATCH_ID", message: "Batch id is invalid" },
      });
    }
    next();
  });
  const batchUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_BATCH_BYTES, files: 1 },
  });

  function getContract() {
    if (customContract) return customContract;
    const cfg = getConfigFn();
    const provider = new ethers.JsonRpcProvider(cfg.RPC_URL);
    return new ethers.Contract(cfg.CONTRACT_ADDRESS, ExamVaultABI, provider);
  }

  // POST /api/exams/:id/batches - store a ciphertext blob pending chain confirmation
  router.post(
    "/:id/batches",
    requireAuth,
    requireRole("SETTER"),
    (req: Request, res: Response, next) => {
      if (!req.is("multipart/form-data")) {
        return res.status(415).json({
          error: {
            code: "MULTIPART_REQUIRED",
            message: "Batch uploads must use multipart/form-data",
          },
        });
      }

      batchUpload.single("file")(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError) {
          const isTooLarge = err.code === "LIMIT_FILE_SIZE";
          return res.status(isTooLarge ? 413 : 400).json({
            error: {
              code: isTooLarge ? "FILE_TOO_LARGE" : "INVALID_MULTIPART",
              message: isTooLarge
                ? "Batch ciphertext must not exceed 5 MB"
                : "Multipart upload must contain one file in the 'file' field",
            },
          });
        }
        if (err) return next(err);
        next();
      });
    },
    async (req: Request, res: Response) => {
      let savedPath: string | undefined;
      try {
        const { id } = req.params;
        const file = req.file;
        if (!file) {
          return res.status(400).json({
            error: {
              code: "FILE_REQUIRED",
              message: "Multipart upload must include a file in the 'file' field",
            },
          });
        }
        if (file.mimetype !== BATCH_MIME_TYPE) {
          return res.status(415).json({
            error: {
              code: "UNSUPPORTED_FILE_TYPE",
              message: `Batch ciphertext must have content type ${BATCH_MIME_TYPE}`,
            },
          });
        }
        if (file.size === 0) {
          return res.status(400).json({
            error: {
              code: "EMPTY_FILE",
              message: "Batch ciphertext must not be empty",
            },
          });
        }

        const fields = z.object({
          sectionId: z.string().regex(/^\d+$/),
          questionCount: z.string().regex(/^\d+$/),
        }).safeParse(req.body);
        if (!fields.success) {
          return res.status(400).json({
            error: {
              code: "VALIDATION_FAILED",
              message: "Multipart fields sectionId and questionCount are required integers",
              details: fields.error.issues,
            },
          });
        }

        const sectionId = Number(fields.data.sectionId);
        const questionCount = Number(fields.data.questionCount);
        if (
          !Number.isSafeInteger(sectionId) ||
          sectionId > 255 ||
          !Number.isSafeInteger(questionCount) ||
          questionCount < 1 ||
          questionCount > 500
        ) {
          return res.status(400).json({
            error: {
              code: "VALIDATION_FAILED",
              message: "sectionId must fit uint8 and questionCount must be between 1 and 500",
            },
          });
        }

        const caller = ethers.getAddress(req.session!.address!);
        const contract = getContract();
        if (!(await contract.hasRole(ethers.id("SETTER_ROLE"), caller))) {
          return res.status(403).json({
            error: { code: "FORBIDDEN", message: "Caller does not have the SETTER role" },
          });
        }

        let onChainExam;
        try {
          onChainExam = await contract.getExam(BigInt(id));
        } catch {
          return res.status(404).json({
            error: { code: "EXAM_NOT_FOUND", message: `Exam ${id} not found on chain` },
          });
        }
        if (Number(onChainExam.state) !== 1) {
          return res.status(400).json({
            error: {
              code: "WRONG_STATE",
              message: "Batch uploads are only accepted while the exam is Collecting",
            },
          });
        }

        let setters: string[];
        try {
          [, setters] = await contract.getPanel(BigInt(id));
        } catch {
          return res.status(404).json({
            error: { code: "EXAM_NOT_FOUND", message: `Exam ${id} panel not found on chain` },
          });
        }
        if (!setters.some((setter: string) => ethers.getAddress(setter) === caller)) {
          return res.status(403).json({
            error: {
              code: "FORBIDDEN",
              message: "Caller is not an assigned setter for this exam",
            },
          });
        }

        const cfg = getConfigFn();
        const blobPath = `${randomUUID()}.bin`;
        const blobRoot = path.resolve(cfg.BLOB_DIR);
        const fullPath = path.resolve(blobRoot, blobPath);
        if (!isPathInside(blobRoot, fullPath)) {
          return res.status(400).json({
            error: { code: "INVALID_STORAGE_PATH", message: "Generated blob path is invalid" },
          });
        }

        const ciphertextHash = ethers.keccak256(file.buffer);
        await mkdir(blobRoot, { recursive: true });
        await writeFile(fullPath, file.buffer, { flag: "wx", mode: 0o600 });
        savedPath = fullPath;

        let batch;
        try {
          batch = await prisma.batch.create({
            data: {
              examId: id,
              sectionId,
              setter: caller,
              ciphertextHash,
              questionCount,
              startInSection: 0,
              blobPath,
              status: "pending",
            },
          });
        } catch (err: unknown) {
          if (
            typeof err === "object" &&
            err !== null &&
            "code" in err &&
            err.code === "P2002"
          ) {
            await unlink(fullPath);
            savedPath = undefined;
            return res.status(409).json({
              error: { code: "DUPLICATE_BATCH", message: "This batch hash is already recorded" },
            });
          }
          throw err;
        }

        savedPath = undefined;
        return res.status(201).json({
          id: batch.id,
          examId: batch.examId,
          sectionId: batch.sectionId,
          setter: batch.setter,
          ciphertextHash: batch.ciphertextHash,
          questionCount: batch.questionCount,
          status: batch.status,
        });
      } catch {
        if (savedPath) {
          try {
            await unlink(savedPath);
          } catch {
            // Preserve the original upload or database error.
          }
        }
        return res.status(500).json({
          error: { code: "INTERNAL_ERROR", message: "Failed to store batch ciphertext" },
        });
      }
    }
  );

  async function authorizeBatchRead(
    examId: string,
    address: string,
    contract: ethers.Contract
  ): Promise<boolean> {
    const onChainExam = await contract.getExam(BigInt(examId));
    const state = Number(onChainExam.state);
    const caller = ethers.getAddress(address);

    if (
      (await contract.hasRole(ethers.id("AUTHORITY_ROLE"), caller)) &&
      ethers.getAddress(onChainExam.authority) === caller
    ) {
      return true;
    }
    if (state < 3) return false;

    const [,, centres] = await contract.getPanel(BigInt(examId));
    if (
      (await contract.hasRole(ethers.id("CENTRE_ROLE"), caller)) &&
      centres.some((centre: string) => ethers.getAddress(centre) === caller)
    ) {
      return true;
    }
    return contract.hasRole(ethers.id("AUDITOR_ROLE"), caller);
  }

  // GET /api/exams/:id/batches - list confirmed blobs visible to this caller
  router.get("/:id/batches", requireAuth, async (req: Request, res: Response) => {
    try {
      const contract = getContract();
      let allowed: boolean;
      try {
        allowed = await authorizeBatchRead(req.params.id, req.session!.address!, contract);
      } catch {
        return res.status(404).json({
          error: {
            code: "EXAM_NOT_FOUND",
            message: `Exam ${req.params.id} not found on chain`,
          },
        });
      }
      if (!allowed) {
        return res.status(403).json({
          error: { code: "FORBIDDEN", message: "Caller cannot access batches for this exam" },
        });
      }

      const batches = await prisma.batch.findMany({
        where: { examId: req.params.id, status: "confirmed", blobPath: { not: "" } },
        orderBy: { createdAt: "asc" },
      });
      return res.status(200).json(
        batches.map((batch: any) => ({
          id: batch.id,
          examId: batch.examId,
          batchId: batch.batchId?.toString() ?? null,
          sectionId: batch.sectionId,
          setter: batch.setter,
          ciphertextHash: batch.ciphertextHash,
          questionCount: batch.questionCount,
          startInSection: batch.startInSection,
          status: batch.status,
          downloadUrl: `/api/exams/${req.params.id}/batches/${batch.id}/download`,
        }))
      );
    } catch {
      return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Failed to list confirmed batches" },
      });
    }
  });

  // GET /api/exams/:id/batches/:batchId/download - re-authorize and verify ciphertext before sending
  router.get(
    "/:id/batches/:batchId/download",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const contract = getContract();
        let allowed: boolean;
        try {
          allowed = await authorizeBatchRead(req.params.id, req.session!.address!, contract);
        } catch {
          return res.status(404).json({
            error: {
              code: "EXAM_NOT_FOUND",
              message: `Exam ${req.params.id} not found on chain`,
            },
          });
        }
        if (!allowed) {
          return res.status(403).json({
            error: { code: "FORBIDDEN", message: "Caller cannot access batches for this exam" },
          });
        }

        const batch = await prisma.batch.findUnique({
          where: { id: req.params.batchId },
        });
        if (
          !batch ||
          batch.examId !== req.params.id ||
          batch.status !== "confirmed" ||
          !batch.blobPath
        ) {
          return res.status(404).json({
            error: { code: "BATCH_NOT_FOUND", message: "Confirmed batch not found" },
          });
        }

        const cfg = getConfigFn();
        if (!isValidStoragePath(cfg.BLOB_DIR, batch.blobPath)) {
          return res.status(400).json({
            error: { code: "INVALID_STORAGE_PATH", message: "Batch storage path is invalid" },
          });
        }

        let fullPath: string | null;
        try {
          fullPath = await getSafeBlobPath(cfg.BLOB_DIR, batch.blobPath);
        } catch (err: unknown) {
          if (
            typeof err === "object" &&
            err !== null &&
            "code" in err &&
            err.code === "ENOENT"
          ) {
            return res.status(404).json({
              error: { code: "BLOB_NOT_FOUND", message: "Batch ciphertext blob not found" },
            });
          }
          throw err;
        }
        if (!fullPath) {
          return res.status(400).json({
            error: { code: "INVALID_STORAGE_PATH", message: "Batch storage path is invalid" },
          });
        }

        const blob = await readFile(fullPath);
        if (ethers.keccak256(blob).toLowerCase() !== batch.ciphertextHash.toLowerCase()) {
          return res.status(409).json({
            error: {
              code: "HASH_MISMATCH",
              message: "Stored batch ciphertext does not match its recorded hash",
            },
          });
        }

        res.status(200);
        res.setHeader("Content-Type", BATCH_MIME_TYPE);
        res.setHeader("Content-Length", blob.length);
        return Readable.from([blob]).pipe(res);
      } catch {
        return res.status(500).json({
          error: { code: "INTERNAL_ERROR", message: "Failed to download batch ciphertext" },
        });
      }
    }
  );

  // GET /api/exams - list exams
  // Authenticated: filtered to exams the caller is assigned to or created
  // Unauthenticated: public summary variant without secrets
  router.get("/", async (req: Request, res: Response) => {
    try {
      const isAuthenticated = Boolean(req.session?.address);
      const exams = await prisma.exam.findMany({
        orderBy: { createdAt: "desc" },
      });

      if (!isAuthenticated) {
        // Public summary variant: exposes no secrets (Section 4.3 public data only)
        const publicExams = exams.map((e) => ({
          examId: e.examId,
          chainId: e.chainId,
          state: e.state,
          metaHash: e.metaHash,
          releaseOpensAt: e.releaseOpensAt.toString(),
          examStartsAt: e.examStartsAt.toString(),
          examEndsAt: e.examEndsAt.toString(),
          threshold: e.threshold,
          bankHash: e.bankHash,
          seed: e.seed,
        }));
        return res.status(200).json(publicExams);
      }

      // Authenticated view - filtered to exams the caller is assigned to or created
      const callerAddr = ethers.getAddress(req.session!.address!);
      const contract = getContract();

      const filtered: typeof exams = [];
      for (const e of exams) {
        if (await isUserAssignedOrCreator(e.examId, callerAddr, contract)) {
          filtered.push(e);
        }
      }

      const mapped = filtered.map((e) => ({
        ...e,
        releaseOpensAt: e.releaseOpensAt.toString(),
        examStartsAt: e.examStartsAt.toString(),
        examEndsAt: e.examEndsAt.toString(),
      }));

      return res.status(200).json(mapped);
    } catch (err: any) {
      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: err?.message || "Failed to list exams",
        },
      });
    }
  });

  // GET /api/exams/:id/shares/me - return assigned holder's own envelope
  router.get(
    "/:id/shares/me",
    requireAuth,
    requireRole("HOLDER"),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const caller = ethers.getAddress(req.session!.address!);
        const contract = getContract();

        // 1. Verify caller is an assigned holder for this exam
        let panelHolders: string[] = [];
        try {
          const [holders] = await contract.getPanel(BigInt(id));
          panelHolders = holders.map((h: string) => ethers.getAddress(h));
        } catch {
          // Fallback to database PanelMember if on-chain call fails
          const dbHolders = await prisma.panelMember.findMany({
            where: { examId: id, kind: "holder" },
          });
          panelHolders = dbHolders.map((m) => ethers.getAddress(m.address));
        }

        if (!panelHolders.includes(caller)) {
          return res.status(403).json({
            error: {
              code: "FORBIDDEN",
              message: "Caller is not an assigned holder for this exam",
            },
          });
        }

        // 2. Fetch holder's share from DB
        const share = await prisma.encryptedShare.findUnique({
          where: {
            examId_holder: {
              examId: id,
              holder: caller,
            },
          },
        });

        if (!share) {
          return res.status(404).json({
            error: {
              code: "SHARE_NOT_FOUND",
              message: "Encrypted share not found for this exam",
            },
          });
        }

        // Return ONLY that holder's own envelope as hex
        return res.status(200).json({
          examId: share.examId,
          holder: share.holder,
          envelope: "0x" + Buffer.from(share.envelope).toString("hex"),
        });
      } catch (err: any) {
        return res.status(500).json({
          error: {
            code: "INTERNAL_ERROR",
            message: err?.message || "Failed to retrieve encrypted share",
          },
        });
      }
    }
  );

  // PUT /api/exams/:id/shares - store one encrypted share envelope per panel holder
  // Creating AUTHORITY only, only when exam is in Draft
  router.put(
    "/:id/shares",
    requireAuth,
    requireRole("AUTHORITY"),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const caller = ethers.getAddress(req.session!.address!);
        const contract = getContract();

        // 1. Read exam state and authority from the chain (authoritative)
        let onChainExam;
        try {
          onChainExam = await contract.getExam(BigInt(id));
        } catch {
          return res.status(404).json({
            error: {
              code: "EXAM_NOT_FOUND",
              message: `Exam ${id} not found on chain`,
            },
          });
        }

        // 2. Verify caller is the creating authority
        if (ethers.getAddress(onChainExam.authority) !== caller) {
          return res.status(403).json({
            error: {
              code: "FORBIDDEN",
              message: "Only the creating Authority can upload shares",
            },
          });
        }

        // 3. Verify exam state is Draft (state 0)
        if (Number(onChainExam.state) !== 0) {
          return res.status(400).json({
            error: {
              code: "WRONG_STATE",
              message: `Shares can only be stored when exam is in Draft state (current state is ${onChainExam.state})`,
            },
          });
        }

        // 4. Read panel holders from the contract
        let panelHolders: string[] = [];
        try {
          const [holders] = await contract.getPanel(BigInt(id));
          panelHolders = holders.map((h: string) => ethers.getAddress(h));
        } catch {
          const dbHolders = await prisma.panelMember.findMany({
            where: { examId: id, kind: "holder" },
          });
          panelHolders = dbHolders.map((m) => ethers.getAddress(m.address));
        }

        // 5. Parse and validate shares payload
        const rawShares = Array.isArray(req.body)
          ? req.body
          : Array.isArray(req.body?.shares)
          ? req.body.shares
          : null;

        if (!rawShares || !Array.isArray(rawShares)) {
          return res.status(400).json({
            error: {
              code: "VALIDATION_FAILED",
              message: "Payload must contain an array of shares or { shares: [...] }",
            },
          });
        }
        const sharesPayload = z.array(z.object({
          holder: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
          envelope: z.union([
            z.string().min(1),
            z.instanceof(Uint8Array),
            z.array(z.number().int().min(0).max(255)),
          ]),
        })).safeParse(rawShares);
        if (!sharesPayload.success) {
          return res.status(400).json({
            error: {
              code: "VALIDATION_FAILED",
              message: "Invalid encrypted share entries",
              details: sharesPayload.error.issues,
            },
          });
        }

        // Check holder count
        if (sharesPayload.data.length !== panelHolders.length) {
          return res.status(400).json({
            error: {
              code: "INVALID_HOLDER_COUNT",
              message: `Expected exactly ${panelHolders.length} shares for panel holders, got ${sharesPayload.data.length}`,
            },
          });
        }

        const seenHolders = new Set<string>();
        const parsedShares: Array<{ holder: string; envelopeBytes: Buffer }> = [];

        for (const item of sharesPayload.data) {
          if (!item.holder || !item.envelope) {
            return res.status(400).json({
              error: {
                code: "VALIDATION_FAILED",
                message: "Each share must specify 'holder' and 'envelope'",
              },
            });
          }

          let holderAddr: string;
          try {
            holderAddr = ethers.getAddress(item.holder);
          } catch {
            return res.status(400).json({
              error: {
                code: "INVALID_HOLDER",
                message: `Invalid Ethereum address: ${item.holder}`,
              },
            });
          }

          if (seenHolders.has(holderAddr)) {
            return res.status(400).json({
              error: {
                code: "DUPLICATE_HOLDER",
                message: `Duplicate share for holder: ${holderAddr}`,
              },
            });
          }
          seenHolders.add(holderAddr);

          if (!panelHolders.includes(holderAddr)) {
            return res.status(400).json({
              error: {
                code: "NON_PANEL_HOLDER",
                message: `Address ${holderAddr} is not an assigned holder in this exam panel`,
              },
            });
          }

          // Parse envelope
          let envBuf: Buffer;
          if (typeof item.envelope === "string") {
            const clean = item.envelope.startsWith("0x") ? item.envelope.slice(2) : item.envelope;
            if (/^[0-9a-fA-F]+$/.test(clean)) {
              envBuf = Buffer.from(clean, "hex");
            } else {
              envBuf = Buffer.from(item.envelope, "base64");
            }
          } else if (Buffer.isBuffer(item.envelope)) {
            envBuf = item.envelope;
          } else if (item.envelope instanceof Uint8Array || Array.isArray(item.envelope)) {
            envBuf = Buffer.from(item.envelope);
          } else {
            return res.status(400).json({
              error: {
                code: "INVALID_ENVELOPE",
                message: "Envelope must be a hex string or bytes",
              },
            });
          }

          // Validate envelope format: leading byte 0x01, minimum length 94 bytes (1 prefix + 65 epk + 12 iv + 16 tag)
          if (envBuf.length < 94 || envBuf[0] !== 0x01) {
            return res.status(400).json({
              error: {
                code: "INVALID_ENVELOPE",
                message: "Envelope must start with 0x01 and be at least 94 bytes (epk + iv + tag)",
              },
            });
          }

          parsedShares.push({ holder: holderAddr, envelopeBytes: envBuf });
        }

        // Verify no panel holders are missing
        for (const h of panelHolders) {
          if (!seenHolders.has(h)) {
            return res.status(400).json({
              error: {
                code: "MISSING_HOLDER",
                message: `Missing share for panel holder ${h}`,
              },
            });
          }
        }

        // 6. Transactionally store envelopes (never log envelope bytes)
        await prisma.$transaction(async (tx) => {
          for (const s of parsedShares) {
            await tx.encryptedShare.upsert({
              where: {
                examId_holder: {
                  examId: id,
                  holder: s.holder,
                },
              },
              create: {
                examId: id,
                holder: s.holder,
                envelope: s.envelopeBytes,
              },
              update: {
                envelope: s.envelopeBytes,
              },
            });
          }
        });

        return res.status(200).json({
          examId: id,
          storedCount: parsedShares.length,
        });
      } catch (err: any) {
        return res.status(500).json({
          error: {
            code: "INTERNAL_ERROR",
            message: err?.message || "Failed to store encrypted shares",
          },
        });
      }
    }
  );

  // GET /api/exams/:id - exam detail
  // Authenticated: requires user to be assigned to or creator of exam
  // Unauthenticated: public summary variant without secrets
  router.get("/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const isAuthenticated = Boolean(req.session?.address);

      let exam = await prisma.exam.findUnique({
        where: { examId: id },
      });

      // If not in DB, attempt lookup on-chain
      if (!exam) {
        try {
          const contract = getContract();
          const onChainExam = await contract.getExam(BigInt(id));
          if (onChainExam && onChainExam.authority !== ethers.ZeroAddress) {
            const cfg = getConfigFn();
            exam = await prisma.exam.create({
              data: {
                chainId: cfg.CHAIN_ID,
                examId: id,
                metaHash: onChainExam.metaHash,
                state: Number(onChainExam.state),
                releaseOpensAt: BigInt(onChainExam.releaseOpensAt),
                examStartsAt: BigInt(onChainExam.examStartsAt),
                examEndsAt: BigInt(onChainExam.examEndsAt),
                threshold: Number(onChainExam.threshold),
                bankHash: onChainExam.bankHash !== ethers.ZeroHash ? onChainExam.bankHash : null,
                seed: onChainExam.seed !== ethers.ZeroHash ? onChainExam.seed : null,
              },
            });
          }
        } catch {
          // not found on chain
        }
      }

      if (!exam) {
        return res.status(404).json({
          error: {
            code: "EXAM_NOT_FOUND",
            message: `Exam with id ${id} not found`,
          },
        });
      }

      if (!isAuthenticated) {
        return res.status(200).json({
          examId: exam.examId,
          chainId: exam.chainId,
          state: exam.state,
          metaHash: exam.metaHash,
          releaseOpensAt: exam.releaseOpensAt.toString(),
          examStartsAt: exam.examStartsAt.toString(),
          examEndsAt: exam.examEndsAt.toString(),
          threshold: exam.threshold,
          bankHash: exam.bankHash,
          seed: exam.seed,
        });
      }

      const callerAddr = ethers.getAddress(req.session!.address!);
      const contract = getContract();
      const isAssigned = await isUserAssignedOrCreator(id, callerAddr, contract);
      if (!isAssigned) {
        return res.status(403).json({
          error: {
            code: "FORBIDDEN",
            message: "You are not assigned to or creator of this exam",
          },
        });
      }

      return res.status(200).json({
        ...exam,
        releaseOpensAt: exam.releaseOpensAt.toString(),
        examStartsAt: exam.examStartsAt.toString(),
        examEndsAt: exam.examEndsAt.toString(),
      });
    } catch (err: any) {
      return res.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: err?.message || "Failed to retrieve exam",
        },
      });
    }
  });

  // POST /api/exams/:id/meta - store metadata with hash verification
  router.post(
    "/:id/meta",
    requireAuth,
    requireRole("AUTHORITY"),
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        const cfg = getConfigFn();

        // 1. Validate payload with core ExamMetaSchema
        const parsed = schemas.ExamMetaSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            error: {
              code: "VALIDATION_FAILED",
              message: "Invalid exam metadata schema",
              details: parsed.error.issues,
            },
          });
        }

        const metaJson = parsed.data;

        // 2. Compute canonical keccak256 hash using RFC 8785 canonicalize
        const computedHash = canonical.keccakJson(metaJson);

        // 3. Query on-chain exam
        const contract = getContract();
        let onChainExam;
        try {
          onChainExam = await contract.getExam(BigInt(id));
        } catch {
          return res.status(404).json({
            error: {
              code: "EXAM_NOT_FOUND",
              message: `Exam ${id} not found on chain`,
            },
          });
        }

        // 4. Verify caller is creating AUTHORITY
        const callerAddress = ethers.getAddress(req.session.address!);
        if (
          ethers.getAddress(onChainExam.authority) !== callerAddress
        ) {
          return res.status(403).json({
            error: {
              code: "FORBIDDEN",
              message: "Only the creating Authority can upload exam metadata",
            },
          });
        }

        // 5. Verify computed canonical hash equals on-chain metaHash
        if (computedHash.toLowerCase() !== onChainExam.metaHash.toLowerCase()) {
          return res.status(400).json({
            error: {
              code: "HASH_MISMATCH",
              message: `Computed canonical hash (${computedHash}) does not match on-chain metaHash (${onChainExam.metaHash})`,
            },
          });
        }

        // 6. Store in database
        const saved = await prisma.exam.upsert({
          where: { examId: id },
          create: {
            chainId: cfg.CHAIN_ID,
            examId: id,
            metaHash: onChainExam.metaHash,
            metaJson,
            state: Number(onChainExam.state),
            releaseOpensAt: BigInt(onChainExam.releaseOpensAt),
            examStartsAt: BigInt(onChainExam.examStartsAt),
            examEndsAt: BigInt(onChainExam.examEndsAt),
            threshold: Number(onChainExam.threshold),
            bankHash:
              onChainExam.bankHash !== ethers.ZeroHash ? onChainExam.bankHash : null,
            seed: onChainExam.seed !== ethers.ZeroHash ? onChainExam.seed : null,
          },
          update: {
            metaHash: onChainExam.metaHash,
            metaJson,
            state: Number(onChainExam.state),
          },
        });

        return res.status(200).json({
          examId: id,
          metaHash: saved.metaHash,
          metaJson: saved.metaJson,
        });
      } catch (err: any) {
        return res.status(500).json({
          error: {
            code: "INTERNAL_ERROR",
            message: err?.message || "Failed to save exam metadata",
          },
        });
      }
    }
  );

  return router;
}

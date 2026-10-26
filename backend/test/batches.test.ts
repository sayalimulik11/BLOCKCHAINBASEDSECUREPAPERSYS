import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { ethers } from "ethers";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";
import { parseConfig } from "../src/config.js";

const mockBatches = new Map<string, any>();

vi.mock("../src/db.js", () => ({
  prisma: {
    batch: {
      create: vi.fn().mockImplementation(({ data }: { data: any }) => {
        const batch = {
          id: `batch-${mockBatches.size + 1}`,
          batchId: null,
          createdAt: new Date(),
          ...data,
        };
        mockBatches.set(batch.id, batch);
        return Promise.resolve(batch);
      }),
      findMany: vi.fn().mockImplementation(({ where }: any) => {
        return Promise.resolve(
          Array.from(mockBatches.values()).filter(
            (batch) =>
              batch.examId === where.examId &&
              batch.status === where.status &&
              batch.blobPath !== ""
          )
        );
      }),
      findUnique: vi.fn().mockImplementation(({ where }: any) => {
        return Promise.resolve(mockBatches.get(where.id) || null);
      }),
    },
  },
}));

describe("Batch blob endpoints (BE-05)", () => {
  const authority = ethers.Wallet.createRandom();
  const setter = ethers.Wallet.createRandom();
  const unassignedSetter = ethers.Wallet.createRandom();
  const centre = ethers.Wallet.createRandom();
  const unassignedCentre = ethers.Wallet.createRandom();
  const auditor = ethers.Wallet.createRandom();
  let examState = 1;
  let blobDir = "";
  let config: ReturnType<typeof parseConfig>;

  const baseConfig = parseConfig({
    PORT: "4000",
    NODE_ENV: "test",
    RPC_URL: "http://127.0.0.1:8545",
    CHAIN_ID: "31337",
    CONTRACT_ADDRESS: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    DEPLOY_BLOCK: "0",
    DATABASE_URL: "postgresql://localhost:5432/sigil_db",
    SESSION_SECRET: "test-session-secret-that-is-at-least-32-chars",
    FRONTEND_ORIGIN: "http://localhost:5173",
    BLOB_DIR: "./uploads",
  });

  const contract = {
    getExam: vi.fn().mockImplementation(async () => ({
      state: examState,
      authority: authority.address,
    })),
    getPanel: vi.fn().mockResolvedValue([[], [setter.address], [centre.address]]),
    hasRole: vi.fn().mockImplementation(async (roleHash: string, account: string) => {
      const address = ethers.getAddress(account);
      const roleByAddress = new Map<string, string>([
        [authority.address, ethers.id("AUTHORITY_ROLE")],
        [setter.address, ethers.id("SETTER_ROLE")],
        [unassignedSetter.address, ethers.id("SETTER_ROLE")],
        [centre.address, ethers.id("CENTRE_ROLE")],
        [unassignedCentre.address, ethers.id("CENTRE_ROLE")],
        [auditor.address, ethers.id("AUDITOR_ROLE")],
      ]);
      return roleByAddress.get(address) === roleHash;
    }),
  } as any;

  async function loginAs(agent: ReturnType<typeof request.agent>, wallet: ethers.Wallet) {
    const nonceResponse = await agent.get("/api/auth/nonce");
    const { SiweMessage } = await import("siwe");
    const siwe = new SiweMessage({
      domain: "localhost:5173",
      address: wallet.address,
      statement: "Sign in",
      uri: "http://localhost:5173",
      version: "1",
      chainId: 31337,
      nonce: nonceResponse.body.nonce,
      issuedAt: new Date().toISOString(),
    });
    const message = siwe.prepareMessage();
    await agent
      .post("/api/auth/verify")
      .send({ message, signature: await wallet.signMessage(message) });
  }

  function createAgent(wallet: ethers.Wallet) {
    const agent = request.agent(createApp(config, undefined, contract));
    return loginAs(agent, wallet).then(() => agent);
  }

  beforeEach(() => {
    mockBatches.clear();
    vi.clearAllMocks();
    examState = 1;
    blobDir = fs.mkdtempSync(path.join(os.tmpdir(), "sigil-batches-test-"));
    config = { ...baseConfig, BLOB_DIR: blobDir };
  });

  afterEach(() => {
    fs.rmSync(blobDir, { recursive: true, force: true });
  });

  it("stores uploads as pending using a server-generated filename and confirms them for listing", async () => {
    const agent = await createAgent(setter);
    const ciphertext = Buffer.from([1, 2, 3, 4, 5]);
    const upload = await agent
      .post("/api/exams/1/batches")
      .field("sectionId", "0")
      .field("questionCount", "2")
      .attach("file", ciphertext, {
        filename: "../../client-name.bin",
        contentType: "application/octet-stream",
      });

    expect(upload.status).toBe(201);
    expect(upload.body.status).toBe("pending");
    expect(upload.body.ciphertextHash).toBe(ethers.keccak256(ciphertext));
    const storedBatch = mockBatches.get(upload.body.id);
    expect(storedBatch.blobPath).not.toContain("client-name");
    expect(path.basename(storedBatch.blobPath)).toBe(storedBatch.blobPath);
    expect(fs.readFileSync(path.join(blobDir, storedBatch.blobPath))).toEqual(ciphertext);

    const authorityAgent = await createAgent(authority);
    expect((await authorityAgent.get("/api/exams/1/batches")).body).toEqual([]);
    const pendingDownload = await authorityAgent.get(
      `/api/exams/1/batches/${storedBatch.id}/download`
    );
    expect(pendingDownload.status).toBe(404);

    storedBatch.status = "confirmed";
    const list = await authorityAgent.get("/api/exams/1/batches");
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].downloadUrl).toBe(
      `/api/exams/1/batches/${storedBatch.id}/download`
    );
    const downloaded = await authorityAgent
      .get(list.body[0].downloadUrl)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      });
    expect(downloaded.status).toBe(200);
    expect(downloaded.body).toEqual(ciphertext);
  });

  it("rejects setters not assigned to the exam and uploads outside Collecting", async () => {
    const unassignedAgent = await createAgent(unassignedSetter);
    const unassignedUpload = await unassignedAgent
      .post("/api/exams/1/batches")
      .field("sectionId", "0")
      .field("questionCount", "1")
      .attach("file", Buffer.from("ciphertext"), {
        filename: "batch.bin",
        contentType: "application/octet-stream",
      });
    expect(unassignedUpload.status).toBe(403);

    examState = 0;
    const assignedAgent = await createAgent(setter);
    const wrongStateUpload = await assignedAgent
      .post("/api/exams/1/batches")
      .field("sectionId", "0")
      .field("questionCount", "1")
      .attach("file", Buffer.from("ciphertext"), {
        filename: "batch.bin",
        contentType: "application/octet-stream",
      });
    expect(wrongStateUpload.status).toBe(400);
    expect(wrongStateUpload.body.error.code).toBe("WRONG_STATE");
  });

  it("rejects non-multipart uploads, unsupported types, and files over 5 MB", async () => {
    const agent = await createAgent(setter);
    const nonMultipart = await agent
      .post("/api/exams/1/batches")
      .send({ sectionId: 0, questionCount: 1 });
    expect(nonMultipart.status).toBe(415);
    expect(nonMultipart.body.error.code).toBe("MULTIPART_REQUIRED");

    const wrongType = await agent
      .post("/api/exams/1/batches")
      .field("sectionId", "0")
      .field("questionCount", "1")
      .attach("file", Buffer.from("not ciphertext type"), {
        filename: "batch.txt",
        contentType: "text/plain",
      });
    expect(wrongType.status).toBe(415);
    expect(wrongType.body.error.code).toBe("UNSUPPORTED_FILE_TYPE");

    const oversized = await agent
      .post("/api/exams/1/batches")
      .field("sectionId", "0")
      .field("questionCount", "1")
      .attach("file", Buffer.alloc(5 * 1024 * 1024 + 1), {
        filename: "batch.bin",
        contentType: "application/octet-stream",
      });
    expect(oversized.status).toBe(413);
    expect(oversized.body.error.code).toBe("FILE_TOO_LARGE");
  });

  it("denies centres before release, allows assigned centres after release, and denies unassigned centres", async () => {
    const centreAgent = await createAgent(centre);
    expect((await centreAgent.get("/api/exams/1/batches")).status).toBe(403);

    const auditorAgent = await createAgent(auditor);
    expect((await auditorAgent.get("/api/exams/1/batches")).status).toBe(403);

    examState = 3;
    expect((await centreAgent.get("/api/exams/1/batches")).status).toBe(200);
    expect((await auditorAgent.get("/api/exams/1/batches")).status).toBe(200);

    const unassignedAgent = await createAgent(unassignedCentre);
    expect((await unassignedAgent.get("/api/exams/1/batches")).status).toBe(403);
  });

  it("rechecks authorization and rejects tampered or path-traversing confirmed blobs", async () => {
    const agent = await createAgent(setter);
    const ciphertext = Buffer.from("encrypted batch");
    const upload = await agent
      .post("/api/exams/1/batches")
      .field("sectionId", "0")
      .field("questionCount", "1")
      .attach("file", ciphertext, {
        filename: "batch.bin",
        contentType: "application/octet-stream",
      });
    const batch = mockBatches.get(upload.body.id);
    batch.status = "confirmed";

    const authorityAgent = await createAgent(authority);
    fs.writeFileSync(path.join(blobDir, batch.blobPath), "tampered");
    const tampered = await authorityAgent.get(
      `/api/exams/1/batches/${batch.id}/download`
    );
    expect(tampered.status).toBe(409);
    expect(tampered.body.error.code).toBe("HASH_MISMATCH");

    batch.blobPath = "..\\outside.bin";
    const pathTraversal = await authorityAgent.get(
      `/api/exams/1/batches/${batch.id}/download`
    );
    expect(pathTraversal.status).toBe(400);
    expect(pathTraversal.body.error.code).toBe("INVALID_STORAGE_PATH");

    const unassignedAgent = await createAgent(unassignedCentre);
    const denied = await unassignedAgent.get(
      `/api/exams/1/batches/${batch.id}/download`
    );
    expect(denied.status).toBe(403);
  });

  it("rejects path traversal with forward-slash, backslash, and absolute paths, and returns 404 for missing files", async () => {
    const agent = await createAgent(setter);
    const upload = await agent
      .post("/api/exams/1/batches")
      .field("sectionId", "0")
      .field("questionCount", "1")
      .attach("file", Buffer.from("batch ciphertext"), {
        filename: "batch.bin",
        contentType: "application/octet-stream",
      });
    const batch = mockBatches.get(upload.body.id);
    batch.status = "confirmed";

    const authorityAgent = await createAgent(authority);
    const badPaths = ["../x", "..\\x", "/outside.bin", path.resolve(blobDir, "outside.bin")];
    for (const badPath of badPaths) {
      batch.blobPath = badPath;
      const res = await authorityAgent.get(
        `/api/exams/1/batches/${batch.id}/download`
      );
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("INVALID_STORAGE_PATH");
    }

    const freshAuthorityAgent = await createAgent(authority);
    batch.blobPath = "genuinely-missing.bin";
    const missing = await freshAuthorityAgent.get(
      `/api/exams/1/batches/${batch.id}/download`
    );
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("BLOB_NOT_FOUND");
  });
});

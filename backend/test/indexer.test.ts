import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import os from "os";
import { ExamVaultABI, ExamVaultBytecode } from "@sigil/contracts-types";
import { ExamVaultIndexer } from "../src/indexer/indexer.js";
import { IndexerStateManager } from "../src/indexer/state.js";
import { purgeUnconfirmedBatches } from "../src/indexer/purge.js";
import type { Config } from "../src/config.js";

// Helper to create in-memory database mock for indexer testing
function createInMemoryDb() {
  const chainEvents = new Map<string, any>();
  const exams = new Map<string, any>();
  const batches = new Map<string, any>();
  const panelMembers = new Map<string, any>();
  const participants = new Map<string, any>();

  const db = {
    chainEvent: {
      upsert: async ({ where, create, update }: any) => {
        const key = `${where.txHash_logIndex.txHash}_${where.txHash_logIndex.logIndex}`;
        const existing = chainEvents.get(key);
        if (existing) {
          const updated = { ...existing, ...update };
          chainEvents.set(key, updated);
          return updated;
        }
        const created = { id: `event-${chainEvents.size + 1}`, ...create };
        chainEvents.set(key, created);
        return created;
      },
      findMany: async () => Array.from(chainEvents.values()),
      count: async () => chainEvents.size,
    },
    exam: {
      upsert: async ({ where, create, update }: any) => {
        const existing = exams.get(where.examId);
        if (existing) {
          const updated = { ...existing, ...update };
          exams.set(where.examId, updated);
          return updated;
        }
        const created = { id: `exam-${exams.size + 1}`, ...create };
        exams.set(where.examId, created);
        return created;
      },
      update: async ({ where, data }: any) => {
        const existing = exams.get(where.examId);
        if (!existing) throw new Error(`Exam ${where.examId} not found`);
        const updated = { ...existing, ...data };
        exams.set(where.examId, updated);
        return updated;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const [key, val] of exams.entries()) {
          if (val.examId === where.examId) {
            if (where.state?.lt !== undefined && val.state >= where.state.lt) {
              continue; // Do not revert forward state
            }
            exams.set(key, { ...val, ...data });
            count++;
          }
        }
        return { count };
      },
      findUnique: async ({ where }: any) => exams.get(where.examId) || null,
      findMany: async () => Array.from(exams.values()),
    },
    panelMember: {
      upsert: async ({ where, create, update }: any) => {
        const { examId, address, kind } = where.examId_address_kind;
        const key = `${examId}_${address}_${kind}`;
        const existing = panelMembers.get(key);
        if (existing) {
          const updated = { ...existing, ...update };
          panelMembers.set(key, updated);
          return updated;
        }
        const created = { id: `panel-${panelMembers.size + 1}`, ...create };
        panelMembers.set(key, created);
        return created;
      },
      findMany: async () => Array.from(panelMembers.values()),
    },
    batch: {
      findUnique: async ({ where }: any) => {
        const { examId, sectionId, ciphertextHash } = where.examId_sectionId_ciphertextHash;
        const key = `${examId}_${sectionId}_${ciphertextHash.toLowerCase()}`;
        return batches.get(key) || null;
      },
      findMany: async (args?: any) => {
        let list = Array.from(batches.values());
        if (args?.where?.status) {
          list = list.filter((b) => b.status === args.where.status);
        }
        if (args?.where?.createdAt?.lt) {
          list = list.filter((b) => b.createdAt < args.where.createdAt.lt);
        }
        return list;
      },
      create: async ({ data }: any) => {
        const id = `batch-${batches.size + 1}`;
        const key = `${data.examId}_${data.sectionId}_${data.ciphertextHash.toLowerCase()}`;
        const created = { id, createdAt: new Date(), ...data };
        batches.set(key, created);
        return created;
      },
      update: async ({ where, data }: any) => {
        for (const [key, b] of batches.entries()) {
          if (b.id === where.id) {
            const updated = { ...b, ...data, updatedAt: new Date() };
            batches.set(key, updated);
            return updated;
          }
        }
        throw new Error("Batch not found for update");
      },
      delete: async ({ where }: any) => {
        for (const [key, b] of batches.entries()) {
          if (b.id === where.id) {
            batches.delete(key);
            return b;
          }
        }
        throw new Error("Batch not found for delete");
      },
    },
    participant: {
      findUnique: async ({ where }: any) => participants.get(where.address) || null,
      create: async ({ data }: any) => {
        const created = { createdAt: new Date(), ...data };
        participants.set(data.address, created);
        return created;
      },
      update: async ({ where, data }: any) => {
        const existing = participants.get(where.address);
        if (!existing) throw new Error("Participant not found");
        const updated = { ...existing, ...data, updatedAt: new Date() };
        participants.set(where.address, updated);
        return updated;
      },
      findMany: async () => Array.from(participants.values()),
    },
    $transaction: async (fn: any) => fn(db),
  };

  return {
    db,
    tables: { chainEvents, exams, batches, panelMembers, participants },
  };
}

describe("ExamVault Event Indexer (BE-07)", () => {
  let provider: ethers.JsonRpcProvider;
  let deployer: ethers.Signer;
  let authority: ethers.Signer;
  let setter: ethers.Signer;
  let holder1: ethers.Signer;
  let holder2: ethers.Signer;
  let holder3: ethers.Signer;
  let centre: ethers.Signer;
  let contract: ethers.Contract;
  let contractAddress: string;
  let tempBlobDir: string;

  beforeAll(async () => {
    provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
    const accounts = await provider.listAccounts();
    if (accounts.length < 7) {
      throw new Error("Local node must have at least 7 funded accounts");
    }

    deployer = accounts[0];
    authority = accounts[1];
    setter = accounts[2];
    holder1 = accounts[3];
    holder2 = accounts[4];
    holder3 = accounts[5];
    centre = accounts[6];

    tempBlobDir = fs.mkdtempSync(path.join(os.tmpdir(), "sigil-indexer-test-"));
  });

  beforeEach(async () => {
    // Deploy a fresh ExamVault contract instance for each test
    const factory = new ethers.ContractFactory(ExamVaultABI, ExamVaultBytecode, deployer);
    contract = (await factory.deploy(60)) as ethers.Contract;
    await contract.waitForDeployment();
    contractAddress = await contract.getAddress();
  });

  afterAll(() => {
    if (tempBlobDir && fs.existsSync(tempBlobDir)) {
      fs.rmSync(tempBlobDir, { recursive: true, force: true });
    }
  });

  it("should index real contract events and verify idempotency (replay produces identical DB)", async () => {
    const authorityAddr = await authority.getAddress();
    const setterAddr = await setter.getAddress();
    const h1Addr = await holder1.getAddress();
    const h2Addr = await holder2.getAddress();
    const h3Addr = await holder3.getAddress();
    const centreAddr = await centre.getAddress();

    // Register real participants on-chain
    await (contract.connect(deployer) as any).registerParticipant(authorityAddr, 1, ethers.ZeroHash); // AUTHORITY
    await (contract.connect(deployer) as any).registerParticipant(setterAddr, 2, ethers.ZeroHash); // SETTER
    await (contract.connect(deployer) as any).registerParticipant(h1Addr, 3, ethers.ZeroHash); // HOLDER
    await (contract.connect(deployer) as any).registerParticipant(h2Addr, 3, ethers.ZeroHash); // HOLDER
    await (contract.connect(deployer) as any).registerParticipant(h3Addr, 3, ethers.ZeroHash); // HOLDER
    await (contract.connect(deployer) as any).registerParticipant(centreAddr, 4, ethers.ZeroHash); // CENTRE

    // Register P-256 public keys for holders
    const dummyKey = ethers.hexlify(ethers.concat([new Uint8Array([0x04]), ethers.randomBytes(64)]));
    await (contract.connect(holder1) as any).setEncryptionKey(dummyKey);
    await (contract.connect(holder2) as any).setEncryptionKey(dummyKey);
    await (contract.connect(holder3) as any).setEncryptionKey(dummyKey);

    // Create an Exam on-chain
    const latestBlock = await provider.getBlock("latest");
    const blockTime = Number(latestBlock!.timestamp);
    const releaseOpensAt = blockTime + 120;
    const examStartsAt = blockTime + 240;
    const examEndsAt = blockTime + 600;
    const metaHash = ethers.keccak256(ethers.toUtf8Bytes("exam-meta-1"));

    const examConfig = {
      metaHash,
      releaseOpensAt,
      examStartsAt,
      examEndsAt,
      threshold: 2,
      holders: [h1Addr, h2Addr, h3Addr],
      setters: [setterAddr],
      centres: [centreAddr],
      quotas: [2],
    };

    const createTx = await (contract.connect(authority) as any).createExam(examConfig);
    await createTx.wait();

    // Create in-memory DB and Indexer
    const { db, tables } = createInMemoryDb();
    const testConfig: Config = {
      PORT: 4000,
      NODE_ENV: "test",
      RPC_URL: "http://127.0.0.1:8545",
      CHAIN_ID: 31337,
      CONTRACT_ADDRESS: contractAddress,
      DEPLOY_BLOCK: 0,
      DATABASE_URL: "postgresql://mock",
      SESSION_SECRET: "secret-key-at-least-32-characters-long",
      FRONTEND_ORIGIN: "http://localhost:5173",
      BLOB_DIR: tempBlobDir,
    };

    const stateMgr = new IndexerStateManager(tempBlobDir);
    const indexer = new ExamVaultIndexer(testConfig, provider, db, stateMgr);

    // 1. Initial backfill
    const firstRun = await indexer.processToBlock();
    expect(firstRun.processedLogs).toBeGreaterThan(0);

    // Verify derived tables were updated from real events
    const exam = await db.exam.findUnique({ where: { examId: "1" } });
    expect(exam).toBeDefined();
    expect(exam.state).toBe(0); // Draft
    expect(exam.threshold).toBe(2);
    const registration = Array.from(tables.chainEvents.values()).find(
      (event) => event.type === "ParticipantRegistered"
    );
    expect(registration?.payloadJson).toEqual({
      account: authorityAddr,
      role: "1",
      profileHash: ethers.ZeroHash,
    });

    const panel = await db.panelMember.findMany();
    expect(panel.length).toBe(5); // 3 holders + 1 setter + 1 centre

    const part = await db.participant.findUnique({ where: { address: authorityAddr } });
    expect(part.roles).toContain("AUTHORITY");

    // Snapshot DB state
    const snapshotEvents = tables.chainEvents.size;
    const snapshotExams = tables.exams.size;
    const snapshotPanel = tables.panelMembers.size;
    const snapshotParticipants = tables.participants.size;

    // 2. IDEMPOTENCY TEST: Reset state manager back to 0 and re-run indexer over the same blocks
    stateMgr.setLastProcessedBlock(0);
    const replayRun = await indexer.processToBlock();
    expect(replayRun.processedLogs).toBe(firstRun.processedLogs);

    // Verify DB state is identical: no extra rows, no duplicates
    expect(tables.chainEvents.size).toBe(snapshotEvents);
    expect(tables.exams.size).toBe(snapshotExams);
    expect(tables.panelMembers.size).toBe(snapshotPanel);
    expect(tables.participants.size).toBe(snapshotParticipants);
  });

  it("should resume mid-backfill after kill-and-restart with no gaps or duplicates", async () => {
    const authorityAddr = await authority.getAddress();
    const setterAddr = await setter.getAddress();
    const h1Addr = await holder1.getAddress();
    const h2Addr = await holder2.getAddress();
    const h3Addr = await holder3.getAddress();
    const centreAddr = await centre.getAddress();

    // Register participants
    await (contract.connect(deployer) as any).registerParticipant(authorityAddr, 1, ethers.ZeroHash);
    await (contract.connect(deployer) as any).registerParticipant(setterAddr, 2, ethers.ZeroHash);
    await (contract.connect(deployer) as any).registerParticipant(h1Addr, 3, ethers.ZeroHash);
    await (contract.connect(deployer) as any).registerParticipant(h2Addr, 3, ethers.ZeroHash);
    await (contract.connect(deployer) as any).registerParticipant(h3Addr, 3, ethers.ZeroHash);
    await (contract.connect(deployer) as any).registerParticipant(centreAddr, 4, ethers.ZeroHash);

    const dummyKey = ethers.hexlify(ethers.concat([new Uint8Array([0x04]), ethers.randomBytes(64)]));
    await (contract.connect(holder1) as any).setEncryptionKey(dummyKey);
    await (contract.connect(holder2) as any).setEncryptionKey(dummyKey);
    await (contract.connect(holder3) as any).setEncryptionKey(dummyKey);

    const latest = await provider.getBlock("latest");
    const blockTime = Number(latest!.timestamp);
    const examConfig = {
      metaHash: ethers.keccak256(ethers.toUtf8Bytes("exam-meta-resume")),
      releaseOpensAt: blockTime + 120,
      examStartsAt: blockTime + 240,
      examEndsAt: blockTime + 600,
      threshold: 2,
      holders: [h1Addr, h2Addr, h3Addr],
      setters: [setterAddr],
      centres: [centreAddr],
      quotas: [2],
    };

    const createTx = await (contract.connect(authority) as any).createExam(examConfig);
    await createTx.wait();

    const { db, tables } = createInMemoryDb();
    const stateFileDir = fs.mkdtempSync(path.join(os.tmpdir(), "sigil-crash-test-"));
    const testConfig: Config = {
      PORT: 4000,
      NODE_ENV: "test",
      RPC_URL: "http://127.0.0.1:8545",
      CHAIN_ID: 31337,
      CONTRACT_ADDRESS: contractAddress,
      DEPLOY_BLOCK: 0,
      DATABASE_URL: "postgresql://mock",
      SESSION_SECRET: "secret-key-at-least-32-characters-long",
      FRONTEND_ORIGIN: "http://localhost:5173",
      BLOB_DIR: stateFileDir,
    };

    const latestBlock = await provider.getBlockNumber();
    const midBlock = Math.floor(latestBlock - 2);

    // 1. First indexer runs only up to midBlock (simulating crash midway)
    const stateMgr1 = new IndexerStateManager(stateFileDir);
    const indexer1 = new ExamVaultIndexer(testConfig, provider, db, stateMgr1);
    await indexer1.processToBlock(midBlock);

    const midEventCount = tables.chainEvents.size;
    expect(stateMgr1.getLastProcessedBlock(0)).toBe(midBlock);

    // 2. Restart: simulate new indexer instance booting up from crash
    const stateMgr2 = new IndexerStateManager(stateFileDir);
    expect(stateMgr2.getLastProcessedBlock(0)).toBe(midBlock); // Restored from persisted state!

    const indexer2 = new ExamVaultIndexer(testConfig, provider, db, stateMgr2);
    await indexer2.processToBlock(latestBlock);

    expect(stateMgr2.getLastProcessedBlock(0)).toBe(latestBlock);
    expect(tables.chainEvents.size).toBeGreaterThanOrEqual(midEventCount);

    // Ensure all chain events have unique (txHash, logIndex) keys with no duplicates
    const allEvents = await db.chainEvent.findMany();
    const uniqueKeys = new Set(allEvents.map((e: any) => `${e.txHash}_${e.logIndex}`));
    expect(uniqueKeys.size).toBe(allEvents.length);

    fs.rmSync(stateFileDir, { recursive: true, force: true });
  });

  it("should NOT confirm a pending batch when BatchSubmitted ciphertextHash mismatches", async () => {
    const authorityAddr = await authority.getAddress();
    const setterAddr = await setter.getAddress();
    const h1Addr = await holder1.getAddress();
    const h2Addr = await holder2.getAddress();
    const h3Addr = await holder3.getAddress();
    const centreAddr = await centre.getAddress();

    // Register participants
    await (contract.connect(deployer) as any).registerParticipant(authorityAddr, 1, ethers.ZeroHash);
    await (contract.connect(deployer) as any).registerParticipant(setterAddr, 2, ethers.ZeroHash);
    await (contract.connect(deployer) as any).registerParticipant(h1Addr, 3, ethers.ZeroHash);
    await (contract.connect(deployer) as any).registerParticipant(h2Addr, 3, ethers.ZeroHash);
    await (contract.connect(deployer) as any).registerParticipant(h3Addr, 3, ethers.ZeroHash);
    await (contract.connect(deployer) as any).registerParticipant(centreAddr, 4, ethers.ZeroHash);

    const dummyKey = ethers.hexlify(ethers.concat([new Uint8Array([0x04]), ethers.randomBytes(64)]));
    await (contract.connect(holder1) as any).setEncryptionKey(dummyKey);
    await (contract.connect(holder2) as any).setEncryptionKey(dummyKey);
    await (contract.connect(holder3) as any).setEncryptionKey(dummyKey);

    const latest = await provider.getBlock("latest");
    const blockTime = Number(latest!.timestamp);
    const examConfig = {
      metaHash: ethers.keccak256(ethers.toUtf8Bytes("exam-meta-batch")),
      releaseOpensAt: blockTime + 120,
      examStartsAt: blockTime + 240,
      examEndsAt: blockTime + 600,
      threshold: 2,
      holders: [h1Addr, h2Addr, h3Addr],
      setters: [setterAddr],
      centres: [centreAddr],
      quotas: [2],
    };

    const createTx = await (contract.connect(authority) as any).createExam(examConfig);
    await createTx.wait();

    const { db } = createInMemoryDb();
    const stateDir3 = fs.mkdtempSync(path.join(os.tmpdir(), "sigil-test3-"));
    const testConfig: Config = {
      PORT: 4000,
      NODE_ENV: "test",
      RPC_URL: "http://127.0.0.1:8545",
      CHAIN_ID: 31337,
      CONTRACT_ADDRESS: contractAddress,
      DEPLOY_BLOCK: 0,
      DATABASE_URL: "postgresql://mock",
      SESSION_SECRET: "secret-key-at-least-32-characters-long",
      FRONTEND_ORIGIN: "http://localhost:5173",
      BLOB_DIR: stateDir3,
    };

    const stateMgr = new IndexerStateManager(stateDir3);
    const indexer = new ExamVaultIndexer(testConfig, provider, db, stateMgr);

    // Seed a pending batch in the database with hash A
    const hashA = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const hashB = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    await db.batch.create({
      data: {
        examId: "1",
        sectionId: 0,
        ciphertextHash: hashA,
        status: "pending",
        questionCount: 2,
        startInSection: 0,
        setter: setterAddr,
        blobPath: "batch_a.bin",
      },
    });

    // Advance exam to Collecting so submitBatch is accepted on chain
    const dummyExamKey = ethers.hexlify(ethers.concat([new Uint8Array([0x04]), ethers.randomBytes(64)]));
    const openTx = await (contract.connect(authority) as any).openCollection(1, dummyExamKey);
    await openTx.wait();

    // Submit batch on chain with hash B (mismatched with hash A)
    const submitTx = await (contract.connect(setter) as any).submitBatch(1, 0, hashB, 2);
    await submitTx.wait();

    // Index events
    await indexer.processToBlock();

    // Verify: Batch with hash A must remain PENDING
    const batchA = await db.batch.findUnique({
      where: {
        examId_sectionId_ciphertextHash: {
          examId: "1",
          sectionId: 0,
          ciphertextHash: hashA,
        },
      },
    });
    expect(batchA).toBeDefined();
    expect(batchA.status).toBe("pending"); // DID NOT CONFIRM!

    // Batch with hash B was submitted and is CONFIRMED
    const batchB = await db.batch.findUnique({
      where: {
        examId_sectionId_ciphertextHash: {
          examId: "1",
          sectionId: 0,
          ciphertextHash: hashB,
        },
      },
    });
    expect(batchB).toBeDefined();
    expect(batchB.status).toBe("confirmed");

    fs.rmSync(stateDir3, { recursive: true, force: true });
  });

  it("should purge only >24h unconfirmed pending batches and leave fresh/confirmed batches", async () => {
    const { db } = createInMemoryDb();
    const purgeDir = fs.mkdtempSync(path.join(os.tmpdir(), "sigil-purge-test-"));

    const now = Date.now();
    const hours25Ago = new Date(now - 25 * 60 * 60 * 1000);
    const hours1Ago = new Date(now - 1 * 60 * 60 * 1000);

    // Create dummy files on disk
    const oldBlobPath = path.join(purgeDir, "old_pending.bin");
    const freshBlobPath = path.join(purgeDir, "fresh_pending.bin");
    fs.writeFileSync(oldBlobPath, "old cipher blob");
    fs.writeFileSync(freshBlobPath, "fresh cipher blob");

    // 1. Old pending batch (>24h ago)
    const bOld = await db.batch.create({
      data: {
        examId: "1",
        sectionId: 0,
        ciphertextHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
        status: "pending",
        questionCount: 1,
        startInSection: 0,
        setter: "0x0000000000000000000000000000000000000001",
        blobPath: oldBlobPath,
      },
    });
    bOld.createdAt = hours25Ago;

    // 2. Fresh pending batch (<24h ago)
    const bFresh = await db.batch.create({
      data: {
        examId: "1",
        sectionId: 1,
        ciphertextHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
        status: "pending",
        questionCount: 1,
        startInSection: 0,
        setter: "0x0000000000000000000000000000000000000001",
        blobPath: freshBlobPath,
      },
    });
    bFresh.createdAt = hours1Ago;

    // 3. Confirmed batch (>24h ago) - must NEVER be purged
    const bConfirmed = await db.batch.create({
      data: {
        examId: "1",
        sectionId: 2,
        ciphertextHash: "0x3333333333333333333333333333333333333333333333333333333333333333",
        status: "confirmed",
        questionCount: 1,
        startInSection: 0,
        setter: "0x0000000000000000000000000000000000000001",
        blobPath: "",
      },
    });
    bConfirmed.createdAt = hours25Ago;

    // Execute purge job
    const purgedCount = await purgeUnconfirmedBatches(db, purgeDir, 24 * 60 * 60 * 1000);
    expect(purgedCount).toBe(1);

    // Old pending batch row is deleted and blob is removed from disk
    expect(fs.existsSync(oldBlobPath)).toBe(false);

    // Fresh pending batch remains in DB and on disk
    expect(fs.existsSync(freshBlobPath)).toBe(true);
    const remainingBatches = await db.batch.findMany();
    const remainingIds = remainingBatches.map((b: any) => b.id);
    expect(remainingIds).toContain(bFresh.id);
    expect(remainingIds).toContain(bConfirmed.id);
    expect(remainingIds).not.toContain(bOld.id);

    fs.rmSync(purgeDir, { recursive: true, force: true });
  });
});

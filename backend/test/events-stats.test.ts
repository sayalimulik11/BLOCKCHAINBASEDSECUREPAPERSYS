import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { ethers } from "ethers";
import { schemas } from "@sigil/core";
import { createApp } from "../src/app.js";
import { parseConfig } from "../src/config.js";

const { indexedEvents, panelMembers } = vi.hoisted(() => ({
  indexedEvents: [] as any[],
  panelMembers: [] as any[],
}));
const indexedExam = { examId: "1", state: 1 };

vi.mock("../src/db.js", () => ({
  prisma: {
    chainEvent: {
      count: vi.fn().mockResolvedValue(7),
      findMany: vi.fn().mockImplementation(async (query: any) => {
        if (query.select) return indexedEvents;
        const rows = indexedEvents.filter((event) => {
          const where = query.where || {};
          if (where.examId !== undefined && event.examId !== where.examId) return false;
          if (where.type !== undefined && typeof where.type === "string" && event.type !== where.type) return false;
          if (where.actor !== undefined && event.actor !== where.actor) return false;
          if (where.blockTimestamp?.gte !== undefined && event.blockTimestamp < where.blockTimestamp.gte) return false;
          if (where.blockTimestamp?.lte !== undefined && event.blockTimestamp > where.blockTimestamp.lte) return false;
          if (where.OR) {
            const afterCursor = where.OR.some((condition: any) =>
              condition.blockNumber?.lt !== undefined
                ? event.blockNumber < condition.blockNumber.lt
                : event.blockNumber === condition.blockNumber &&
                  event.logIndex < condition.logIndex.lt
            );
            if (!afterCursor) return false;
          }
          return true;
        });
        rows.sort((a, b) =>
          a.blockNumber === b.blockNumber
            ? b.logIndex - a.logIndex
            : a.blockNumber > b.blockNumber
              ? -1
              : 1
        );
        return rows.slice(0, query.take);
      }),
    },
    exam: {
      count: vi.fn().mockResolvedValue(3),
      groupBy: vi.fn().mockResolvedValue([
        { state: 1, _count: { _all: 1 } },
        { state: 3, _count: { _all: 2 } },
      ]),
      findUnique: vi.fn().mockImplementation(async ({ where }: any) =>
        where.examId === indexedExam.examId ? indexedExam : null
      ),
    },
    batch: {
      groupBy: vi.fn().mockResolvedValue([
        { status: "pending", _count: { _all: 1 } },
        { status: "confirmed", _count: { _all: 2 } },
      ]),
    },
    participant: {
      findMany: vi.fn().mockResolvedValue([
        { roles: ["AUTHORITY"] },
        { roles: ["SETTER", "HOLDER"] },
        { roles: ["HOLDER", "AUDITOR"] },
      ]),
    },
    panelMember: {
      findMany: vi.fn().mockResolvedValue(panelMembers),
    },
  },
}));

describe("Events and dashboard stats (BE-08)", () => {
  const authority = ethers.Wallet.createRandom();
  const holder1 = ethers.Wallet.createRandom();
  const holder2 = ethers.Wallet.createRandom();
  const setter1 = ethers.Wallet.createRandom();
  const setter2 = ethers.Wallet.createRandom();

  const config = parseConfig({
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
    hasRole: vi.fn().mockImplementation(async (role: string, address: string) => {
      return (
        role === ethers.id("AUTHORITY_ROLE") &&
        ethers.getAddress(address) === authority.address
      );
    }),
  } as any;

  async function createAgent(wallet = authority) {
    const agent = request.agent(createApp(config, undefined, contract));
    const nonce = (await agent.get("/api/auth/nonce")).body.nonce;
    const { SiweMessage } = await import("siwe");
    const siwe = new SiweMessage({
      domain: "localhost:5173",
      address: wallet.address,
      statement: "Sign in",
      uri: "http://localhost:5173",
      version: "1",
      chainId: 31337,
      nonce,
      issuedAt: new Date().toISOString(),
    });
    const message = siwe.prepareMessage();
    await agent.post("/api/auth/verify").send({
      message,
      signature: await wallet.signMessage(message),
    });
    return agent;
  }

  beforeEach(() => {
    indexedEvents.splice(0, indexedEvents.length,
      { id: "e1", blockNumber: 10n, logIndex: 0, txHash: `0x${"11".repeat(32)}`, examId: "1", type: "ExamCreated", actor: authority.address, payloadJson: {}, blockTimestamp: 1000n },
      { id: "e2", blockNumber: 10n, logIndex: 1, txHash: `0x${"22".repeat(32)}`, examId: "1", type: "BatchSubmitted", actor: setter1.address, payloadJson: {}, blockTimestamp: 1001n },
      { id: "e3", blockNumber: 11n, logIndex: 0, txHash: `0x${"33".repeat(32)}`, examId: "1", type: "BatchSubmitted", actor: setter1.address, payloadJson: {}, blockTimestamp: 1002n },
      { id: "e4", blockNumber: 11n, logIndex: 1, txHash: `0x${"44".repeat(32)}`, examId: "2", type: "RandomnessCommitted", actor: holder1.address, payloadJson: {}, blockTimestamp: 1003n },
      { id: "e5", blockNumber: 12n, logIndex: 0, txHash: `0x${"55".repeat(32)}`, examId: "1", type: "BatchSubmitted", actor: setter2.address, payloadJson: {}, blockTimestamp: 1004n },
      { id: "e6", blockNumber: 9n, logIndex: 0, txHash: `0x${"66".repeat(32)}`, examId: null, type: "EncryptionKeySet", actor: holder1.address, payloadJson: {}, blockTimestamp: 999n },
      { id: "e7", blockNumber: 10n, logIndex: 2, txHash: `0x${"77".repeat(32)}`, examId: "1", type: "RandomnessCommitted", actor: holder1.address, payloadJson: {}, blockTimestamp: 1001n },
    );
    panelMembers.splice(0, panelMembers.length,
      { examId: "1", address: holder1.address, kind: "holder" },
      { examId: "1", address: holder2.address, kind: "holder" },
      { examId: "1", address: setter1.address, kind: "setter" },
      { examId: "1", address: setter2.address, kind: "setter" },
    );
  });

  it("combines event filters and paginates stably by block number then log index", async () => {
    const app = createApp(config, undefined, contract);
    const filtered = await request(app)
      .get("/api/events")
      .query({
        exam: "1",
        type: "BatchSubmitted",
        actor: setter1.address,
        from: "1001",
        to: "1002",
      });
    expect(filtered.status).toBe(200);
    expect(filtered.body.events.map((event: any) => event.id)).toEqual(["e3", "e2"]);
    expect(schemas.EventsResponseSchema.safeParse(filtered.body).success).toBe(true);

    const firstPage = await request(app).get("/api/events").query({ limit: "2" });
    expect(firstPage.body.events.map((event: any) => event.id)).toEqual(["e5", "e4"]);
    expect(firstPage.body.nextCursor).toBeTruthy();
    const secondPage = await request(app)
      .get("/api/events")
      .query({ limit: "2", cursor: firstPage.body.nextCursor });
    expect(secondPage.body.events.map((event: any) => event.id)).toEqual(["e3", "e7"]);
    expect(secondPage.body.nextCursor).toBeTruthy();
    const finalPage = await request(app)
      .get("/api/events")
      .query({ limit: "2", cursor: secondPage.body.nextCursor });
    expect(finalPage.body.events.map((event: any) => event.id)).toEqual(["e2", "e1"]);
    expect(finalPage.body.nextCursor).toBeTruthy();
    const lastPage = await request(app)
      .get("/api/events")
      .query({ limit: "2", cursor: finalPage.body.nextCursor });
    expect(lastPage.body.events.map((event: any) => event.id)).toEqual(["e6"]);
    expect(lastPage.body.nextCursor).toBeNull();
  });

  it("returns legacy positional event payloads as objects keyed by ABI argument names", async () => {
    const payloadJson = [authority.address, "1", ethers.ZeroHash];
    indexedEvents[0] = {
      ...indexedEvents[0],
      type: "ParticipantRegistered",
      payloadJson,
    };

    const response = await request(createApp(config, undefined, contract)).get("/api/events");
    const event = response.body.events.find(
      (item: any) => item.type === "ParticipantRegistered"
    );

    expect(event.payloadJson).toEqual({
      account: authority.address,
      role: "1",
      profileHash: ethers.ZeroHash,
    });
    expect(schemas.ChainEventResponseSchema.safeParse(event).success).toBe(true);
  });

  it("rejects invalid pagination and time range edge cases", async () => {
    const app = createApp(config, undefined, contract);
    expect((await request(app).get("/api/events?limit=0")).body.error.code).toBe("INVALID_LIMIT");
    expect((await request(app).get("/api/events?limit=101")).body.error.code).toBe("INVALID_LIMIT");
    expect((await request(app).get("/api/events?cursor=not-a-cursor")).body.error.code).toBe("INVALID_CURSOR");
    expect((await request(app).get("/api/events?from=2000&to=1000")).body.error.code).toBe("INVALID_FILTER");
    expect((await request(app).get("/api/events?from=not-a-date")).body.error.code).toBe("INVALID_FILTER");
  });

  it("returns indexed overview counts and indexed-only readiness steps", async () => {
    const agent = await createAgent();
    const overview = await agent.get("/api/stats/overview");
    expect(overview.status).toBe(200);
    expect(overview.body.totalExams).toBe(3);
    expect(overview.body.examsByState.collecting).toBe(1);
    expect(overview.body.examsByState.released).toBe(2);
    expect(overview.body.totalEvents).toBe(7);
    expect(overview.body.batchesByStatus).toEqual({ pending: 1, confirmed: 2 });
    expect(overview.body.participantsByRole.HOLDER).toBe(2);
    expect(schemas.StatsOverviewResponseSchema.safeParse(overview.body).success).toBe(true);

    const readiness = await agent.get("/api/stats/exams/1/readiness");
    expect(readiness.status).toBe(200);
    expect(readiness.body.holders).toEqual([
      {
        address: holder1.address,
        steps: { keyRegistered: true, randomnessCommitted: true },
      },
      {
        address: holder2.address,
        steps: { keyRegistered: false, randomnessCommitted: false },
      },
    ]);
    expect(readiness.body.setters.map((setter: any) => setter.steps.batchCount)).toEqual([2, 1]);
    expect(readiness.body.notTrackedByServer).toEqual(["shareVerified"]);
    expect(schemas.ExamReadinessResponseSchema.safeParse(readiness.body).success).toBe(true);
  });

  it("requires authentication for stats and validates readiness exam ids", async () => {
    const app = createApp(config, undefined, contract);
    expect((await request(app).get("/api/stats/overview")).status).toBe(401);
    const agent = await createAgent();
    expect((await agent.get("/api/stats/exams/not-a-number/readiness")).status).toBe(400);
    expect((await agent.get("/api/stats/exams/999/readiness")).status).toBe(404);
  });
});

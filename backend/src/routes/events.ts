import { Router, type Request, type Response } from "express";
import { ethers } from "ethers";
import { ExamVaultABI } from "@sigil/contracts-types";
import { schemas } from "@sigil/core";
import { prisma } from "../db.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const eventInterface = new ethers.Interface(ExamVaultABI);

interface EventCursor {
  blockNumber: bigint;
  logIndex: number;
}

function parseTimestamp(value: string): bigint | null {
  if (/^\d+$/.test(value)) return BigInt(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return BigInt(Math.floor(date.getTime() / 1000));
}

function parseCursor(value: string): EventCursor | null {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      !("blockNumber" in decoded) ||
      !("logIndex" in decoded) ||
      typeof decoded.blockNumber !== "string" ||
      !/^\d+$/.test(decoded.blockNumber) ||
      typeof decoded.logIndex !== "number" ||
      !Number.isSafeInteger(decoded.logIndex) ||
      decoded.logIndex < 0
    ) {
      return null;
    }
    return { blockNumber: BigInt(decoded.blockNumber), logIndex: decoded.logIndex };
  } catch {
    return null;
  }
}

function encodeCursor(event: { blockNumber: bigint; logIndex: number }): string {
  return Buffer.from(
    JSON.stringify({ blockNumber: event.blockNumber.toString(), logIndex: event.logIndex })
  ).toString("base64url");
}

function normalizeEventPayload(type: string, payload: unknown): unknown {
  if (!Array.isArray(payload)) return payload;

  const fragment = eventInterface.getEvent(type);
  if (!fragment || fragment.inputs.length !== payload.length) {
    throw new Error(`Cannot normalize payload for ${type}`);
  }

  return Object.fromEntries(
    fragment.inputs.map((input, index) => [input.name, payload[index]])
  );
}

export function createEventsRouter() {
  const router = Router();

  router.get("/events", async (req: Request, res: Response) => {
    const parsedQuery = schemas.EventsQuerySchema.strict().safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json({
        error: { code: "INVALID_FILTER", message: "Invalid event query parameters", details: parsedQuery.error.issues },
      });
    }
    const query = parsedQuery.data;
    const examId = query.exam;
    const type = query.type;
    const actorInput = query.actor;
    const fromInput = query.from;
    const toInput = query.to;
    const limitInput = query.limit;
    const cursorInput = query.cursor;
    if (
      ["exam", "type", "actor", "from", "to", "limit", "cursor"].some(
        (key) => req.query[key] !== undefined && typeof req.query[key] !== "string"
      )
    ) {
      return res.status(400).json({
        error: { code: "INVALID_FILTER", message: "Each query parameter must be provided once as text" },
      });
    }

    let actor: string | undefined;
    if (actorInput !== undefined) {
      try {
        actor = ethers.getAddress(actorInput);
      } catch {
        return res.status(400).json({
          error: { code: "INVALID_FILTER", message: "actor must be a valid Ethereum address" },
        });
      }
    }

    const from = fromInput === undefined ? undefined : parseTimestamp(fromInput);
    const to = toInput === undefined ? undefined : parseTimestamp(toInput);
    if ((fromInput !== undefined && from === null) || (toInput !== undefined && to === null)) {
      return res.status(400).json({
        error: {
          code: "INVALID_FILTER",
          message: "from and to must be Unix seconds or ISO-8601 timestamps",
        },
      });
    }
    if (from !== undefined && from !== null && to !== undefined && to !== null && from > to) {
      return res.status(400).json({
        error: { code: "INVALID_FILTER", message: "from must be less than or equal to to" },
      });
    }

    const limit = limitInput === undefined ? DEFAULT_LIMIT : Number(limitInput);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      return res.status(400).json({
        error: {
          code: "INVALID_LIMIT",
          message: `limit must be an integer between 1 and ${MAX_LIMIT}`,
        },
      });
    }

    const cursor = cursorInput === undefined ? undefined : parseCursor(cursorInput);
    if (cursorInput !== undefined && !cursor) {
      return res.status(400).json({
        error: { code: "INVALID_CURSOR", message: "cursor is not a valid event cursor" },
      });
    }

    const where: Record<string, unknown> = {};
    if (examId !== undefined) where.examId = examId;
    if (type !== undefined) where.type = type;
    if (actor !== undefined) where.actor = actor;
    if (
      (from !== undefined && from !== null) ||
      (to !== undefined && to !== null)
    ) {
      where.blockTimestamp = {
        ...(from !== undefined && from !== null ? { gte: from } : {}),
        ...(to !== undefined && to !== null ? { lte: to } : {}),
      };
    }
    if (cursor) {
      where.OR = [
        { blockNumber: { lt: cursor.blockNumber } },
        { blockNumber: cursor.blockNumber, logIndex: { lt: cursor.logIndex } },
      ];
    }

    try {
      const records = await prisma.chainEvent.findMany({
        where,
        orderBy: [{ blockNumber: "desc" }, { logIndex: "desc" }],
        take: limit + 1,
      });
      const hasMore = records.length > limit;
      const page = hasMore ? records.slice(0, limit) : records;
      const events = page.map((event: any) => ({
        ...event,
        blockNumber: event.blockNumber.toString(),
        payloadJson: normalizeEventPayload(event.type, event.payloadJson),
        blockTimestamp: event.blockTimestamp.toString(),
      }));
      const lastEvent = page.at(-1);

      return res.status(200).json(schemas.EventsResponseSchema.parse({
        events,
        nextCursor: hasMore && lastEvent ? encodeCursor(lastEvent) : null,
      }));
    } catch {
      return res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Failed to retrieve indexed events" },
      });
    }
  });

  return router;
}

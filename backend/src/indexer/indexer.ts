import { ethers } from "ethers";
import type { Provider } from "ethers";
import { ExamVaultABI } from "@sigil/contracts-types";
import { logger } from "../logger.js";
import { IndexerStateManager } from "./state.js";
import { handleEvent } from "./handlers.js";
import type { Config } from "../config.js";

function serializeArgs(args: any): any {
  if (typeof args === "bigint") return args.toString();
  if (args === null || args === undefined) return args;
  if (Array.isArray(args)) {
    if (typeof args.toObject === "function") {
      return serializeArgs(args.toObject());
    }
    return args.map(serializeArgs);
  }
  if (typeof args === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(args)) {
      if (!/^\d+$/.test(k)) {
        out[k] = serializeArgs(v);
      }
    }
    return out;
  }
  return args;
}

export class ExamVaultIndexer {
  private iface: ethers.Interface;
  private stateManager: IndexerStateManager;
  private isRunning = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private isProcessingLock = false;

  constructor(
    private cfg: Config,
    private provider: Provider,
    private prisma: any,
    customStateManager?: IndexerStateManager
  ) {
    this.iface = new ethers.Interface(ExamVaultABI);
    this.stateManager =
      customStateManager || new IndexerStateManager(cfg.BLOB_DIR);
  }

  public getStateManager(): IndexerStateManager {
    return this.stateManager;
  }

  /**
   * Processes all blocks from last processed block up to target block (or latest block).
   * Safe to call repeatedly (idempotent).
   */
  public async processToBlock(targetBlock?: number): Promise<{
    processedLogs: number;
    fromBlock: number;
    toBlock: number;
  }> {
    let latest: number;
    if (targetBlock !== undefined) {
      latest = targetBlock;
    } else if (typeof (this.provider as any).send === "function") {
      const hexBlock = await (this.provider as any).send("eth_blockNumber", []);
      latest = Number(hexBlock);
    } else {
      latest = await this.provider.getBlockNumber();
    }
    let lastProcessed = this.stateManager.getLastProcessedBlock(
      this.cfg.DEPLOY_BLOCK
    );

    // Reorg / Chain reset detection (common in local Hardhat nodes upon restart)
    if (latest < lastProcessed) {
      logger.warn(
        `Chain block height ${latest} is less than lastProcessedBlock ${lastProcessed}. Resetting to DEPLOY_BLOCK ${this.cfg.DEPLOY_BLOCK}`
      );
      lastProcessed = this.cfg.DEPLOY_BLOCK;
      this.stateManager.setLastProcessedBlock(lastProcessed);
    }

    if (latest <= lastProcessed) {
      return { processedLogs: 0, fromBlock: lastProcessed, toBlock: latest };
    }

    const fromBlock = lastProcessed === 0 ? 0 : lastProcessed + 1;
    const toBlock = latest;

    const logs = await this.provider.getLogs({
      address: this.cfg.CONTRACT_ADDRESS,
      fromBlock,
      toBlock,
    });

    const blockTimestamps = new Map<number, bigint>();
    async function getBlockTime(bNum: number, prov: Provider): Promise<bigint> {
      if (blockTimestamps.has(bNum)) return blockTimestamps.get(bNum)!;
      try {
        const b = await prov.getBlock(bNum);
        const t = BigInt(b?.timestamp || Math.floor(Date.now() / 1000));
        blockTimestamps.set(bNum, t);
        return t;
      } catch {
        return BigInt(Math.floor(Date.now() / 1000));
      }
    }

    // Process all logs and state updates inside a single transactional batch
    await this.prisma.$transaction(async (tx: any) => {
      for (const log of logs) {
        let parsed: ethers.LogDescription | null = null;
        try {
          parsed = this.iface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
        } catch {
          // Unrecognized event log, ignore
          continue;
        }

        if (!parsed) continue;

        const timestamp = await getBlockTime(log.blockNumber, this.provider);
        const examIdStr = parsed.args.examId
          ? parsed.args.examId.toString()
          : null;
        const actor =
          parsed.args.account ||
          parsed.args.setter ||
          parsed.args.holder ||
          parsed.args.authority ||
          parsed.args.auditor ||
          parsed.args.centre ||
          null;

        const payloadJson = serializeArgs(parsed.args);

        // Idempotently record ChainEvent
        await tx.chainEvent.upsert({
          where: {
            txHash_logIndex: {
              txHash: log.transactionHash,
              logIndex: log.index,
            },
          },
          create: {
            blockNumber: BigInt(log.blockNumber),
            logIndex: log.index,
            txHash: log.transactionHash,
            examId: examIdStr,
            type: parsed.name,
            actor: actor ? ethers.getAddress(actor) : null,
            payloadJson,
            blockTimestamp: timestamp,
          },
          update: {
            blockNumber: BigInt(log.blockNumber),
            examId: examIdStr,
            type: parsed.name,
            actor: actor ? ethers.getAddress(actor) : null,
            payloadJson,
            blockTimestamp: timestamp,
          },
        });

        // Dispatch to derived table handler
        await handleEvent(parsed, log, tx, this.cfg);
      }
    });

    // Update state manager after transaction successfully commits
    this.stateManager.setLastProcessedBlock(toBlock);

    return { processedLogs: logs.length, fromBlock, toBlock };
  }

  /**
   * Backfills events from DEPLOY_BLOCK to current block.
   */
  public async backfill(): Promise<{
    processedLogs: number;
    fromBlock: number;
    toBlock: number;
  }> {
    return this.processToBlock();
  }

  /**
   * Starts periodic polling for live events.
   */
  public async start(intervalMs = 2000): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // Run initial backfill
    try {
      await this.backfill();
    } catch (err: any) {
      logger.error(`Initial indexer backfill error: ${err.message}`);
    }

    this.pollTimer = setInterval(async () => {
      if (this.isProcessingLock || !this.isRunning) return;
      this.isProcessingLock = true;
      try {
        await this.processToBlock();
      } catch (err: any) {
        logger.error(`Indexer poll cycle error: ${err.message}`);
      } finally {
        this.isProcessingLock = false;
      }
    }, intervalMs);
  }

  /**
   * Stops the live event polling.
   */
  public stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}

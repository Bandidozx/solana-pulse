// Monitor: subscribe to on-chain logs, fetch the full transaction, parse flows,
// evaluate rules and dispatch alerts.
//
// Two things matter for staying responsive on a busy chain:
//   1) bounded concurrency - we never fire unbounded getParsedTransaction calls
//   2) a drop-oldest queue - a slow RPC can't grow memory without limit

import { Connection, PublicKey } from '@solana/web3.js';
import { parseTransaction } from './parse.js';
import { evaluate, Deduper } from './rules.js';

const MAX_CONCURRENCY = Number(process.env.MAX_CONCURRENCY || 6);
const QUEUE_CAP = Number(process.env.QUEUE_CAP || 2000);
const SAMPLE_RATE = Number(process.env.SAMPLE_RATE || 1); // 1 = all; lower to survive public RPC

export function createMonitor(cfg, log, notifier, onAlert = () => {}) {
  const connection = new Connection(cfg.rpcUrl, {
    commitment: cfg.commitment,
    wsEndpoint: cfg.wsUrl,
  });
  const dedup = new Deduper(60_000);
  const queue = [];
  let inflight = 0;
  let subIds = [];
  let stopped = false;

  const stats = { startedAt: Date.now(), txs: 0, alerts: 0, errors: 0, dropped: 0 };
  let cooldownUntil = 0;

  function enqueue(signature) {
    if (queue.length >= QUEUE_CAP) {
      queue.shift();
      stats.dropped += 1;
    }
    queue.push(signature);
    pump();
  }

  function pump() {
    if (Date.now() < cooldownUntil) {
      setTimeout(pump, Math.min(cooldownUntil - Date.now(), 2000));
      return;
    }
    while (inflight < MAX_CONCURRENCY && queue.length) {
      const sig = queue.shift();
      inflight += 1;
      processSignature(sig).finally(() => {
        inflight -= 1;
        if (queue.length) pump();
      });
    }
  }

  async function processSignature(signature) {
    try {
      const tx = await connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: cfg.commitment,
      });
      if (!tx) return;
      stats.txs += 1;
      const flow = parseTransaction(tx);
      for (const a of evaluate(flow, cfg)) {
        if (!dedup.fresh(a)) continue;
        const alert = { ...a, signature, slot: flow.slot, blockTime: flow.blockTime, ts: Date.now() };
        stats.alerts += 1;
        await notifier.dispatch(alert);
        onAlert(alert);
      }
    } catch (e) {
      stats.errors += 1;
      const msg = String(e?.message || e);
      if (msg.includes('429') || /Too Many Requests/i.test(msg)) {
        // Back off against the RPC instead of hammering it into the ground.
        cooldownUntil = Date.now() + 1500;
        log.debug('429 from RPC, cooling down');
      } else {
        log.debug('tx fetch failed:', msg);
      }
    }
  }

  function subscribe() {
    for (const programId of cfg.watchedPrograms) {
      const id = connection.onLogs(
        new PublicKey(programId),
        ({ signature, err }) => {
          if (err) return;
          if (SAMPLE_RATE < 1 && Math.random() > SAMPLE_RATE) return;
          enqueue(signature);
        },
        cfg.commitment,
      );
      subIds.push(id);
      log.info(`watching program ${programId} (sub ${id})`);
    }
  }

  return {
    connection,
    stats,
    async start() {
      try {
        const version = await connection.getVersion();
        log.info(`connected to ${cfg.rpcUrl} (core ${version['solana-core']})`);
      } catch (e) {
        log.warn('getVersion failed, continuing:', e.message);
      }
      subscribe();

      const health = setInterval(async () => {
        if (stopped) return;
        try { await connection.getSlot(); } catch (e) { log.debug('slot check failed:', e.message); }
      }, 60_000);
      health.unref?.();
    },
    async stop() {
      stopped = true;
      for (const id of subIds) {
        try { await connection.removeOnLogsListener(id); } catch { /* ignore */ }
      }
      subIds = [];
    },
    enqueue, // exported for tests / manual backfill
  };
}

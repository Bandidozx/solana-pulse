// Rules turn parsed flows into alerts. Keeping them as small pure functions
// makes them unit-testable without any network.

import { lamportsToSol, formatUnits } from './parse.js';

const abs = (v) => (v < 0n ? -v : v);

/**
 * @param {ReturnType<import('./parse.js').parseTransaction>} flow
 * @param {object} cfg  { solWhaleLamports, tokenWhaleUi, trackedMints }
 * @returns {Array<{kind:string, severity:'info'|'high', title:string, amount:string, raw:string,
 *                  account:string|null, mint:string|null, direction:'in'|'out'}>}
 */
export function evaluate(flow, cfg) {
  const alerts = [];

  for (const m of flow.sol) {
    const mag = abs(m.delta);
    if (mag >= BigInt(cfg.solWhaleLamports)) {
      alerts.push({
        kind: 'sol_whale',
        severity: 'high',
        title: `${lamportsToSol(mag)} SOL move`,
        amount: lamportsToSol(mag),
        raw: mag.toString(),
        account: m.account,
        mint: null,
        direction: m.delta > 0n ? 'in' : 'out',
      });
    }
  }

  for (const t of flow.tokens) {
    if (cfg.trackedMints.length && !cfg.trackedMints.includes(t.mint)) continue;
    const mag = abs(t.delta);
    const ui = Number(formatUnits(mag, t.decimals));
    if (ui >= cfg.tokenWhaleUi) {
      alerts.push({
        kind: 'token_whale',
        severity: 'high',
        title: `${formatUnits(mag, t.decimals)} tokens move`,
        amount: formatUnits(mag, t.decimals),
        raw: mag.toString(),
        account: t.owner,
        mint: t.mint,
        direction: t.delta > 0n ? 'in' : 'out',
      });
    }
  }

  return alerts;
}

// Same account/tx/amount within a short window shouldn't fire twice.
export class Deduper {
  constructor(ttlMs = 60_000) { this.ttl = ttlMs; this.seen = new Map(); }
  key(a) { return `${a.kind}:${a.account}:${a.mint}:${a.raw}`; }
  fresh(a, now = Date.now()) {
    const k = this.key(a);
    const last = this.seen.get(k);
    if (last !== undefined && now - last < this.ttl) return false;
    this.seen.set(k, now);
    if (this.seen.size > 5000) {
      for (const [kk, ts] of this.seen) if (now - ts > this.ttl) this.seen.delete(kk);
    }
    return true;
  }
}

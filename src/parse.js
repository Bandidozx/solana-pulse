// Turn a parsed Solana transaction into normalized flows we can reason about.
// We rely on meta.preBalances/postBalances and preTokenBalances/postTokenBalances,
// which are populated for every transaction and don't require decoding each
// instruction. That keeps this robust across programs.

const toBig = (v) => {
  try { return BigInt(v ?? 0); } catch { return 0n; }
};

/**
 * @param {any} tx  result of connection.getParsedTransaction(sig, {maxSupportedTransactionVersion:0})
 * @returns {{signature:string, slot:number|null, blockTime:number|null, fee:number,
 *            sol:Array<{account:string,delta:bigint}>,
 *            tokens:Array<{owner:string|null,mint:string,decimals:number,delta:bigint}>}}
 */
export function parseTransaction(tx) {
  const meta = tx?.meta;
  const message = tx?.transaction?.message;
  const keys = (message?.accountKeys || []).map((k) => (typeof k === 'string' ? k : k.pubkey));

  const out = {
    signature: tx?.transaction?.signatures?.[0] || '',
    slot: tx?.slot ?? null,
    blockTime: tx?.blockTime ?? null,
    fee: meta?.fee ?? 0,
    sol: [],
    tokens: [],
  };

  if (!meta) return out;

  // --- native SOL flows -----------------------------------------------------
  const pre = meta.preBalances || [];
  const post = meta.postBalances || [];
  for (let i = 0; i < post.length; i++) {
    const delta = BigInt(post[i] ?? 0) - BigInt(pre[i] ?? 0);
    if (delta === 0n) continue;
    out.sol.push({ account: keys[i] || String(i), delta });
  }

  // --- SPL token flows ------------------------------------------------------
  const keyOf = (b) => `${b.accountIndex}:${b.mint}`;
  const before = new Map((meta.preTokenBalances || []).map((b) => [keyOf(b), b]));
  const after = new Map((meta.postTokenBalances || []).map((b) => [keyOf(b), b]));
  const seen = new Set([...before.keys(), ...after.keys()]);

  for (const k of seen) {
    const a = before.get(k);
    const b = after.get(k);
    const ref = b || a;
    const delta = toBig(b?.uiTokenAmount?.amount) - toBig(a?.uiTokenAmount?.amount);
    if (delta === 0n) continue;
    out.tokens.push({
      owner: ref?.owner ?? null,
      mint: ref?.mint ?? '',
      decimals: ref?.uiTokenAmount?.decimals ?? 0,
      delta,
    });
  }

  return out;
}

// Format a bigint token amount (raw units) into a human decimal string.
export function formatUnits(raw, decimals) {
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const s = abs.toString().padStart(decimals + 1, '0');
  const head = s.slice(0, s.length - decimals) || '0';
  const tail = decimals ? s.slice(s.length - decimals) : '';
  const trimmed = tail.replace(/0+$/, '');
  return `${neg ? '-' : ''}${head}${trimmed ? '.' + trimmed : ''}`;
}

export function lamportsToSol(l) {
  return formatUnits(BigInt(l), 9);
}

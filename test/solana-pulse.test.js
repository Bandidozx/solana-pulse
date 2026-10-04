import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTransaction, formatUnits, lamportsToSol } from '../src/parse.js';
import { evaluate, Deduper } from '../src/rules.js';

// A synthetic parsed transaction: 120 SOL moved from A to B, 2,500,000 USDC moved.
function fixture() {
  return {
    slot: 100,
    blockTime: 1_700_000_000,
    meta: {
      fee: 5000,
      preBalances: [200_000_000_000, 10_000_000_000],
      postBalances: [79_995_000_000, 130_000_000_000],
      preTokenBalances: [{ accountIndex: 1, mint: 'USDC', owner: 'A', uiTokenAmount: { amount: '0', decimals: 6 } }],
      postTokenBalances: [{ accountIndex: 1, mint: 'USDC', owner: 'A', uiTokenAmount: { amount: '5000000000000', decimals: 6 } }],
    },
    transaction: {
      signatures: ['SIG1'],
      message: { accountKeys: ['A', 'B'] },
    },
  };
}

test('parseTransaction extracts SOL and token deltas', () => {
  const flow = parseTransaction(fixture());
  assert.equal(flow.signature, 'SIG1');
  assert.equal(flow.sol.length, 2);
  // A loses 120 SOL (and pays fee), B gains 120 SOL
  assert.equal(flow.sol[0].delta, -120_005_000_000n);
  assert.equal(flow.sol[1].delta, 120_000_000_000n);
  assert.equal(flow.tokens.length, 1);
  assert.equal(flow.tokens[0].delta, 5_000_000_000_000n);
  assert.equal(flow.tokens[0].mint, 'USDC');
});

test('formatUnits / lamportsToSol format raw amounts', () => {
  assert.equal(formatUnits(2_500_000n, 6), '2.5');
  assert.equal(formatUnits(1_000_000n, 6), '1');
  assert.equal(formatUnits(123456789n, 9), '0.123456789');
  assert.equal(lamportsToSol(120_000_000_000n), '120');
});

test('evaluate fires on SOL whale and token whale', () => {
  const flow = parseTransaction(fixture());
  const alerts = evaluate(flow, { solWhaleLamports: 100e9, tokenWhaleUi: 1_000_000, trackedMints: [] });
  const kinds = alerts.map((a) => a.kind).sort();
  assert.deepEqual(kinds, ['sol_whale', 'sol_whale', 'token_whale']);
  const sol = alerts.find((a) => a.kind === 'sol_whale' && a.direction === 'out');
  assert.equal(sol.amount, '120.005');
});

test('evaluate respects trackedMints filter', () => {
  const flow = parseTransaction(fixture());
  const alerts = evaluate(flow, { solWhaleLamports: 999e9, tokenWhaleUi: 1_000_000, trackedMints: ['OTHER'] });
  assert.equal(alerts.length, 0);
});

test('evaluate ignores sub-threshold transfers', () => {
  const flow = { signature: 'x', sol: [{ account: 'A', delta: 5_000_000_000n }], tokens: [] };
  const alerts = evaluate(flow, { solWhaleLamports: 100e9, tokenWhaleUi: 1_000_000, trackedMints: [] });
  assert.equal(alerts.length, 0);
});

test('Deduper suppresses repeats within the window', () => {
  const d = new Deduper(1000);
  const a = { kind: 'sol_whale', account: 'A', mint: null, raw: '120005000000' };
  assert.equal(d.fresh(a, 0), true);
  assert.equal(d.fresh(a, 500), false);
  assert.equal(d.fresh(a, 2000), true);
});

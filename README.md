# solana-pulse

Real-time Solana on-chain monitor. It subscribes to program logs, pulls the full
transaction, turns balance deltas into normalized flows (native SOL + SPL tokens),
runs them through rules, and fans alerts out to a terminal, a webhook, Telegram,
and a live SSE dashboard.

Built for the **Colosseum Crypto World's Fair x Solami** sidetrack: "Build something
live on Solana data".

## What it does

- Subscribes to `onLogs` for a configurable set of programs (default: SPL Token).
- Fetches each transaction and computes SOL + token balance deltas from
  `meta.preBalances` / `postBalances` and `preTokenBalances` / `postTokenBalances`.
  This is robust across programs, no instruction decoding required.
- Fires alerts when a transfer crosses a threshold (SOL whale / token whale),
  optionally filtered to specific mints.
- Deduplicates repeated alerts in a time window.
- Delivers to stdout, an HTTP webhook, and Telegram, and streams everything to a
  browser dashboard over Server-Sent Events.

## Quick start

```bash
npm install
npm start
# dashboard: http://localhost:8787
```

Runs against public mainnet by default. For production, point it at Solami's RPC
and gRPC endpoints (that's what the infra is for) and it will handle a full,
un-sampled firehose instead of the public endpoint's rate limit.

## Configuration

All via env vars (see `src/config.js`):

| Var | Default | Meaning |
| --- | --- | --- |
| `SOLANA_RPC_URL` | public mainnet | RPC endpoint (Solami) |
| `SOLANA_WS_URL` | derived | WebSocket endpoint for logs |
| `WATCH_PROGRAMS` | SPL Token | comma-separated program ids to watch |
| `SOL_WHALE_LAMPORTS` | `100000000000` | SOL transfer threshold (lamports) |
| `TOKEN_WHALE_UI` | `1000000` | token transfer threshold (UI units) |
| `TRACKED_MINTS` | (any) | comma-separated mints to alert on |
| `SAMPLE_RATE` | `1` | `0..1`, sample incoming logs (use <1 on public RPC) |
| `MAX_CONCURRENCY` | `6` | bounded parallel tx fetches |
| `WEBHOOK_URL` | | POST alerts as JSON |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | | Telegram delivery |
| `PORT` | `8787` | dashboard port |

Example:

```bash
SOL_WHALE_LAMPORTS=50000000000 \
TOKEN_WHALE_UI=5000000 \
WATCH_PROGRAMS=TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA \
SAMPLE_RATE=0.05 \
npm start
```

## Endpoints

- `GET /` dashboard
- `GET /events` SSE stream (`hello`, `alert`)
- `GET /api/stats` counters
- `GET /api/alerts` recent alerts
- `GET /health`

## Tests

```bash
npm test
```

Covers transaction parsing (SOL + token deltas), unit formatting, the rule engine
(thresholds, mint filter), and the dedupe window.

## Architecture

```
onLogs(program) ──▶ bounded queue ──▶ getParsedTransaction
                        │                     │
                        │             parseTransaction  (balance deltas)
                        │                     │
                   backpressure          evaluate (rules) ──▶ Deduper
                        │                     │
                        │              notifier ──▶ stdout / webhook / telegram
                        │                     │
                        └─────────────────────┴──▶ SSE ──▶ dashboard
```

Two details that keep it alive on a busy chain: bounded concurrency with a
drop-oldest queue (a slow RPC can't grow memory), and a 429 cooldown so it backs
off instead of hammering the endpoint.

## Roadmap

- Solami gRPC (Yellowstone) firehose instead of `onLogs` for full throughput.
- Account-level watchlists (alert on a specific address, not just magnitude).
- Persistent rule config + a small rule editor in the dashboard.
- Historical backfill and daily flow summaries.

## License

MIT

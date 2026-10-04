# Superteam submission — Solami track (paste-ready)

Listing: https://superteam.fun/earn/listing/build-something-live-on-solana-data
Repo: https://github.com/Bandidozx/solana-pulse
Track requirement: open-source app that runs on Solana in real time.

---

Project name: solana-pulse

Repo: https://github.com/Bandidozx/solana-pulse

What it is:

solana-pulse is a real-time Solana activity monitor. It subscribes to program
logs on mainnet, pulls each transaction, and turns the balance changes into
clean flows - native SOL and SPL token deltas - then fires alerts when a
transfer crosses a threshold. Alerts go out to the terminal, a webhook, and
Telegram, and everything is streamed live to a browser dashboard over SSE.

Why I built it:

Watching a wallet or a program for large moves usually means either polling
RPC or writing one-off scripts. I wanted a small service you can point at any
program and get live, readable alerts out of, without decoding every
instruction. It reads balance deltas from the transaction meta, so it works
across programs instead of only one.

What's in it:

- Log subscription + bounded-concurrency queue (a slow RPC can't blow up memory)
- 429 cooldown so it backs off instead of hammering the endpoint
- SOL and SPL token flow parsing, whale thresholds, per-mint filters
- Dedupe window so the same move doesn't alert twice
- Delivery: stdout, JSON webhook, Telegram
- Live SSE dashboard at /events

How it uses Solana data:

It runs on mainnet right now. It's pointed at the RPC/WS endpoint via env vars,
so it drops straight onto Solami's endpoints. On the public endpoint I sample
the log stream to survive the rate limit; on a real RPC + gRPC firehose you run
it at full rate.

Proof it runs live (real alerts from mainnet, not a mock):

  ALERT token_whale | in  7,935,483 ... sig=5skxp...
  ALERT token_whale | out 7,952,946 ... sig=5skxp...
  ALERT token_whale | in  5,675,158 ... sig=23bkv...

Tests: `npm test` - parsing, formatting, rule engine, dedupe. 6/6 pass.

Stack: Node 20, @solana/web3.js, zero framework. MIT licensed.

---

NOTE (internal, do not paste): Solami track is HUMAN_ONLY - operator submits.
Optional: claim the free Solami API key and set SOLANA_RPC_URL / SOLANA_WS_URL
for full-rate production use.

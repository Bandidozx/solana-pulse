// Central config. Everything is env-overridable so the same build runs against
// Solami's endpoints or a plain public RPC.

const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

export const config = {
  // RPC: Solami gives you an API key + endpoints. Point these at Solami for the
  // submission; the defaults hit public mainnet so the thing is runnable today.
  rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  wsUrl: process.env.SOLANA_WS_URL || process.env.SOLANA_RPC_URL?.replace(/^http/, 'ws') || 'wss://api.mainnet-beta.solana.com',
  commitment: process.env.COMMITMENT || 'confirmed',

  // Solami REST/proxy base + key are optional; only used when set.
  solamiApiBase: process.env.SOLAMI_API_BASE || '',
  solamiApiKey: process.env.SOLAMI_API_KEY || '',

  httpPort: num(process.env.PORT, 8787),

  // Alert thresholds.
  solWhaleLamports: num(process.env.SOL_WHALE_LAMPORTS, 100 * 1e9), // 100 SOL default
  tokenWhaleUi: num(process.env.TOKEN_WHALE_UI, 1_000_000),          // 1,000,000 tokens default

  // Mints we care about for token alerts (comma separated). Empty = any mint.
  trackedMints: (process.env.TRACKED_MINTS || '').split(',').map((s) => s.trim()).filter(Boolean),

  // Delivery.
  webhookUrl: process.env.WEBHOOK_URL || '',
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChat: process.env.TELEGRAM_CHAT_ID || '',

  // Programs to watch through onLogs. Defaults to the SPL Token + System programs.
  watchedPrograms: (process.env.WATCH_PROGRAMS || [
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token
    '11111111111111111111111111111111',            // System
  ].join(',')).split(',').map((s) => s.trim()).filter(Boolean),

  logLevel: process.env.LOG_LEVEL || 'info',
};

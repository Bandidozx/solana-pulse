// Alert delivery: console always, webhook and Telegram when configured.
// All sends are best-effort and never throw into the monitor loop.

export function createNotifier(cfg, log) {
  const sinks = [];

  sinks.push(async (alert) => {
    log.warn(
      `ALERT ${alert.severity} ${alert.kind} | ${alert.direction} ${alert.amount}` +
        `${alert.mint ? ' mint=' + alert.mint : ''}` +
        `${alert.account ? ' acct=' + alert.account : ''}` +
        ` sig=${alert.signature}`,
    );
  });

  if (cfg.webhookUrl) {
    sinks.push(async (alert) => {
      const res = await fetch(cfg.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(alert),
      });
      if (!res.ok) log.warn(`webhook responded ${res.status}`);
    });
  }

  if (cfg.telegramToken && cfg.telegramChat) {
    sinks.push(async (alert) => {
      const text =
        `*${alert.kind}* (${alert.severity})\n` +
        `${alert.direction} ${alert.amount}${alert.mint ? '\n`' + alert.mint + '`' : ''}\n` +
        `${alert.account ? 'acct `' + alert.account + '`\n' : ''}` +
        `https://solscan.io/tx/${alert.signature}`;
      const res = await fetch(`https://api.telegram.org/bot${cfg.telegramToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: cfg.telegramChat, text, parse_mode: 'Markdown' }),
      });
      if (!res.ok) log.warn(`telegram responded ${res.status}`);
    });
  }

  return {
    async dispatch(alert) {
      await Promise.all(
        sinks.map((s) => Promise.resolve(s(alert)).catch((e) => log.warn('notify failed:', e.message))),
      );
    },
  };
}

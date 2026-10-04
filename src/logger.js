// Tiny structured logger so alerts, errors and connection state are readable
// in both a terminal and a service log.

const levels = { error: 0, warn: 1, info: 2, debug: 3 };

export function createLogger(level = 'info') {
  const min = levels[level] ?? levels.info;
  const emit = (name, stream) => (...args) => {
    if (levels[name] > min) return;
    const ts = new Date().toISOString();
    stream(`[${ts}] ${name.toUpperCase().padEnd(5)} `, ...args);
  };
  return {
    error: emit('error', console.error),
    warn: emit('warn', console.error),
    info: emit('info', console.log),
    debug: emit('debug', console.log),
  };
}

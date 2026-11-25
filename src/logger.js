'use strict';

const path = require('path');
const fs = require('fs');
const pino = require('pino');
const config = require('./config');

fs.mkdirSync(config.paths.logs, { recursive: true });

const level = config.appDebug ? 'trace' : 'info';

const fileTransport = {
  target: 'pino-roll',
  options: {
    file: path.join(config.paths.logs, 'app.log'),
    frequency: 'daily',
    mkdir: true,
    size: '20m',
    limit: { count: 14 },
  },
  level,
};

const consoleTransport = {
  target: 'pino-pretty',
  options: {
    colorize: true,
    translateTime: 'SYS:HH:MM:ss.l',
    ignore: 'pid,hostname',
    singleLine: false,
  },
  level,
};

const transport = pino.transport({
  targets: process.env.NODE_ENV === 'production' ? [fileTransport] : [consoleTransport, fileTransport],
});

const logger = pino(
  {
    level,
    base: { app: 'uptime' },
    redact: {
      paths: ['req.headers.cookie', 'req.headers.authorization', '*.password', '*.discord_webhook'],
      censor: '[redacted]',
    },
  },
  transport
);

logger.info(
  { appDebug: config.appDebug, level, logFile: path.join(config.paths.logs, 'app.log') },
  'logger initialized'
);

function formatLogEntry(rawLine) {
  const line = String(rawLine || '').trim();
  if (!line) return null;
  try {
    const obj = JSON.parse(line);
    const levelMap = { 10: 'TRACE', 20: 'DEBUG', 30: 'INFO', 40: 'WARN', 50: 'ERROR', 60: 'FATAL' };
    const lvl = levelMap[obj.level] || String(obj.level || 'INFO');
    const ts = obj.time ? new Date(obj.time).toISOString().replace('T', ' ').replace('Z', '') : '';
    const msg = obj.msg || obj.message || '';
    const extra = { ...obj };
    delete extra.level;
    delete extra.time;
    delete extra.msg;
    delete extra.message;
    delete extra.pid;
    delete extra.hostname;
    delete extra.app;
    const metaStr = Object.keys(extra).length ? ' ' + JSON.stringify(extra) : '';
    return `${ts ? `[${ts}] ` : ''}[${lvl}] ${msg}${metaStr}`.trim();
  } catch {
    return line;
  }
}

function getRecentLogs(limit = 40) {
  try {
    const maxLines = Math.max(1, Math.min(200, Number(limit) || 40));
    if (!fs.existsSync(config.paths.logs)) return [];

    const files = fs.readdirSync(config.paths.logs)
      .filter((f) => /^app\.log/i.test(f))
      .map((f) => {
        const full = path.join(config.paths.logs, f);
        try {
          const stat = fs.statSync(full);
          return stat.isFile() ? { full, mtimeMs: stat.mtimeMs } : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    if (!files.length) return [];

    const raw = fs.readFileSync(files[0].full, 'utf8');
    const lines = raw.split(/\r?\n/).filter(Boolean).slice(-maxLines);
    return lines.map(formatLogEntry).filter(Boolean);
  } catch {
    return [];
  }
}

logger.getRecentLogs = getRecentLogs;

module.exports = logger;
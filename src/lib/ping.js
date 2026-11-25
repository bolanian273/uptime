'use strict';

// ICMP ping by shelling out to the OS ping binary. We don't use raw sockets
// because that requires elevated privileges on most systems. Supports Linux
// (iputils / BusyBox), macOS / BSD, and Windows.

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');

const PLATFORM = os.platform();
const IS_WINDOWS = PLATFORM === 'win32';
const IS_BSD = PLATFORM === 'darwin' || PLATFORM === 'freebsd' || PLATFORM === 'openbsd' || PLATFORM === 'netbsd';

const PING_BINARIES = IS_WINDOWS
  ? [
      process.env.SystemRoot ? `${process.env.SystemRoot}\\System32\\ping.exe` : null,
      'C:\\Windows\\System32\\ping.exe',
      'ping.exe',
      'ping',
    ].filter(Boolean)
  : ['/usr/bin/ping', '/bin/ping', 'ping'];

function resolveBinary() {
  for (const p of PING_BINARIES) {
    if (p.includes('/') || p.includes('\\')) {
      try {
        fs.accessSync(p);
        return p;
      } catch {
        /* keep looking */
      }
    }
  }
  return IS_WINDOWS ? 'ping.exe' : 'ping';
}

const PING_BIN = resolveBinary();

// Output parsers for POSIX (iputils, BusyBox, macOS/BSD) and Windows ping.exe.
const RX_LOSS_POSIX = /(\d+(?:\.\d+)?)%\s*packet\s*loss/i;
const RX_LOSS_WIN = /\((\d+(?:\.\d+)?)%\s*loss\)/i;
const RX_RTT_LINE = /(?:rtt|round-trip)\s+min\/avg\/max(?:\/(?:mdev|stddev))?\s*=\s*([0-9.]+)\/([0-9.]+)\/([0-9.]+)/i;
const RX_TIME_POSIX = /time[=<]\s*([0-9.]+)\s*ms/i;
const RX_TIME_WIN = /time[=<]\s*(\d+)\s*ms/i;
const RX_AVG_WIN = /Average\s*=\s*(\d+)\s*ms/i;

function buildArgs(host, count, timeoutSec) {
  if (IS_WINDOWS) {
    const waitMs = Math.max(100, timeoutSec * 1000);
    return ['-n', String(count), '-w', String(waitMs), host];
  }
  const waitFlag = IS_BSD
    ? ['-W', String(timeoutSec * 1000)] // BSD/macOS: per-reply wait in ms
    : ['-W', String(timeoutSec)];       // Linux/BusyBox: per-reply wait in seconds
  return ['-n', '-c', String(count), ...waitFlag, host];
}

function parseLoss(text, err) {
  const winMatch = text.match(RX_LOSS_WIN);
  if (winMatch) return Number(winMatch[1]);
  const posixMatch = text.match(RX_LOSS_POSIX);
  if (posixMatch) return Number(posixMatch[1]);
  return err ? 100 : 0;
}

function parseAvgMs(text) {
  const rttMatch = text.match(RX_RTT_LINE);
  if (rttMatch) return Number(rttMatch[2]);

  const winAvg = text.match(RX_AVG_WIN);
  if (winAvg) return Number(winAvg[1]);

  if (IS_WINDOWS) {
    const matches = [...text.matchAll(new RegExp(RX_TIME_WIN.source, 'gi'))];
    if (matches.length > 0) {
      const sum = matches.reduce((acc, m) => acc + Number(m[1]), 0);
      return sum / matches.length;
    }
  }

  const singleTime = text.match(RX_TIME_POSIX);
  if (singleTime) return Number(singleTime[1]);
  return null;
}

function inspect(host, options = {}) {
  return new Promise((resolve) => {
    const timeoutSec = Math.max(1, Math.ceil((options.timeoutMs || 5000) / 1000));
    const count = Math.max(1, Math.min(10, options.count || 1));
    const args = buildArgs(host, count, timeoutSec);

    execFile(PING_BIN, args, { timeout: timeoutSec * 1000 * (count + 1) + 2000 }, (err, stdout, stderr) => {
      const text = `${stdout || ''}\n${stderr || ''}`;
      const lossPct = parseLoss(text, err);
      const avgMs = parseAvgMs(text);
      const hasLossMatch = Boolean(text.match(RX_LOSS_WIN) || text.match(RX_LOSS_POSIX));

      if (err && (hasLossMatch ? lossPct >= 100 : true)) {
        const msg = err.code === 'ENOENT'
          ? 'ping: binary not found on host'
          : `ping: ${err.message?.split('\n')[0] || 'failed'}`;
        return resolve({ ok: false, responseTimeMs: null, errorMessage: msg, lossPct });
      }
      if (lossPct >= 100) {
        return resolve({ ok: false, responseTimeMs: null, errorMessage: 'ping: 100% packet loss', lossPct });
      }
      if (lossPct > 0) {
        return resolve({
          ok: true,
          responseTimeMs: avgMs == null ? null : Math.round(avgMs),
          errorMessage: null,
          lossPct,
          partial: `ping: ${lossPct}% packet loss`,
        });
      }
      return resolve({
        ok: true,
        responseTimeMs: avgMs == null ? null : Math.round(avgMs),
        errorMessage: null,
        lossPct: 0,
      });
    });
  });
}

module.exports = { inspect };
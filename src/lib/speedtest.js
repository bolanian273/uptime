'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const IS_WINDOWS = os.platform() === 'win32';

function findOoklaBinary() {
  const candidates = IS_WINDOWS
    ? [
        process.env.SPEEDTEST_PATH,
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Ookla', 'Speedtest', 'speedtest.exe'),
        path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Ookla', 'Speedtest', 'speedtest.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'speedtest.exe'),
        'speedtest.exe',
        'speedtest',
      ]
    : [
        process.env.SPEEDTEST_PATH,
        '/usr/local/bin/speedtest',
        '/usr/bin/speedtest',
        '/opt/homebrew/bin/speedtest',
        'speedtest',
      ];

  for (const p of candidates) {
    if (!p) continue;
    if (p.includes('/') || p.includes('\\')) {
      try {
        fs.accessSync(p, fs.constants.X_OK);
        return p;
      } catch {
        // try next candidate
      }
    } else {
      return p;
    }
  }
  return IS_WINDOWS ? 'speedtest.exe' : 'speedtest';
}

const SPEEDTEST_BIN = findOoklaBinary();

// Ookla JSON reports bandwidth in bytes/sec; convert to decimal Mbps (bits / 1e6).
function bytesPerSecToMbps(bytesPerSec) {
  const n = Number(bytesPerSec);
  if (!Number.isFinite(n) || n < 0) return null;
  return Number(((n * 8) / 1_000_000).toFixed(2));
}

function runOoklaSpeedtest({ timeoutMs = 60000, serverId = null } = {}) {
  return new Promise((resolve) => {
    const args = ['--accept-license', '--accept-gdpr', '-f', 'json'];
    if (serverId) {
      args.push('-s', String(serverId));
    }

    execFile(
      SPEEDTEST_BIN,
      args,
      { timeout: Math.max(10000, timeoutMs), maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const msg = err.code === 'ENOENT'
            ? 'speedtest: Ookla CLI not found (install official Ookla Speedtest CLI on PATH)'
            : `speedtest: ${(stderr || err.message || 'failed').toString().trim().split('\n')[0]}`;
          return resolve({
            ok: false,
            pingMs: null,
            downloadMbps: null,
            uploadMbps: null,
            serverName: null,
            errorMessage: msg,
          });
        }

        try {
          const data = JSON.parse(String(stdout || '').trim());
          const pingMs = data.ping?.latency != null ? Number(Number(data.ping.latency).toFixed(2)) : null;
          const downloadMbps = bytesPerSecToMbps(data.download?.bandwidth);
          const uploadMbps = bytesPerSecToMbps(data.upload?.bandwidth);
          const serverName = data.server?.name
            ? `${data.server.name}${data.server.location ? ` (${data.server.location})` : ''}`
            : null;

          if (downloadMbps == null || uploadMbps == null) {
            return resolve({
              ok: false,
              pingMs,
              downloadMbps,
              uploadMbps,
              serverName,
              errorMessage: 'speedtest: incomplete Ookla JSON output',
            });
          }

          return resolve({
            ok: true,
            pingMs,
            downloadMbps,
            uploadMbps,
            serverName,
            errorMessage: null,
          });
        } catch (parseErr) {
          return resolve({
            ok: false,
            pingMs: null,
            downloadMbps: null,
            uploadMbps: null,
            serverName: null,
            errorMessage: `speedtest: invalid JSON output (${parseErr.message})`,
          });
        }
      }
    );
  });
}

module.exports = { runOoklaSpeedtest, findOoklaBinary };
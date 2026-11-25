'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('../config');
const logger = require('../logger');

const DIALECT = 'sqlite';

const dbPath = config.db.sqlitePath;
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = NORMAL');
db.exec('PRAGMA busy_timeout = 5000');

logger.info({ driver: DIALECT, path: dbPath }, 'db.opened');

function isReadStatement(sql) {
  return /^\s*(?:(?:WITH\b[\s\S]*?\s+)?SELECT\b|PRAGMA\b|EXPLAIN\b)/i.test(sql);
}

async function query(sql, params = []) {
  const start = Date.now();
  try {
    const stmt = db.prepare(sql);
    if (isReadStatement(sql)) {
      const rows = stmt.all(...params);
      if (config.appDebug) {
        logger.trace(
          { sql: sql.replace(/\s+/g, ' ').slice(0, 240), durationMs: Date.now() - start, rowsAffected: rows.length },
          'db.query'
        );
      }
      return rows;
    }
    const info = stmt.run(...params);
    const changes = Number(info.changes ?? 0);
    const insertId = info.lastInsertRowid != null ? Number(info.lastInsertRowid) : 0;
    const result = [];
    result.affectedRows = changes;
    result.insertId = insertId;
    result.changes = changes;
    if (config.appDebug) {
      logger.trace(
        { sql: sql.replace(/\s+/g, ' ').slice(0, 240), durationMs: Date.now() - start, rowsAffected: changes, insertId },
        'db.query'
      );
    }
    return result;
  } catch (err) {
    logger.error({ err, sql: sql.replace(/\s+/g, ' ').slice(0, 240) }, 'db.query failed');
    throw err;
  }
}

async function ensureSchema() {
  const ddl = fs.readFileSync(config.paths.schemaSqlite, 'utf8');
  db.exec(ddl);
  logger.info({ driver: DIALECT, path: dbPath }, 'schema ensured');
}

async function close() {
  db.close();
}

const helpers = {
  dialect: DIALECT,
  nowMs: () => "strftime('%Y-%m-%dT%H:%M:%fZ','now')",
  diffSecondsSql: (a, b) => `CAST((julianday(${b}) - julianday(${a})) * 86400 AS INTEGER)`,
  castJson: () => '?',
  intervalAgoSql: () => `strftime('%Y-%m-%dT%H:%M:%fZ', CAST(strftime('%s','now') AS INTEGER) - (? * 3600), 'unixepoch')`,
  bucketTimeSql: (col) =>
    `strftime('%Y-%m-%dT%H:%M:%SZ', (CAST(strftime('%s', ${col}) AS INTEGER) / (? * 60)) * (? * 60), 'unixepoch')`,
  greatestSql: (...args) => `MAX(${args.join(', ')})`,
};

module.exports = { query, ensureSchema, close, raw: db, ...helpers };
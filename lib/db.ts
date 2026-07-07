import Database from 'better-sqlite3';
import { log, warn } from './logger';
import path from 'path';
import fs from 'fs';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'history.db');
const SQLITE_BUSY_TIMEOUT_MS = Number(process.env.SQLITE_BUSY_TIMEOUT_MS) || 10000;

// 确保数据目录存在
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// 获取数据库连接
let db: Database.Database | null = null;

function sleep(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withSqliteBusyRetry<T>(label: string, operation: () => T): T {
  const maxAttempts = 5;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return operation();
    } catch (err) {
      lastError = err;
      const code = typeof err === 'object' && err !== null && 'code' in err
        ? (err as { code?: string }).code
        : undefined;
      if (code !== 'SQLITE_BUSY' || attempt === maxAttempts) {
        throw err;
      }

      const waitMs = Math.min(250 * attempt, 1000);
      warn(`${label} hit SQLITE_BUSY, retrying in ${waitMs}ms (${attempt}/${maxAttempts})`);
      sleep(waitMs);
    }
  }

  throw lastError;
}

export function getDatabase(): Database.Database {
  if (db) {
    return db;
  }

  ensureDataDir();
  db = withSqliteBusyRetry('Opening database', () => new Database(DB_PATH, {
    timeout: SQLITE_BUSY_TIMEOUT_MS,
  }));
  db.pragma(`busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);

  // 启用 WAL 模式以提高并发性能
  withSqliteBusyRetry('Enabling database WAL mode', () => {
    db!.pragma('journal_mode = WAL');
  });

  return db;
}

// 初始化数据库表
export function initDatabase() {
  const db = getDatabase();

  withSqliteBusyRetry('Initializing database schema', () => {
    // 创建历史数据点表
    db.exec(`
      CREATE TABLE IF NOT EXISTS history_points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_timestamp ON history_points(timestamp);
      CREATE INDEX IF NOT EXISTS idx_created_at ON history_points(created_at);
    `);

    // 创建链数据表
    db.exec(`
      CREATE TABLE IF NOT EXISTS chain_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        history_point_id INTEGER NOT NULL,
        chain TEXT NOT NULL,
        chain_key TEXT NOT NULL,
        data_source TEXT NOT NULL DEFAULT 'unknown',
        pair_id TEXT NOT NULL DEFAULT '',
        amount INTEGER NOT NULL,

        usdc_to_usdt_input REAL NOT NULL,
        usdc_to_usdt_output REAL,
        usdc_to_usdt_output_usd REAL,
        usdc_to_usdt_error TEXT,
        usdc_to_usdt_route TEXT,

        usdt_to_usdc_input REAL NOT NULL,
        usdt_to_usdc_output REAL,
        usdt_to_usdc_output_usd REAL,
        usdt_to_usdc_error TEXT,
        usdt_to_usdc_route TEXT,

        token_a_to_b_input REAL,
        token_a_to_b_output REAL,
        token_a_to_b_output_usd REAL,
        token_a_to_b_error TEXT,
        token_a_to_b_route TEXT,

        token_b_to_a_input REAL,
        token_b_to_a_output REAL,
        token_b_to_a_output_usd REAL,
        token_b_to_a_error TEXT,
        token_b_to_a_route TEXT,

        FOREIGN KEY (history_point_id) REFERENCES history_points(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_history_point ON chain_data(history_point_id);
      CREATE INDEX IF NOT EXISTS idx_chain_amount ON chain_data(chain, amount);
      CREATE INDEX IF NOT EXISTS idx_pair_chain_amount ON chain_data(pair_id, chain, amount);
    `);

    // 新版：通用链数据表（仅保留 tokenA/tokenB 字段）
    db.exec(`
      CREATE TABLE IF NOT EXISTS chain_swaps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        history_point_id INTEGER NOT NULL,
        chain TEXT NOT NULL,
        chain_key TEXT NOT NULL,
        data_source TEXT NOT NULL DEFAULT 'unknown',
        pair_id TEXT NOT NULL DEFAULT '',
        amount INTEGER NOT NULL,
        quote_timestamp TEXT,

        token_a_to_b_input REAL,
        token_a_to_b_output REAL,
        token_a_to_b_output_usd REAL,
        token_a_to_b_error TEXT,
        token_a_to_b_route TEXT,

        token_b_to_a_input REAL,
        token_b_to_a_output REAL,
        token_b_to_a_output_usd REAL,
        token_b_to_a_error TEXT,
        token_b_to_a_route TEXT,

        FOREIGN KEY (history_point_id) REFERENCES history_points(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_swap_history_point ON chain_swaps(history_point_id);
      CREATE INDEX IF NOT EXISTS idx_swap_chain_amount ON chain_swaps(chain, amount);
      CREATE INDEX IF NOT EXISTS idx_swap_pair_chain_amount ON chain_swaps(pair_id, chain, amount);
      CREATE INDEX IF NOT EXISTS idx_swap_source_chain_amount ON chain_swaps(data_source, chain, amount);
      CREATE INDEX IF NOT EXISTS idx_swap_quote_timestamp ON chain_swaps(quote_timestamp);
    `);

    // 创建通知历史表
    db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        pair_id TEXT,
        pair_name TEXT,
        profit_bps REAL,
        sell_chain TEXT,
        buy_chain TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_notif_created_at ON notifications(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notif_type ON notifications(type);
      CREATE INDEX IF NOT EXISTS idx_notif_pair_id ON notifications(pair_id);
    `);
  });

  // 轻量迁移：如果旧表缺少 data_source 列，则补齐
  try {
    withSqliteBusyRetry('Checking database migrations', () => {
      const cols = db.prepare(`PRAGMA table_info(chain_data)`).all() as Array<{ name: string }>;
      const hasDataSource = cols.some(c => c.name === 'data_source');
      const hasPairId = cols.some(c => c.name === 'pair_id');
      const hasTokenAToB = cols.some(c => c.name === 'token_a_to_b_input');
      const hasRouteColumns = cols.some(c => c.name === 'token_a_to_b_route');

      if (!hasDataSource) {
        db.exec(`ALTER TABLE chain_data ADD COLUMN data_source TEXT`);
        db.exec(`UPDATE chain_data SET data_source = 'unknown' WHERE data_source IS NULL`);
        log('Database migrated: added chain_data.data_source');
      }

      if (!hasPairId) {
        db.exec(`ALTER TABLE chain_data ADD COLUMN pair_id TEXT NOT NULL DEFAULT ''`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_pair_chain_amount ON chain_data(pair_id, chain, amount)`);
        log('Database migrated: added chain_data.pair_id');
      }

      if (!hasTokenAToB) {
        db.exec(`
          ALTER TABLE chain_data ADD COLUMN token_a_to_b_input REAL;
          ALTER TABLE chain_data ADD COLUMN token_a_to_b_output REAL;
          ALTER TABLE chain_data ADD COLUMN token_a_to_b_output_usd REAL;
          ALTER TABLE chain_data ADD COLUMN token_a_to_b_error TEXT;
          ALTER TABLE chain_data ADD COLUMN token_b_to_a_input REAL;
          ALTER TABLE chain_data ADD COLUMN token_b_to_a_output REAL;
          ALTER TABLE chain_data ADD COLUMN token_b_to_a_output_usd REAL;
          ALTER TABLE chain_data ADD COLUMN token_b_to_a_error TEXT;
        `);
        log('Database migrated: added generic token swap columns');
      }

      if (!hasRouteColumns) {
        db.exec(`
          ALTER TABLE chain_data ADD COLUMN usdc_to_usdt_route TEXT;
          ALTER TABLE chain_data ADD COLUMN usdt_to_usdc_route TEXT;
          ALTER TABLE chain_data ADD COLUMN token_a_to_b_route TEXT;
          ALTER TABLE chain_data ADD COLUMN token_b_to_a_route TEXT;
        `);
        log('Database migrated: added route columns');
      }

      if (!hasDataSource || !hasPairId || !hasTokenAToB || !hasRouteColumns) {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_source_chain_amount ON chain_data(data_source, chain, amount)`);
      }
    });
  } catch (err) {
    warn('Database migration check failed:', err);
  }

  log('Database initialized successfully');
}

export interface NotificationRecord {
  id?: number;
  created_at?: number;
  type: string;        // 'arb' | 'price_change'
  title: string;
  body: string;
  pair_id?: string;
  pair_name?: string;
  profit_bps?: number;
  sell_chain?: string;
  buy_chain?: string;
}

export function saveNotification(record: NotificationRecord): void {
  try {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO notifications (type, title, body, pair_id, pair_name, profit_bps, sell_chain, buy_chain)
      VALUES (@type, @title, @body, @pair_id, @pair_name, @profit_bps, @sell_chain, @buy_chain)
    `).run({
      type: record.type,
      title: record.title,
      body: record.body,
      pair_id: record.pair_id ?? null,
      pair_name: record.pair_name ?? null,
      profit_bps: record.profit_bps ?? null,
      sell_chain: record.sell_chain ?? null,
      buy_chain: record.buy_chain ?? null,
    });
  } catch (err) {
    warn('Failed to save notification:', err);
  }
}

export function getNotifications(opts: {
  limit?: number;
  offset?: number;
  type?: string;
  pair_id?: string;
}): { rows: NotificationRecord[]; total: number } {
  const db = getDatabase();
  const { limit = 50, offset = 0, type, pair_id } = opts;

  const conditions: string[] = [];
  const params: Record<string, unknown> = {};
  if (type) { conditions.push('type = @type'); params.type = type; }
  if (pair_id) { conditions.push('pair_id = @pair_id'); params.pair_id = pair_id; }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = (db.prepare(`SELECT COUNT(*) as cnt FROM notifications ${where}`).get(params) as { cnt: number }).cnt;
  const rows = db.prepare(`SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset }) as NotificationRecord[];

  return { rows, total };
}

// 关闭数据库连接
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

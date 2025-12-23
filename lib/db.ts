import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'history.db');

// 确保数据目录存在
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// 获取数据库连接
let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (db) {
    return db;
  }

  ensureDataDir();
  db = new Database(DB_PATH);

  // 启用 WAL 模式以提高并发性能
  db.pragma('journal_mode = WAL');

  return db;
}

// 初始化数据库表
export function initDatabase() {
  const db = getDatabase();

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
      data_source TEXT NOT NULL DEFAULT 'kyberswap',
      pair_id TEXT NOT NULL DEFAULT 'usdc_usdt',
      amount INTEGER NOT NULL,

      usdc_to_usdt_input REAL NOT NULL,
      usdc_to_usdt_output REAL,
      usdc_to_usdt_output_usd REAL,
      usdc_to_usdt_error TEXT,

      usdt_to_usdc_input REAL NOT NULL,
      usdt_to_usdc_output REAL,
      usdt_to_usdc_output_usd REAL,
      usdt_to_usdc_error TEXT,

      token_a_to_b_input REAL,
      token_a_to_b_output REAL,
      token_a_to_b_output_usd REAL,
      token_a_to_b_error TEXT,

      token_b_to_a_input REAL,
      token_b_to_a_output REAL,
      token_b_to_a_output_usd REAL,
      token_b_to_a_error TEXT,

      FOREIGN KEY (history_point_id) REFERENCES history_points(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_history_point ON chain_data(history_point_id);
    CREATE INDEX IF NOT EXISTS idx_chain_amount ON chain_data(chain, amount);
    CREATE INDEX IF NOT EXISTS idx_pair_chain_amount ON chain_data(pair_id, chain, amount);
  `);

  // 轻量迁移：如果旧表缺少 data_source 列，则补齐
  try {
    const cols = db.prepare(`PRAGMA table_info(chain_data)`).all() as Array<{ name: string }>;
    const hasDataSource = cols.some(c => c.name === 'data_source');
    const hasPairId = cols.some(c => c.name === 'pair_id');
    const hasTokenAToB = cols.some(c => c.name === 'token_a_to_b_input');
    
    if (!hasDataSource) {
      db.exec(`ALTER TABLE chain_data ADD COLUMN data_source TEXT`);
      db.exec(`UPDATE chain_data SET data_source = 'kyberswap' WHERE data_source IS NULL`);
      console.log('Database migrated: added chain_data.data_source');
    }
    
    if (!hasPairId) {
      db.exec(`ALTER TABLE chain_data ADD COLUMN pair_id TEXT NOT NULL DEFAULT 'usdc_usdt'`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_pair_chain_amount ON chain_data(pair_id, chain, amount)`);
      console.log('Database migrated: added chain_data.pair_id');
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
      console.log('Database migrated: added generic token swap columns');
    }
    
    if (!hasDataSource || !hasPairId || !hasTokenAToB) {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_source_chain_amount ON chain_data(data_source, chain, amount)`);
    }
  } catch (error) {
    console.warn('Database migration check failed:', error);
  }

  console.log('Database initialized successfully');
}

// 关闭数据库连接
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

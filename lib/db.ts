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
      amount INTEGER NOT NULL,

      usdc_to_usdt_input REAL NOT NULL,
      usdc_to_usdt_output REAL,
      usdc_to_usdt_output_usd REAL,
      usdc_to_usdt_error TEXT,

      usdt_to_usdc_input REAL NOT NULL,
      usdt_to_usdc_output REAL,
      usdt_to_usdc_output_usd REAL,
      usdt_to_usdc_error TEXT,

      FOREIGN KEY (history_point_id) REFERENCES history_points(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_history_point ON chain_data(history_point_id);
    CREATE INDEX IF NOT EXISTS idx_chain_amount ON chain_data(chain, amount);
  `);

  console.log('Database initialized successfully');
}

// 关闭数据库连接
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

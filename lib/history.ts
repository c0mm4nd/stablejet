import { ChainSwapData } from './types';
import { getDatabase, initDatabase } from './db';

export interface HistoryDataPoint {
  timestamp: string;
  data: ChainSwapData[];
}

const MAX_HISTORY_POINTS = 100; // 保留最近100个数据点

// 初始化数据库（如果还没初始化）
initDatabase();

// 保存新的数据点
export function saveDataPoint(data: ChainSwapData[]) {
  const db = getDatabase();
  const timestamp = new Date().toISOString();

  try {
    // 使用事务确保数据一致性
    const insertPoint = db.prepare(`
      INSERT INTO history_points (timestamp)
      VALUES (?)
    `);

    const insertChainData = db.prepare(`
      INSERT INTO chain_data (
        history_point_id, chain, chain_key, data_source, amount,
        usdc_to_usdt_input, usdc_to_usdt_output, usdc_to_usdt_output_usd, usdc_to_usdt_error,
        usdt_to_usdc_input, usdt_to_usdc_output, usdt_to_usdc_output_usd, usdt_to_usdc_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction((data: ChainSwapData[]) => {
      // 插入历史数据点
      const result = insertPoint.run(timestamp);
      const historyPointId = result.lastInsertRowid;

      // 插入每条链的数据
      for (const item of data) {
        insertChainData.run(
          historyPointId,
          item.chain,
          item.chainKey,
          item.dataSource || 'kyberswap',
          item.amount,
          item.usdcToUsdt.input,
          item.usdcToUsdt.output,
          item.usdcToUsdt.outputUsd,
          item.usdcToUsdt.error || null,
          item.usdtToUsdc.input,
          item.usdtToUsdc.output,
          item.usdtToUsdc.outputUsd,
          item.usdtToUsdc.error || null
        );
      }
    });

    transaction(data);

    // 清理旧数据，只保留最近的数据点
    cleanupOldData();
  } catch (error) {
    console.error('Error saving data point:', error);
  }
}

// 清理旧数据
function cleanupOldData() {
  const db = getDatabase();

  try {
    // 删除超过 MAX_HISTORY_POINTS 的旧数据
    db.prepare(`
      DELETE FROM history_points
      WHERE id NOT IN (
        SELECT id FROM history_points
        ORDER BY created_at DESC
        LIMIT ?
      )
    `).run(MAX_HISTORY_POINTS);
  } catch (error) {
    console.error('Error cleaning up old data:', error);
  }
}

// 获取指定时间范围的历史数据
export function getHistoryInRange(hours: number = 24): HistoryDataPoint[] {
  const db = getDatabase();
  const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  try {
    // 获取所有符合时间范围的历史数据点
    const points = db.prepare(`
      SELECT id, timestamp
      FROM history_points
      WHERE timestamp >= ?
      ORDER BY timestamp ASC
    `).all(cutoffTime) as Array<{ id: number; timestamp: string }>;

    // 为每个数据点获取链数据
    const getChainData = db.prepare(`
      SELECT *
      FROM chain_data
      WHERE history_point_id = ?
    `);

    const historyPoints: HistoryDataPoint[] = points.map(point => {
      const chainDataRows = getChainData.all(point.id) as Array<any>;

      const data: ChainSwapData[] = chainDataRows.map(row => ({
        chain: row.chain,
        chainKey: row.chain_key,
        dataSource: (row.data_source || 'kyberswap'),
        amount: row.amount,
        usdcToUsdt: {
          input: row.usdc_to_usdt_input,
          output: row.usdc_to_usdt_output,
          outputUsd: row.usdc_to_usdt_output_usd,
          error: row.usdc_to_usdt_error || undefined
        },
        usdtToUsdc: {
          input: row.usdt_to_usdc_input,
          output: row.usdt_to_usdc_output,
          outputUsd: row.usdt_to_usdc_output_usd,
          error: row.usdt_to_usdc_error || undefined
        }
      }));

      return {
        timestamp: point.timestamp,
        data
      };
    });

    return historyPoints;
  } catch (error) {
    console.error('Error reading history:', error);
    return [];
  }
}

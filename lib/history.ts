import { ChainSwapData } from './types';
import { error } from './logger';
import { getDatabase, initDatabase } from './db';

export interface HistoryDataPoint {
  timestamp: string;
  data: ChainSwapData[];
}

const MAX_HISTORY_POINTS = 100; // 保留最近100个数据点

function safelyParseRoute(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

// 初始化数据库（如果还没初始化）
initDatabase();

// 保存新的数据点
export function saveDataPoint(data: ChainSwapData[], pairId: string = 'usdc_usdt') {
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
        history_point_id, chain, chain_key, data_source, pair_id, amount,
        usdc_to_usdt_input, usdc_to_usdt_output, usdc_to_usdt_output_usd, usdc_to_usdt_error, usdc_to_usdt_route,
        usdt_to_usdc_input, usdt_to_usdc_output, usdt_to_usdc_output_usd, usdt_to_usdc_error, usdt_to_usdc_route,
        token_a_to_b_input, token_a_to_b_output, token_a_to_b_output_usd, token_a_to_b_error, token_a_to_b_route,
        token_b_to_a_input, token_b_to_a_output, token_b_to_a_output_usd, token_b_to_a_error, token_b_to_a_route
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction((data: ChainSwapData[], pairId: string) => {
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
          item.pairId || pairId,
          item.amount,
          item.usdcToUsdt.input,
          item.usdcToUsdt.output,
          item.usdcToUsdt.outputUsd,
          item.usdcToUsdt.error || null,
          item.usdcToUsdt.route ? JSON.stringify(item.usdcToUsdt.route) : null,
          item.usdtToUsdc.input,
          item.usdtToUsdc.output,
          item.usdtToUsdc.outputUsd,
          item.usdtToUsdc.error || null,
          item.usdtToUsdc.route ? JSON.stringify(item.usdtToUsdc.route) : null,
          item.tokenAToB?.input || null,
          item.tokenAToB?.output || null,
          item.tokenAToB?.outputUsd || null,
          item.tokenAToB?.error || null,
          item.tokenAToB?.route ? JSON.stringify(item.tokenAToB.route) : null,
          item.tokenBToA?.input || null,
          item.tokenBToA?.output || null,
          item.tokenBToA?.outputUsd || null,
          item.tokenBToA?.error || null,
          item.tokenBToA?.route ? JSON.stringify(item.tokenBToA.route) : null
        );
      }
    });

    transaction(data, pairId);

    // 清理旧数据，只保留最近的数据点
    cleanupOldData();
  } catch (err) {
    error('Error saving data point:', err);
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
  } catch (err) {
    error('Error cleaning up old data:', err);
  }
}

// 获取指定时间范围的历史数据
export function getHistoryInRange(hours: number = 24, pairId?: string): HistoryDataPoint[] {
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
    const getChainDataQuery = pairId
      ? `SELECT * FROM chain_data WHERE history_point_id = ? AND pair_id = ?`
      : `SELECT * FROM chain_data WHERE history_point_id = ?`;

    const getChainData = db.prepare(getChainDataQuery);

    const historyPoints: HistoryDataPoint[] = points.map(point => {
      const chainDataRows = pairId
        ? getChainData.all(point.id, pairId) as Array<any>
        : getChainData.all(point.id) as Array<any>;

      const data: ChainSwapData[] = chainDataRows.map(row => ({
        chain: row.chain,
        chainKey: row.chain_key,
        dataSource: (row.data_source || 'kyberswap'),
        pairId: row.pair_id || 'usdc_usdt',
        amount: row.amount,
        usdcToUsdt: {
          input: row.usdc_to_usdt_input,
          output: row.usdc_to_usdt_output,
          outputUsd: row.usdc_to_usdt_output_usd,
          error: row.usdc_to_usdt_error || undefined,
          route: row.usdc_to_usdt_route ? safelyParseRoute(row.usdc_to_usdt_route) : undefined
        },
        usdtToUsdc: {
          input: row.usdt_to_usdc_input,
          output: row.usdt_to_usdc_output,
          outputUsd: row.usdt_to_usdc_output_usd,
          error: row.usdt_to_usdc_error || undefined,
          route: row.usdt_to_usdc_route ? safelyParseRoute(row.usdt_to_usdc_route) : undefined
        },
        tokenAToB: row.token_a_to_b_input ? {
          input: row.token_a_to_b_input,
          output: row.token_a_to_b_output,
          outputUsd: row.token_a_to_b_output_usd,
          error: row.token_a_to_b_error || undefined,
          route: row.token_a_to_b_route ? safelyParseRoute(row.token_a_to_b_route) : undefined
        } : undefined,
        tokenBToA: row.token_b_to_a_input ? {
          input: row.token_b_to_a_input,
          output: row.token_b_to_a_output,
          outputUsd: row.token_b_to_a_output_usd,
          error: row.token_b_to_a_error || undefined,
          route: row.token_b_to_a_route ? safelyParseRoute(row.token_b_to_a_route) : undefined
        } : undefined
      }));

      return {
        timestamp: point.timestamp,
        data
      };
    });

    // Filter out points with no data
    return historyPoints.filter(point => point.data.length > 0);
  } catch (err) {
    error('Error reading history:', err);
    return [];
  }
}

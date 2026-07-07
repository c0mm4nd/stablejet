// In-memory notification store. Notifications were previously persisted to
// SQLite on a Railway volume; the log is informational only, so a
// process-lifetime ring buffer is enough. Resets on each deploy.
const MAX_NOTIFICATIONS = Number(process.env.MAX_NOTIFICATIONS) || 500;

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

type NotificationStore = {
  rows: NotificationRecord[];
  nextId: number;
};

// Survive Next.js dev-server HMR module reloads
const GLOBAL_NOTIFICATIONS_KEY = Symbol.for('stablejet.notifications.store');
const store: NotificationStore =
  (globalThis as any)[GLOBAL_NOTIFICATIONS_KEY] || { rows: [], nextId: 1 };
(globalThis as any)[GLOBAL_NOTIFICATIONS_KEY] = store;

export function saveNotification(record: NotificationRecord): void {
  store.rows.push({
    ...record,
    id: store.nextId++,
    created_at: Math.floor(Date.now() / 1000)
  });

  if (store.rows.length > MAX_NOTIFICATIONS) {
    store.rows.splice(0, store.rows.length - MAX_NOTIFICATIONS);
  }
}

export function getNotifications(opts: {
  limit?: number;
  offset?: number;
  type?: string;
  pair_id?: string;
}): { rows: NotificationRecord[]; total: number } {
  const { limit = 50, offset = 0, type, pair_id } = opts;

  const filtered = store.rows.filter(row =>
    (!type || row.type === type) &&
    (!pair_id || row.pair_id === pair_id)
  );

  // Newest first, mirroring the previous ORDER BY created_at DESC
  const sorted = [...filtered].reverse();

  return {
    rows: sorted.slice(offset, offset + limit),
    total: filtered.length
  };
}

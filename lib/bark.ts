import { log, error } from './logger';

export async function sendBarkNotification(
  endpoints: string[],
  title: string,
  body: string,
  extra?: { url?: string; group?: string }
): Promise<void> {
  if (!endpoints || endpoints.length === 0) return;

  await Promise.allSettled(
    endpoints.map(async (endpoint) => {
      try {
        const base = endpoint.replace(/\/$/, '');
        const url = `${base}/${encodeURIComponent(title)}/${encodeURIComponent(body)}`;
        const params = new URLSearchParams();
        if (extra?.url) params.set('url', extra.url);
        if (extra?.group) params.set('group', extra.group);
        const fullUrl = params.toString() ? `${url}?${params}` : url;

        const res = await fetch(fullUrl);
        if (!res.ok) {
          error(`[Bark] Failed to notify ${base}: HTTP ${res.status}`);
        } else {
          log(`[Bark] Notified: ${title}`);
        }
      } catch (err) {
        error(`[Bark] Error notifying ${endpoint}:`, err);
      }
    })
  );
}

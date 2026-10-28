import type { Env } from '../types';

const DAY = 86400;
/** 原始事件明细保留天数，超过后由 Cron 清理（日聚合表永久保留） */
export const EVENT_RETENTION_DAYS = 180;

function dayStartSec(offsetDays = 0): number {
  const now = Math.floor(Date.now() / 1000);
  const todayStart = now - (now % DAY);
  return todayStart + offsetDays * DAY;
}

function dayStringToSec(day: string): number {
  return Math.floor(new Date(day + 'T00:00:00Z').getTime() / 1000);
}

/**
 * 每日聚合：把 event_daily 里缺失的天补齐（自上次聚合日或首个事件日起，
 * 到今天为止），然后清理超过保留期的原始明细。INSERT OR REPLACE 保证幂等。
 */
export async function runDailyRollup(env: Env): Promise<{ from: string; aggregated: number; pruned: number }> {
  const db = env.DB;
  const todayStart = dayStartSec(0);

  const last = await db.prepare('SELECT MAX(day) AS d FROM event_daily').first<{ d: string | null }>();
  // 从上次聚合日的下一天开始；没有历史则从保留窗口起点开始
  const startSec = last?.d ? dayStringToSec(last.d) + DAY : dayStartSec(-EVENT_RETENTION_DAYS);
  const fromDate = new Date(startSec * 1000).toISOString().slice(0, 10);

  if (startSec < todayStart) {
    const agg = await db.prepare(
      `INSERT OR REPLACE INTO event_daily (day, poll_id, type, country, device, browser, os, pv, uv)
       SELECT date(ts, 'unixepoch') AS day, poll_id, type, country, device, browser, os,
              COUNT(*) AS pv, COUNT(DISTINCT visitor_id) AS uv
       FROM events
       WHERE ts >= ?1 AND ts < ?2
       GROUP BY day, poll_id, type, country, device, browser, os`
    ).bind(startSec, todayStart).run();
    const pruned = await db.prepare(
      'DELETE FROM events WHERE ts < ?1'
    ).bind(todayStart - EVENT_RETENTION_DAYS * DAY).run();
    return { from: fromDate, aggregated: agg.meta.changes ?? 0, pruned: pruned.meta.changes ?? 0 };
  }
  // 今天尚未结束，无可聚合的新数据；仍执行一次清理兜底
  const pruned = await db.prepare(
    'DELETE FROM events WHERE ts < ?1'
  ).bind(todayStart - EVENT_RETENTION_DAYS * DAY).run();
  return { from: fromDate, aggregated: 0, pruned: pruned.meta.changes ?? 0 };
}

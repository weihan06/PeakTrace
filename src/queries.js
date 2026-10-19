import { db } from './db.js';
import { REGIONS } from './regions.js';

export const allPeaks = () => db.prepare('SELECT * FROM peaks ORDER BY no').all();
export const getPeak = (no) => db.prepare('SELECT * FROM peaks WHERE no = ?').get(no);
export const getUser = (id) => db.prepare('SELECT id, username, display_name, created_at FROM users WHERE id = ?').get(id);

/** 使用者各座百岳完登狀態：Map<peak_no, { first_date, last_date, times }> */
export function doneMap(userId) {
  const rows = db.prepare(`
    SELECT peak_no, MIN(climb_date) AS first_date, MAX(climb_date) AS last_date, COUNT(*) AS times
    FROM climbs WHERE user_id = ? GROUP BY peak_no`).all(userId);
  return new Map(rows.map((r) => [r.peak_no, r]));
}

export function userStats(userId) {
  const peaks = allPeaks();
  const done = doneMap(userId);
  const byRegion = REGIONS.map((region) => {
    const list = peaks.filter((p) => p.region === region);
    return { region, total: list.length, done: list.filter((p) => done.has(p.no)).length };
  }).filter((r) => r.total > 0);

  const byYear = db.prepare(`
    SELECT substr(first_date, 1, 4) AS year, COUNT(*) AS n FROM (
      SELECT MIN(climb_date) AS first_date FROM climbs WHERE user_id = ? GROUP BY peak_no
    ) GROUP BY year ORDER BY year`).all(userId);

  const donePeaks = peaks.filter((p) => done.has(p.no));
  const highest = donePeaks.reduce((a, p) => (!a || p.elevation > a.elevation ? p : a), null);
  const totalClimbs = db.prepare('SELECT COUNT(*) AS n FROM climbs WHERE user_id = ?').get(userId).n;

  return {
    total: peaks.length,
    done: done.size,
    percent: peaks.length ? Math.round((done.size / peaks.length) * 1000) / 10 : 0,
    remaining: peaks.length - done.size,
    totalClimbs,
    byRegion,
    byYear,
    highest,
    totalElevation: Math.round(donePeaks.reduce((s, p) => s + (p.elevation ?? 0), 0)),
    peaks: peaks.map((p) => ({ ...p, done: done.get(p.no) ?? null })),
  };
}

export function recentClimbs(userId, limit = 10) {
  return db.prepare(`
    SELECT c.*, p.name, p.elevation, p.region FROM climbs c JOIN peaks p ON p.no = c.peak_no
    WHERE c.user_id = ? ORDER BY c.climb_date DESC, c.id DESC LIMIT ?`).all(userId, limit);
}

export function planPeaks(planId) {
  return db.prepare('SELECT p.* FROM plan_peaks pp JOIN peaks p ON p.no = pp.peak_no WHERE pp.plan_id = ? ORDER BY p.no').all(planId);
}
export function planMembers(planId) {
  return db.prepare(`
    SELECT u.id, u.username, u.display_name FROM plan_members m JOIN users u ON u.id = m.user_id
    WHERE m.plan_id = ? ORDER BY m.joined_at`).all(planId);
}

export function listPlans({ upcoming, userId } = {}) {
  const where = [];
  const args = [];
  if (upcoming === true) where.push("pl.end_date >= date('now', '+8 hours')");
  if (upcoming === false) where.push("pl.end_date < date('now', '+8 hours')");
  if (userId) { where.push('pl.id IN (SELECT plan_id FROM plan_members WHERE user_id = ?)'); args.push(userId); }
  const plans = db.prepare(`
    SELECT pl.*, u.display_name AS creator_name,
      (SELECT COUNT(*) FROM plan_members m WHERE m.plan_id = pl.id) AS member_count
    FROM plans pl JOIN users u ON u.id = pl.creator_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY pl.start_date ${upcoming === false ? 'DESC' : 'ASC'}`).all(...args);
  return plans.map((pl) => ({ ...pl, peaks: planPeaks(pl.id) }));
}

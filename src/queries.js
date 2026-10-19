import { store, allPeaks, getPeak } from './store.js';
import { REGIONS } from './regions.js';
import { todayTaipei } from './weather.js';

export { allPeaks, getPeak };

const userView = (u) => u && { id: u.id, username: u.username, display_name: u.display_name, created_at: u.created_at };
export const getUser = (id) => userView(store.users.find((u) => u.id === id));
export const findUserByName = (username) => store.users.find((u) => u.username.toLowerCase() === username.toLowerCase());

const byDateDesc = (a, b) => b.climb_date.localeCompare(a.climb_date) || b.id - a.id;

/** 使用者各座百岳完登狀態：Map<peak_no, { first_date, last_date, times }> */
export function doneMap(userId) {
  const map = new Map();
  for (const c of store.climbs) {
    if (c.user_id !== userId) continue;
    const d = map.get(c.peak_no);
    if (!d) map.set(c.peak_no, { peak_no: c.peak_no, first_date: c.climb_date, last_date: c.climb_date, times: 1 });
    else {
      if (c.climb_date < d.first_date) d.first_date = c.climb_date;
      if (c.climb_date > d.last_date) d.last_date = c.climb_date;
      d.times++;
    }
  }
  return map;
}

export function userStats(userId) {
  const peaks = allPeaks();
  const done = doneMap(userId);
  const byRegion = REGIONS.map((region) => {
    const list = peaks.filter((p) => p.region === region);
    return { region, total: list.length, done: list.filter((p) => done.has(p.no)).length };
  }).filter((r) => r.total > 0);

  const yearCount = {};
  for (const d of done.values()) yearCount[d.first_date.slice(0, 4)] = (yearCount[d.first_date.slice(0, 4)] ?? 0) + 1;
  const byYear = Object.keys(yearCount).sort().map((year) => ({ year, n: yearCount[year] }));

  const donePeaks = peaks.filter((p) => done.has(p.no));
  const highest = donePeaks.reduce((a, p) => (!a || p.elevation > a.elevation ? p : a), null);

  return {
    total: peaks.length,
    done: done.size,
    percent: peaks.length ? Math.round((done.size / peaks.length) * 1000) / 10 : 0,
    remaining: peaks.length - done.size,
    totalClimbs: store.climbs.filter((c) => c.user_id === userId).length,
    byRegion,
    byYear,
    highest,
    totalElevation: Math.round(donePeaks.reduce((s, p) => s + (p.elevation ?? 0), 0)),
    peaks: peaks.map((p) => ({ ...p, done: done.get(p.no) ?? null })),
  };
}

/** 登山紀錄附上百岳資料 */
export function userClimbs(userId, limit = Infinity) {
  return store.climbs.filter((c) => c.user_id === userId).sort(byDateDesc).slice(0, limit)
    .map((c) => {
      const p = getPeak(c.peak_no);
      return { ...c, name: p.name, elevation: p.elevation, region: p.region, counties: p.counties };
    });
}
export const recentClimbs = (userId, limit = 10) => userClimbs(userId, limit);

export function peakClimbs(peakNo, limit = 30) {
  return store.climbs.filter((c) => c.peak_no === peakNo).sort(byDateDesc).slice(0, limit)
    .map((c) => ({ ...c, display_name: getUser(c.user_id)?.display_name ?? '（已刪除）' }));
}

export function leaderboard() {
  return store.users.map((u) => {
    const mine = store.climbs.filter((c) => c.user_id === u.id);
    return {
      ...userView(u),
      done: new Set(mine.map((c) => c.peak_no)).size,
      last_climb: mine.reduce((m, c) => (!m || c.climb_date > m ? c.climb_date : m), null),
    };
  }).sort((a, b) => b.done - a.done || (b.last_climb ?? '').localeCompare(a.last_climb ?? ''));
}

export const findPlan = (id) => store.plans.find((pl) => pl.id === id);
export const planPeaks = (plan) => plan.peak_nos.map(getPeak).filter(Boolean).sort((a, b) => a.no - b.no);
export const planMembers = (plan) => plan.members.map((m) => getUser(m.user_id)).filter(Boolean);
export const isPlanMember = (plan, userId) => plan.members.some((m) => m.user_id === userId);

/** 行程附上發起人、人數、百岳資料 */
export function planView(plan) {
  return {
    ...plan,
    creator_name: getUser(plan.creator_id)?.display_name ?? '（已刪除）',
    member_count: plan.members.length,
    peaks: planPeaks(plan),
  };
}

export function listPlans({ upcoming, userId } = {}) {
  const today = todayTaipei();
  return store.plans
    .filter((pl) => (upcoming === true ? pl.end_date >= today : upcoming === false ? pl.end_date < today : true))
    .filter((pl) => !userId || isPlanMember(pl, userId))
    .sort((a, b) => (upcoming === false ? b.start_date.localeCompare(a.start_date) : a.start_date.localeCompare(b.start_date)))
    .map(planView);
}

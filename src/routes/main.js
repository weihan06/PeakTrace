import { Router } from 'express';
import { mutate, nextId, now } from '../store.js';
import { REGIONS } from '../regions.js';
import {
  allPeaks, getPeak, getUser, doneMap, userStats, recentClimbs, userClimbs, peakClimbs, leaderboard, listPlans,
} from '../queries.js';
import { getForecast, todayTaipei } from '../weather.js';
import { requireLogin, flash, isDate, toPeakNos, asyncHandler } from './helpers.js';

const router = Router();

router.get('/', (req, res) => res.redirect(req.session.user ? '/dashboard' : '/login'));

function renderDashboard(res, user, isSelf) {
  res.render('dashboard', {
    title: isSelf ? '我的儀表板' : `${user.display_name} 的百岳`,
    profile: user,
    isSelf,
    stats: userStats(user.id),
    recent: recentClimbs(user.id, 8),
    plans: listPlans({ upcoming: true, userId: user.id }).slice(0, 5),
  });
}

router.get('/dashboard', requireLogin, (req, res, next) => {
  const user = getUser(req.session.user.id);
  if (!user) return req.session.destroy(() => res.redirect('/login')); // 資料檔被清空時
  renderDashboard(res, user, true);
});

router.get('/users', requireLogin, (req, res) => {
  res.render('users', { title: '山友排行', users: leaderboard() });
});

router.get('/users/:id', requireLogin, (req, res, next) => {
  const user = getUser(Number(req.params.id));
  if (!user) return next();
  renderDashboard(res, user, user.id === req.session.user.id);
});

// ---- 百岳 ----
router.get('/peaks', requireLogin, (req, res) => {
  const done = doneMap(req.session.user.id);
  res.render('peaks', { title: '百岳一覽', peaks: allPeaks().map((p) => ({ ...p, done: done.get(p.no) ?? null })), regions: REGIONS });
});

router.get('/peaks/:no', requireLogin, asyncHandler(async (req, res, next) => {
  const peak = getPeak(Number(req.params.no));
  if (!peak) return next();
  const climbs = peakClimbs(peak.no);
  const plans = listPlans({ upcoming: true }).filter((pl) => pl.peaks.some((p) => p.no === peak.no));
  let weather = null;
  let weatherError = null;
  try {
    if (peak.lat != null) weather = (await getForecast([peak])).get(peak.no);
  } catch (e) {
    weatherError = e.message;
  }
  res.render('peak', { title: peak.name, peak, climbs, plans, weather, weatherError, mine: climbs.filter((c) => c.user_id === req.session.user.id) });
}));

// ---- 登山紀錄 ----
router.get('/climbs', requireLogin, (req, res) => {
  res.render('climbs', {
    title: '登山紀錄',
    climbs: userClimbs(req.session.user.id),
    regions: REGIONS,
    preselect: toPeakNos(req.query.peak),
    today: todayTaipei(),
  });
});

/** 新增完登紀錄，同一人同一天同一座山只記一次；回傳新增筆數 */
export function addClimbs(userId, peakNos, climbDate, note, planId = null) {
  return mutate((s) => {
    let added = 0;
    for (const no of peakNos) {
      if (!getPeak(no)) continue;
      if (s.climbs.some((c) => c.user_id === userId && c.peak_no === no && c.climb_date === climbDate)) continue;
      s.climbs.push({ id: nextId('climbs'), user_id: userId, peak_no: no, climb_date: climbDate, note: note || null, plan_id: planId, created_at: now() });
      added++;
    }
    return added;
  });
}

router.post('/climbs', requireLogin, (req, res) => {
  const peakNos = toPeakNos(req.body.peaks);
  const { climbDate, note = '' } = req.body;
  if (!peakNos.length) { flash(req, 'danger', '請至少選擇一座百岳'); return res.redirect('/climbs'); }
  if (!isDate(climbDate)) { flash(req, 'danger', '請選擇完登日期'); return res.redirect('/climbs'); }
  if (climbDate > todayTaipei()) { flash(req, 'danger', '完登日期不能晚於今天'); return res.redirect('/climbs'); }

  const added = addClimbs(req.session.user.id, peakNos, climbDate, note.trim());
  flash(req, 'success', added ? `已新增 ${added} 筆完登紀錄 🎉` : '這些紀錄已經存在');
  res.redirect('/climbs');
});

router.post('/climbs/:id/delete', requireLogin, (req, res) => {
  const id = Number(req.params.id);
  mutate((s) => {
    s.climbs = s.climbs.filter((c) => !(c.id === id && c.user_id === req.session.user.id));
  });
  flash(req, 'success', '已刪除紀錄');
  res.redirect(req.get('Referer')?.includes('/peaks/') ? req.get('Referer') : '/climbs');
});

// ---- JSON API（地圖 / select2 使用）----
router.get('/api/peaks', requireLogin, (req, res) => {
  const done = doneMap(req.session.user.id);
  res.json(allPeaks().map((p) => ({ ...p, done: done.has(p.no), first_date: done.get(p.no)?.first_date ?? null })));
});

export default router;

import { Router } from 'express';
import { db, tx } from '../db.js';
import { REGIONS } from '../regions.js';
import { allPeaks, getPeak, getUser, doneMap, userStats, recentClimbs, listPlans } from '../queries.js';
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

router.get('/dashboard', requireLogin, (req, res) => renderDashboard(res, getUser(req.session.user.id), true));

router.get('/users', requireLogin, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.created_at,
      COUNT(DISTINCT c.peak_no) AS done, MAX(c.climb_date) AS last_climb
    FROM users u LEFT JOIN climbs c ON c.user_id = u.id
    GROUP BY u.id ORDER BY done DESC, last_climb DESC`).all();
  res.render('users', { title: '山友排行', users });
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
  const climbs = db.prepare(`
    SELECT c.*, u.display_name FROM climbs c JOIN users u ON u.id = c.user_id
    WHERE c.peak_no = ? ORDER BY c.climb_date DESC LIMIT 30`).all(peak.no);
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
  const uid = req.session.user.id;
  const climbs = db.prepare(`
    SELECT c.*, p.name, p.elevation, p.region, p.counties FROM climbs c JOIN peaks p ON p.no = c.peak_no
    WHERE c.user_id = ? ORDER BY c.climb_date DESC, p.no`).all(uid);
  res.render('climbs', {
    title: '登山紀錄',
    climbs,
    regions: REGIONS,
    preselect: toPeakNos(req.query.peak),
    today: todayTaipei(),
  });
});

router.post('/climbs', requireLogin, (req, res) => {
  const peakNos = toPeakNos(req.body.peaks);
  const { climbDate, note = '' } = req.body;
  if (!peakNos.length) { flash(req, 'danger', '請至少選擇一座百岳'); return res.redirect('/climbs'); }
  if (!isDate(climbDate)) { flash(req, 'danger', '請選擇完登日期'); return res.redirect('/climbs'); }
  if (climbDate > todayTaipei()) { flash(req, 'danger', '完登日期不能晚於今天'); return res.redirect('/climbs'); }

  const insert = db.prepare('INSERT OR IGNORE INTO climbs (user_id, peak_no, climb_date, note) VALUES (?, ?, ?, ?)');
  const added = tx(() => peakNos.filter((no) => getPeak(no))
    .reduce((n, no) => n + Number(insert.run(req.session.user.id, no, climbDate, note.trim() || null).changes), 0));
  flash(req, 'success', added ? `已新增 ${added} 筆完登紀錄 🎉` : '這些紀錄已經存在');
  res.redirect('/climbs');
});

router.post('/climbs/:id/delete', requireLogin, (req, res) => {
  db.prepare('DELETE FROM climbs WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.session.user.id);
  flash(req, 'success', '已刪除紀錄');
  res.redirect(req.get('Referer')?.includes('/peaks/') ? req.get('Referer') : '/climbs');
});

// ---- JSON API（地圖 / select2 使用）----
router.get('/api/peaks', requireLogin, (req, res) => {
  const done = doneMap(req.session.user.id);
  res.json(allPeaks().map((p) => ({ ...p, done: done.has(p.no), first_date: done.get(p.no)?.first_date ?? null })));
});

export default router;

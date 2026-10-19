import { Router } from 'express';
import { db, tx } from '../db.js';
import { REGIONS } from '../regions.js';
import { getPeak, doneMap, listPlans, planPeaks, planMembers } from '../queries.js';
import { getTripWeather, todayTaipei } from '../weather.js';
import { requireLogin, flash, isDate, toPeakNos, asyncHandler } from './helpers.js';

const router = Router();
router.use(requireLogin);

const getPlan = (id) => db.prepare(`
  SELECT pl.*, u.display_name AS creator_name FROM plans pl JOIN users u ON u.id = pl.creator_id WHERE pl.id = ?`).get(id);

router.get('/', (req, res) => {
  res.render('plans', {
    title: '約爬山',
    upcoming: listPlans({ upcoming: true }),
    past: listPlans({ upcoming: false }).slice(0, 20),
    myIds: new Set(db.prepare('SELECT plan_id FROM plan_members WHERE user_id = ?').all(req.session.user.id).map((r) => r.plan_id)),
  });
});

router.get('/new', (req, res) => {
  res.render('plan-form', { title: '發起登山行程', regions: REGIONS, form: { peaks: toPeakNos(req.query.peak) }, today: todayTaipei() });
});

router.post('/', (req, res) => {
  const form = {
    title: (req.body.title ?? '').trim(),
    startDate: req.body.startDate,
    endDate: req.body.endDate || req.body.startDate,
    meetingPoint: (req.body.meetingPoint ?? '').trim(),
    notes: (req.body.notes ?? '').trim(),
    peaks: toPeakNos(req.body.peaks).filter((no) => getPeak(no)),
  };
  let error = null;
  if (!form.peaks.length) error = '請至少選擇一座目標百岳';
  else if (!isDate(form.startDate) || !isDate(form.endDate)) error = '請選擇出發與結束日期';
  else if (form.endDate < form.startDate) error = '結束日期不能早於出發日期';
  if (error) {
    return res.status(400).render('plan-form', { title: '發起登山行程', regions: REGIONS, form, today: todayTaipei(), flash: { type: 'danger', message: error } });
  }
  if (!form.title) form.title = form.peaks.map((no) => getPeak(no).name).join('、');

  const planId = tx(() => {
    const id = Number(db.prepare('INSERT INTO plans (creator_id, title, start_date, end_date, meeting_point, notes) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.session.user.id, form.title, form.startDate, form.endDate, form.meetingPoint || null, form.notes || null).lastInsertRowid);
    const addPeak = db.prepare('INSERT INTO plan_peaks (plan_id, peak_no) VALUES (?, ?)');
    form.peaks.forEach((no) => addPeak.run(id, no));
    db.prepare('INSERT INTO plan_members (plan_id, user_id) VALUES (?, ?)').run(id, req.session.user.id);
    return id;
  });
  flash(req, 'success', '行程已建立，把連結分享給山友一起報名吧！');
  res.redirect(`/plans/${planId}`);
});

router.get('/:id', asyncHandler(async (req, res, next) => {
  const plan = getPlan(Number(req.params.id));
  if (!plan) return next();
  const peaks = planPeaks(plan.id);
  const members = planMembers(plan.id);
  const uid = req.session.user.id;

  // 每位成員是否已完登各目標
  const memberDone = new Map(members.map((m) => [m.id, doneMap(m.id)]));

  let weather = { mode: 'none', perPeak: new Map() };
  let weatherError = null;
  try {
    weather = await getTripWeather(peaks, plan.start_date, plan.end_date);
  } catch (e) {
    weatherError = e.message;
  }

  res.render('plan', {
    title: plan.title,
    plan,
    peaks,
    members,
    memberDone,
    weather,
    weatherError,
    isMember: members.some((m) => m.id === uid),
    isCreator: plan.creator_id === uid,
    today: todayTaipei(),
  });
}));

router.post('/:id/join', (req, res) => {
  const plan = getPlan(Number(req.params.id));
  if (plan) db.prepare('INSERT OR IGNORE INTO plan_members (plan_id, user_id) VALUES (?, ?)').run(plan.id, req.session.user.id);
  flash(req, 'success', '已報名這次行程');
  res.redirect(`/plans/${req.params.id}`);
});

router.post('/:id/leave', (req, res) => {
  const plan = getPlan(Number(req.params.id));
  if (plan && plan.creator_id !== req.session.user.id) {
    db.prepare('DELETE FROM plan_members WHERE plan_id = ? AND user_id = ?').run(plan.id, req.session.user.id);
    flash(req, 'success', '已退出行程');
  }
  res.redirect(`/plans/${req.params.id}`);
});

router.post('/:id/delete', (req, res) => {
  const { changes } = db.prepare('DELETE FROM plans WHERE id = ? AND creator_id = ?').run(Number(req.params.id), req.session.user.id);
  flash(req, changes ? 'success' : 'danger', changes ? '行程已取消' : '只有發起人可以取消行程');
  res.redirect('/plans');
});

// 行程結束後，參加者一鍵把目標百岳登記為完登
router.post('/:id/complete', (req, res, next) => {
  const plan = getPlan(Number(req.params.id));
  if (!plan) return next();
  const uid = req.session.user.id;
  if (!db.prepare('SELECT 1 FROM plan_members WHERE plan_id = ? AND user_id = ?').get(plan.id, uid)) {
    flash(req, 'danger', '只有參加者可以登記完登');
    return res.redirect(`/plans/${plan.id}`);
  }
  const climbDate = isDate(req.body.climbDate) ? req.body.climbDate : plan.end_date;
  if (climbDate > todayTaipei()) {
    flash(req, 'danger', '行程尚未結束，無法登記完登');
    return res.redirect(`/plans/${plan.id}`);
  }
  const selected = new Set(toPeakNos(req.body.peaks));
  const insert = db.prepare('INSERT OR IGNORE INTO climbs (user_id, peak_no, climb_date, note, plan_id) VALUES (?, ?, ?, ?, ?)');
  const added = tx(() => planPeaks(plan.id).filter((p) => selected.has(p.no))
    .reduce((n, p) => n + Number(insert.run(uid, p.no, climbDate, `行程：${plan.title}`, plan.id).changes), 0));
  flash(req, 'success', `已新增 ${added} 筆完登紀錄 🎉`);
  res.redirect(`/plans/${plan.id}`);
});

export default router;

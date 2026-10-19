import { Router } from 'express';
import { store, mutate, nextId, now } from '../store.js';
import { REGIONS } from '../regions.js';
import { getPeak, doneMap, listPlans, findPlan, planView, planMembers, isPlanMember } from '../queries.js';
import { getTripWeather, todayTaipei } from '../weather.js';
import { addClimbs } from './main.js';
import { requireLogin, flash, isDate, toPeakNos, asyncHandler } from './helpers.js';

const router = Router();
router.use(requireLogin);

router.get('/', (req, res) => {
  const uid = req.session.user.id;
  res.render('plans', {
    title: '約爬山',
    upcoming: listPlans({ upcoming: true }),
    past: listPlans({ upcoming: false }).slice(0, 20),
    myIds: new Set(store.plans.filter((pl) => isPlanMember(pl, uid)).map((pl) => pl.id)),
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

  const planId = mutate((s) => {
    const created = now();
    const plan = {
      id: nextId('plans'),
      creator_id: req.session.user.id,
      title: form.title,
      start_date: form.startDate,
      end_date: form.endDate,
      meeting_point: form.meetingPoint || null,
      notes: form.notes || null,
      created_at: created,
      peak_nos: form.peaks,
      members: [{ user_id: req.session.user.id, joined_at: created }],
    };
    s.plans.push(plan);
    return plan.id;
  });
  flash(req, 'success', '行程已建立，把連結分享給山友一起報名吧！');
  res.redirect(`/plans/${planId}`);
});

router.get('/:id', asyncHandler(async (req, res, next) => {
  const raw = findPlan(Number(req.params.id));
  if (!raw) return next();
  const plan = planView(raw);
  const { peaks } = plan;
  const members = planMembers(raw);
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
    isMember: isPlanMember(raw, uid),
    isCreator: plan.creator_id === uid,
    today: todayTaipei(),
  });
}));

router.post('/:id/join', (req, res) => {
  const plan = findPlan(Number(req.params.id));
  const uid = req.session.user.id;
  if (plan && !isPlanMember(plan, uid)) mutate(() => plan.members.push({ user_id: uid, joined_at: now() }));
  flash(req, 'success', '已報名這次行程');
  res.redirect(`/plans/${req.params.id}`);
});

router.post('/:id/leave', (req, res) => {
  const plan = findPlan(Number(req.params.id));
  const uid = req.session.user.id;
  if (plan && plan.creator_id !== uid) {
    mutate(() => { plan.members = plan.members.filter((m) => m.user_id !== uid); });
    flash(req, 'success', '已退出行程');
  }
  res.redirect(`/plans/${req.params.id}`);
});

router.post('/:id/delete', (req, res) => {
  const plan = findPlan(Number(req.params.id));
  const ok = plan && plan.creator_id === req.session.user.id;
  if (ok) mutate((s) => { s.plans = s.plans.filter((pl) => pl !== plan); });
  flash(req, ok ? 'success' : 'danger', ok ? '行程已取消' : '只有發起人可以取消行程');
  res.redirect('/plans');
});

// 行程結束後，參加者一鍵把目標百岳登記為完登
router.post('/:id/complete', (req, res, next) => {
  const plan = findPlan(Number(req.params.id));
  if (!plan) return next();
  const uid = req.session.user.id;
  if (!isPlanMember(plan, uid)) {
    flash(req, 'danger', '只有參加者可以登記完登');
    return res.redirect(`/plans/${plan.id}`);
  }
  const climbDate = isDate(req.body.climbDate) ? req.body.climbDate : plan.end_date;
  if (climbDate > todayTaipei()) {
    flash(req, 'danger', '行程尚未結束，無法登記完登');
    return res.redirect(`/plans/${plan.id}`);
  }
  const selected = toPeakNos(req.body.peaks).filter((no) => plan.peak_nos.includes(no));
  const added = addClimbs(uid, selected, climbDate, `行程：${plan.title}`, plan.id);
  flash(req, 'success', `已新增 ${added} 筆完登紀錄 🎉`);
  res.redirect(`/plans/${plan.id}`);
});

export default router;

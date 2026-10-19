// 共用：Firebase 資料存取、登入狀態、頁面版型、統計
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, updateDoc,
  query, where, arrayUnion, arrayRemove,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

export const REGIONS = ['北部', '中部', '南部', '東部'];
export const configured = Boolean(firebaseConfig.projectId);
const db = configured ? getFirestore(initializeApp(firebaseConfig)) : null;

// ---------- 小工具 ----------
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const params = new URLSearchParams(location.search);
export const todayTaipei = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
export const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const dateRange = (s, e) => `${s}${e && e !== s ? ` ~ ${e}` : ''}`;
const byDateDesc = (a, b) => b.climb_date.localeCompare(a.climb_date) || b.created_at.localeCompare(a.created_at);

export function flash(type, message) {
  try { sessionStorage.setItem('flash', JSON.stringify({ type, message })); } catch { /* 無痕模式等 */ }
}
function takeFlash() {
  try {
    const f = JSON.parse(sessionStorage.getItem('flash') ?? 'null');
    sessionStorage.removeItem('flash');
    return f;
  } catch { return null; }
}
export function showAlert(type, message) {
  document.getElementById('alerts').insertAdjacentHTML('beforeend',
    `<div class="alert alert-${type} alert-dismissible fade show">${esc(message)}<button type="button" class="btn-close" data-bs-dismiss="alert"></button></div>`);
}

// ---------- 登入（只需帳號，存在瀏覽器）----------
export const userIdOf = (username) => `u_${encodeURIComponent(username.trim().toLowerCase())}`;
export function currentUser() {
  try { return JSON.parse(localStorage.getItem('peaktrace.user') ?? 'null'); } catch { return null; }
}

export async function login(username) {
  username = username.trim();
  const id = userIdOf(username);
  const ref = doc(db, 'users', id);
  const snap = await getDoc(ref);
  let user = snap.exists() ? snap.data() : null;
  const isNew = !user;
  if (isNew) {
    user = { username, display_name: username, created_at: now() };
    await setDoc(ref, user);
  }
  localStorage.setItem('peaktrace.user', JSON.stringify({ id, username: user.username, displayName: user.display_name }));
  return isNew;
}
export function logout() {
  localStorage.removeItem('peaktrace.user');
  location.href = 'login.html';
}

// ---------- 版型 ----------
const NAV = [
  ['index.html', 'speedometer2', '儀表板'],
  ['climbs.html', 'journal-check', '登山紀錄'],
  ['peaks.html', 'map', '百岳一覽'],
  ['plans.html', 'people', '約爬山'],
  ['users.html', 'trophy', '山友排行'],
];

/** 建立導覽列與主要區塊；需要登入的頁面未登入時導向 login.html。回傳 { user, main } */
export function initPage({ title, active, requireLogin = true }) {
  document.title = `${title}｜PeakTrace 百岳完登紀錄`;
  const user = currentUser();
  const page = location.pathname.split('/').pop() || 'index.html';
  document.body.insertAdjacentHTML('afterbegin', `
<nav class="navbar navbar-expand-lg navbar-dark mb-4">
  <div class="container">
    <a class="navbar-brand" href="index.html"><i class="bi bi-triangle-fill"></i> PeakTrace 百岳</a>
    ${user ? `
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nav"><span class="navbar-toggler-icon"></span></button>
    <div class="collapse navbar-collapse" id="nav">
      <ul class="navbar-nav me-auto">
        ${NAV.map(([href, icon, label]) => `<li class="nav-item"><a class="nav-link ${(active ?? page) === href ? 'active' : ''}" href="${href}"><i class="bi bi-${icon}"></i> ${label}</a></li>`).join('')}
      </ul>
      <span class="navbar-text text-white me-3"><i class="bi bi-person-circle"></i> ${esc(user.displayName)}</span>
      <button class="btn btn-sm btn-outline-light" id="logoutBtn">登出</button>
    </div>` : ''}
  </div>
</nav>
<main class="container pb-5"><div id="alerts"></div><div id="content"><div class="text-center text-body-secondary py-5"><div class="spinner-border"></div></div></div></main>
<footer class="text-center text-body-secondary small pb-4">百岳資料來源：維基百科「台灣百岳」｜天氣：Open-Meteo｜地圖：OpenStreetMap / OpenTopoMap｜資料庫：Firebase</footer>`);
  document.getElementById('logoutBtn')?.addEventListener('click', logout);
  const main = document.getElementById('content');

  if (!configured) {
    main.innerHTML = `<div class="card p-4"><h1 class="h4">尚未設定 Firebase</h1>
      <p class="mb-0">請依 README 建立 Firebase 專案，並把設定填入 <code>docs/js/firebase-config.js</code>。</p></div>`;
    throw new Error('Firebase 尚未設定');
  }
  if (requireLogin && !user) {
    sessionStorage.setItem('returnTo', location.href);
    location.replace('login.html');
    throw new Error('需要登入');
  }
  const f = takeFlash();
  if (f) showAlert(f.type, f.message);
  return { user, main };
}

/** 執行頁面主程式，錯誤時顯示訊息 */
export async function run(fn) {
  try {
    await fn();
  } catch (e) {
    if (e.message === '需要登入' || e.message === 'Firebase 尚未設定') return;
    console.error(e);
    const main = document.getElementById('content');
    if (main) main.innerHTML = `<div class="card p-4"><h1 class="h5">發生錯誤</h1><p class="text-body-secondary mb-0">${esc(e.message)}</p></div>`;
  }
}

/** 表單送出時停用按鈕避免重複送出 */
export function busy(form, on) {
  form.querySelectorAll('button').forEach((b) => { b.disabled = on; });
}

// ---------- 百岳（靜態檔）----------
let peaksCache;
export async function loadPeaks() {
  if (!peaksCache) {
    const raw = await (await fetch('data/peaks.json')).json();
    peaksCache = raw.map((p) => ({
      no: p.no,
      name: p.name,
      elevation: p.elevation,
      counties: p.counties.join('、'),
      region: p.region,
      range_name: p.range,
      route: p.route,
      national_park: p.nationalPark,
      grade: p.grade,
      lat: p.lat,
      lng: p.lng,
      google_maps_url: p.googleMapsUrl,
      wiki_url: p.wikiUrl,
    })).sort((a, b) => a.no - b.no);
  }
  return peaksCache;
}
export const peakMap = (peaks) => new Map(peaks.map((p) => [p.no, p]));

// ---------- 使用者 ----------
const withId = (snap) => ({ id: snap.id, ...snap.data() });
export async function getUser(id) {
  const snap = await getDoc(doc(db, 'users', id));
  return snap.exists() ? withId(snap) : null;
}
export async function listUsers() {
  return (await getDocs(collection(db, 'users'))).docs.map(withId);
}

// ---------- 登山紀錄 ----------
export async function listClimbs(filter = {}) {
  const [field, value] = filter.userId ? ['user_id', filter.userId] : filter.peakNo ? ['peak_no', filter.peakNo] : [];
  const q = field ? query(collection(db, 'climbs'), where(field, '==', value)) : collection(db, 'climbs');
  return (await getDocs(q)).docs.map(withId).sort(byDateDesc);
}

/** 同一人同一天同一座山只記一次（以文件 ID 去重）；回傳新增筆數 */
export async function addClimbs(userId, peakNos, climbDate, note, planId = null) {
  const results = await Promise.all(peakNos.map(async (no) => {
    const ref = doc(db, 'climbs', `${userId}_${no}_${climbDate}`);
    if ((await getDoc(ref)).exists()) return 0;
    await setDoc(ref, { user_id: userId, peak_no: no, climb_date: climbDate, note: note || null, plan_id: planId, created_at: now() });
    return 1;
  }));
  return results.reduce((a, b) => a + b, 0);
}
export const deleteClimb = (id) => deleteDoc(doc(db, 'climbs', id));

/** 使用者各座百岳完登狀態：Map<peak_no, { first_date, last_date, times }> */
export function doneMap(climbs) {
  const map = new Map();
  for (const c of climbs) {
    const d = map.get(c.peak_no);
    if (!d) map.set(c.peak_no, { first_date: c.climb_date, last_date: c.climb_date, times: 1 });
    else {
      if (c.climb_date < d.first_date) d.first_date = c.climb_date;
      if (c.climb_date > d.last_date) d.last_date = c.climb_date;
      d.times++;
    }
  }
  return map;
}

export function userStats(peaks, climbs) {
  const done = doneMap(climbs);
  const byRegion = REGIONS.map((region) => {
    const list = peaks.filter((p) => p.region === region);
    return { region, total: list.length, done: list.filter((p) => done.has(p.no)).length };
  }).filter((r) => r.total > 0);
  const yearCount = {};
  for (const d of done.values()) yearCount[d.first_date.slice(0, 4)] = (yearCount[d.first_date.slice(0, 4)] ?? 0) + 1;
  const donePeaks = peaks.filter((p) => done.has(p.no));
  return {
    total: peaks.length,
    done: done.size,
    percent: peaks.length ? Math.round((done.size / peaks.length) * 1000) / 10 : 0,
    remaining: peaks.length - done.size,
    totalClimbs: climbs.length,
    byRegion,
    byYear: Object.keys(yearCount).sort().map((year) => ({ year, n: yearCount[year] })),
    highest: donePeaks.reduce((a, p) => (!a || p.elevation > a.elevation ? p : a), null),
    totalElevation: Math.round(donePeaks.reduce((s, p) => s + (p.elevation ?? 0), 0)),
    peaks: peaks.map((p) => ({ ...p, done: done.get(p.no) ?? null })),
  };
}

// ---------- 約爬山 ----------
// plans/{id}: { creator_id, creator_name, title, start_date, end_date, meeting_point, notes, created_at, peak_nos: [], member_ids: [] }
export async function listPlans({ upcoming, userId } = {}) {
  const today = todayTaipei();
  const q = userId ? query(collection(db, 'plans'), where('member_ids', 'array-contains', userId)) : collection(db, 'plans');
  return (await getDocs(q)).docs.map(withId)
    .filter((pl) => (upcoming === true ? pl.end_date >= today : upcoming === false ? pl.end_date < today : true))
    .sort((a, b) => (upcoming === false ? b.start_date.localeCompare(a.start_date) : a.start_date.localeCompare(b.start_date)));
}
export async function getPlan(id) {
  const snap = await getDoc(doc(db, 'plans', id));
  return snap.exists() ? withId(snap) : null;
}
export async function createPlan(plan) {
  return (await addDoc(collection(db, 'plans'), plan)).id;
}
export const joinPlan = (id, userId) => updateDoc(doc(db, 'plans', id), { member_ids: arrayUnion(userId) });
export const leavePlan = (id, userId) => updateDoc(doc(db, 'plans', id), { member_ids: arrayRemove(userId) });
export const deletePlan = (id) => deleteDoc(doc(db, 'plans', id));

// ---------- 共用畫面片段 ----------
export const peakBadges = (nos, byNo) => nos.map((no) => byNo.get(no)).filter(Boolean).sort((a, b) => a.no - b.no)
  .map((p) => `<span class="badge text-bg-light border me-1 mb-1">#${p.no} ${esc(p.name)} ${p.elevation}m</span>`).join('');

export function weatherDays(days) {
  return `<div class="wx-scroll">${days.map((d) => `
  <div class="wx-day card p-2 ${d.inTrip ? 'in-trip' : ''}">
    <div class="small fw-semibold">${d.date.slice(5).replace('-', '/')} (${'日一二三四五六'[new Date(`${d.date}T00:00:00`).getDay()]})</div>
    <div class="icon" title="${esc(d.text)}">${d.icon}</div>
    <div class="small">${esc(d.text)}</div>
    <div><span class="text-danger">${Math.round(d.tmax)}°</span> / <span class="text-primary">${Math.round(d.tmin)}°</span></div>
    <div class="small text-body-secondary"><i class="bi bi-umbrella"></i> ${d.precipProb ?? '–'}% · ${d.precip}mm</div>
    <div class="small text-body-secondary"><i class="bi bi-wind"></i> ${Math.round(d.wind)} km/h</div>
  </div>`).join('')}</div>`;
}

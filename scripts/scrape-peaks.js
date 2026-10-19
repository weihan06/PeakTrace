// 從中文維基百科「台灣百岳」條目抓取百岳清單，並以 MediaWiki / Wikidata API 補上座標。
// 執行：npm run scrape  → 產生 data/peaks.json
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { countyToRegion } from '../src/regions.js';

const API = 'https://zh.wikipedia.org/w/api.php';
const UA = 'PeakTrace/1.0 (Taiwan 100 peaks tracker)';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'peaks.json');

async function api(params) {
  const url = new URL(API);
  for (const [k, v] of Object.entries({ format: 'json', formatversion: '2', ...params })) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Wikipedia API ${res.status}`);
  return res.json();
}

// 移除 <ref>、{{efn}}、{{r}} 等註腳
function stripNotes(text) {
  let t = text.replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '');
  // 反覆移除內層模板（efn 可能巢狀 tsl 等）
  for (let i = 0; i < 5; i++) t = t.replace(/\{\{(?:efn|r|refn|NoteTag)\|[^{}]*\}\}/gi, '');
  return t;
}

// [[A|B]] → B，[[A]] → A；回傳顯示文字
function linkText(s) {
  return s.replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1');
}
// 取第一個連結的目標頁名
function linkTarget(s) {
  const m = s.match(/\[\[([^|\]]+)/);
  return m ? m[1].trim() : null;
}
function clean(s) {
  return linkText(s)
    .replace(/\{\{small\|([^}]*)\}\}/g, '$1')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/<br\s*\/?>/gi, '、')
    .replace(/align\s*=\s*"?center"?\s*\|/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^、|、$/g, '')
    .trim();
}

function parseTable(wikitext) {
  const t = stripNotes(wikitext);
  const start = t.indexOf('{| class="wikitable sortable"');
  const end = t.indexOf('\n|}', start);
  const table = t.slice(start, end);
  const rows = table.split(/\n\|-\s*/).slice(1);
  const peaks = [];
  for (const row of rows) {
    // 每列由 "\n|" 開頭的行組成，行內以 "||" 分隔儲存格
    const cells = row
      .split('\n')
      .filter((l) => l.startsWith('|'))
      .map((l) => l.slice(1))
      .join('||')
      .split('||')
      .map((c) => c.replace(/^\s*align\s*=\s*"?center"?\s*\|/, '').trim());
    if (cells.length < 9) continue;
    const no = parseInt(clean(cells[0]), 10);
    if (!no) continue;
    const countiesRaw = cells[4];
    const counties = [...countiesRaw.matchAll(/\[\[([^|\]]+)(?:\|[^\]]*)?\]\]/g)].map((m) => m[1].replace('台', '臺'));
    peaks.push({
      no,
      name: clean(cells[1]),
      wikiTitle: linkTarget(cells[1]),
      elevation: parseFloat(clean(cells[2])) || null,
      counties,
      range: clean(cells[5]),
      route: clean(cells[6]),
      nationalPark: clean(cells[7]),
      grade: parseInt(clean(cells[8]), 10) || null,
    });
  }
  return peaks;
}

async function fetchCoordinates(titles) {
  const result = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const data = await api({
      action: 'query',
      prop: 'coordinates|pageprops',
      ppprop: 'wikibase_item',
      titles: batch.join('|'),
      redirects: '1',
      colimit: 'max',
    });
    const alias = new Map(batch.map((t) => [t, t]));
    for (const n of data.query.normalized ?? []) alias.set(n.to, n.from);
    for (const r of data.query.redirects ?? []) alias.set(r.to, alias.get(r.from) ?? r.from);
    for (const p of data.query.pages) {
      const original = alias.get(p.title) ?? p.title;
      const c = p.coordinates?.find((x) => x.primary) ?? p.coordinates?.[0];
      result.set(original, { lat: c?.lat ?? null, lng: c?.lon ?? null, qid: p.pageprops?.wikibase_item ?? null });
    }
  }
  return result;
}

async function fetchWikidataCoords(qids) {
  const out = new Map();
  for (let i = 0; i < qids.length; i += 50) {
    const url = new URL('https://www.wikidata.org/w/api.php');
    url.search = new URLSearchParams({ action: 'wbgetentities', ids: qids.slice(i, i + 50).join('|'), props: 'claims', format: 'json' });
    const data = await (await fetch(url, { headers: { 'User-Agent': UA } })).json();
    for (const [id, ent] of Object.entries(data.entities ?? {})) {
      const v = ent.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
      if (v) out.set(id, { lat: v.latitude, lng: v.longitude });
    }
  }
  return out;
}

export async function scrapePeaks() {
  const page = await api({ action: 'parse', page: '台灣百岳', prop: 'wikitext', variant: 'zh-tw' });
  const peaks = parseTable(page.parse.wikitext);
  if (peaks.length < 100) throw new Error(`只解析到 ${peaks.length} 座山，表格格式可能已變更`);

  const coords = await fetchCoordinates(peaks.map((p) => p.wikiTitle));
  const missing = peaks.filter((p) => coords.get(p.wikiTitle)?.lat == null && coords.get(p.wikiTitle)?.qid);
  const wd = await fetchWikidataCoords(missing.map((p) => coords.get(p.wikiTitle).qid));

  return peaks.map((p) => {
    const c = coords.get(p.wikiTitle) ?? {};
    const w = c.qid ? wd.get(c.qid) : null;
    const lat = c.lat ?? w?.lat ?? null;
    const lng = c.lng ?? w?.lng ?? null;
    return {
      ...p,
      region: countyToRegion(p.counties[0]),
      lat,
      lng,
      googleMapsUrl: lat != null ? `https://www.google.com/maps?q=${lat},${lng}` : null,
      wikiUrl: `https://zh.wikipedia.org/wiki/${encodeURIComponent(p.wikiTitle)}`,
    };
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const peaks = await scrapePeaks();
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(peaks, null, 2), 'utf8');
  const noCoord = peaks.filter((p) => p.lat == null);
  console.log(`已寫入 ${peaks.length} 座百岳 → ${OUT}`);
  if (noCoord.length) console.log('缺少座標：', noCoord.map((p) => `${p.no}.${p.name}`).join(', '));
}

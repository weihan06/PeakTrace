import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.DATA_DIR ?? path.join(ROOT, 'data');
mkdirSync(DATA_DIR, { recursive: true });

// 整份資料放在記憶體，每次異動後整檔寫回（先寫暫存檔再改名，避免寫到一半損毀）
export class JsonFile {
  constructor(file, initial) {
    this.file = file;
    this.data = existsSync(file) ? { ...initial, ...JSON.parse(readFileSync(file, 'utf8')) } : structuredClone(initial);
  }
  save() {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    renameSync(tmp, this.file);
  }
}

const file = new JsonFile(process.env.STORE_PATH ?? path.join(DATA_DIR, 'store.json'), {
  seq: { users: 0, climbs: 0, plans: 0 },
  users: [], // { id, username, display_name, created_at }
  climbs: [], // { id, user_id, peak_no, climb_date, note, plan_id, created_at }
  plans: [], // { id, creator_id, title, start_date, end_date, meeting_point, notes, created_at, peak_nos: [], members: [{ user_id, joined_at }] }
});
export const store = file.data;

/** 執行異動並存檔 */
export function mutate(fn) {
  const result = fn(store);
  file.save();
  return result;
}

export const nextId = (kind) => ++store.seq[kind];
export const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// ---- 百岳（唯讀，來自 npm run scrape 產生的 data/peaks.json）----
const PEAKS_FILE = path.join(DATA_DIR, 'peaks.json');
if (!existsSync(PEAKS_FILE)) throw new Error(`找不到 ${PEAKS_FILE}，請先執行 npm run scrape`);
const peaks = JSON.parse(readFileSync(PEAKS_FILE, 'utf8'))
  .map((p) => ({
    no: p.no,
    name: p.name,
    wiki_title: p.wikiTitle,
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
  }))
  .sort((a, b) => a.no - b.no);
const peakByNo = new Map(peaks.map((p) => [p.no, p]));

export const allPeaks = () => peaks;
export const getPeak = (no) => peakByNo.get(no);

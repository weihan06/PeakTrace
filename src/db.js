import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');
mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(process.env.DB_PATH ?? path.join(DATA_DIR, 'peaktrace.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS peaks (
  no             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL,
  wiki_title     TEXT,
  elevation      REAL,
  counties       TEXT,
  region         TEXT,
  range_name     TEXT,
  route          TEXT,
  national_park  TEXT,
  grade          INTEGER,
  lat            REAL,
  lng            REAL,
  google_maps_url TEXT,
  wiki_url       TEXT
);
CREATE TABLE IF NOT EXISTS climbs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  peak_no    INTEGER NOT NULL REFERENCES peaks(no),
  climb_date TEXT NOT NULL,
  note       TEXT,
  plan_id    INTEGER REFERENCES plans(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, peak_no, climb_date)
);
CREATE TABLE IF NOT EXISTS plans (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  start_date    TEXT NOT NULL,
  end_date      TEXT NOT NULL,
  meeting_point TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS plan_peaks (
  plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  peak_no INTEGER NOT NULL REFERENCES peaks(no),
  PRIMARY KEY (plan_id, peak_no)
);
CREATE TABLE IF NOT EXISTS plan_members (
  plan_id   INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (plan_id, user_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  sid     TEXT PRIMARY KEY,
  sess    TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_climbs_user ON climbs(user_id);
`);

// 以 data/peaks.json（由 npm run scrape 產生）更新百岳資料
export function seedPeaks(file = path.join(DATA_DIR, 'peaks.json')) {
  if (!existsSync(file)) throw new Error(`找不到 ${file}，請先執行 npm run scrape`);
  const peaks = JSON.parse(readFileSync(file, 'utf8'));
  const upsert = db.prepare(`
    INSERT INTO peaks (no, name, wiki_title, elevation, counties, region, range_name, route, national_park, grade, lat, lng, google_maps_url, wiki_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(no) DO UPDATE SET
      name=excluded.name, wiki_title=excluded.wiki_title, elevation=excluded.elevation, counties=excluded.counties,
      region=excluded.region, range_name=excluded.range_name, route=excluded.route, national_park=excluded.national_park,
      grade=excluded.grade, lat=excluded.lat, lng=excluded.lng, google_maps_url=excluded.google_maps_url, wiki_url=excluded.wiki_url`);
  db.exec('BEGIN');
  try {
    for (const p of peaks) {
      upsert.run(p.no, p.name, p.wikiTitle, p.elevation, p.counties.join('、'), p.region, p.range, p.route,
        p.nationalPark, p.grade, p.lat, p.lng, p.googleMapsUrl, p.wikiUrl);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return peaks.length;
}

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

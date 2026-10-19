// 以 Open-Meteo（免金鑰）取得山區天氣。傳入 elevation 讓氣溫依山頂高度修正。
const FORECAST_DAYS = 16;
const cache = new Map();

async function cachedJson(url, ttlMs) {
  const hit = cache.get(url);
  if (hit && hit.expires > Date.now()) return hit.data;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${await res.text()}`);
  const data = await res.json();
  cache.set(url, { data, expires: Date.now() + ttlMs });
  return data;
}

const WMO = {
  0: ['晴朗', '☀️'], 1: ['大致晴朗', '🌤️'], 2: ['局部多雲', '⛅'], 3: ['陰天', '☁️'],
  45: ['霧', '🌫️'], 48: ['霧淞', '🌫️'],
  51: ['小毛毛雨', '🌦️'], 53: ['毛毛雨', '🌦️'], 55: ['濃毛毛雨', '🌧️'], 56: ['凍毛毛雨', '🌧️'], 57: ['凍毛毛雨', '🌧️'],
  61: ['小雨', '🌦️'], 63: ['中雨', '🌧️'], 65: ['大雨', '🌧️'], 66: ['凍雨', '🌧️'], 67: ['強凍雨', '🌧️'],
  71: ['小雪', '🌨️'], 73: ['中雪', '🌨️'], 75: ['大雪', '❄️'], 77: ['雪粒', '🌨️'],
  80: ['短暫陣雨', '🌦️'], 81: ['陣雨', '🌧️'], 82: ['強陣雨', '⛈️'], 85: ['陣雪', '🌨️'], 86: ['強陣雪', '❄️'],
  95: ['雷雨', '⛈️'], 96: ['雷雨伴冰雹', '⛈️'], 99: ['強雷雨伴冰雹', '⛈️'],
};
export const describeCode = (code) => {
  const [text, icon] = WMO[code] ?? ['未知', '❔'];
  return { text, icon };
};

const todayTaipei = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function locParams(peaks) {
  return {
    latitude: peaks.map((p) => p.lat).join(','),
    longitude: peaks.map((p) => p.lng).join(','),
    elevation: peaks.map((p) => p.elevation ?? 'nan').join(','),
    timezone: 'Asia/Taipei',
  };
}
const asArray = (data) => (Array.isArray(data) ? data : [data]);

function dailyRows(daily) {
  return daily.time.map((date, i) => ({
    date,
    ...describeCode(daily.weather_code[i]),
    code: daily.weather_code[i],
    tmax: daily.temperature_2m_max[i],
    tmin: daily.temperature_2m_min[i],
    precip: daily.precipitation_sum[i],
    precipProb: daily.precipitation_probability_max?.[i] ?? null,
    wind: daily.wind_speed_10m_max[i],
    gust: daily.wind_gusts_10m_max?.[i] ?? null,
    sunrise: daily.sunrise?.[i]?.slice(11) ?? null,
    sunset: daily.sunset?.[i]?.slice(11) ?? null,
  }));
}

/** 未來 16 天逐日預報，回傳 Map<peakNo, rows[]> */
export async function getForecast(peaks) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    ...locParams(peaks),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset',
    forecast_days: FORECAST_DAYS,
  });
  const data = asArray(await cachedJson(url.toString(), 30 * 60 * 1000));
  return new Map(peaks.map((p, i) => [p.no, dailyRows(data[i].daily)]));
}

/** 過去 years 年同期（相同月日）的實際觀測，作為長期預報不可得時的參考 */
async function getClimatology(peaks, startDate, endDate, years = 5) {
  const thisYear = Number(todayTaipei().slice(0, 4));
  const lastAvailable = addDays(todayTaipei(), -7);
  const perPeak = new Map(peaks.map((p) => [p.no, []]));
  const requests = [];
  for (let y = thisYear - years; y <= thisYear; y++) {
    const s = `${y}${startDate.slice(4)}`;
    const e = `${y + (endDate.slice(4) < startDate.slice(4) ? 1 : 0)}${endDate.slice(4)}`; // 跨年行程
    if (e > lastAvailable || s.endsWith('02-29') || e.endsWith('02-29')) continue;
    const url = new URL('https://archive-api.open-meteo.com/v1/archive');
    url.search = new URLSearchParams({
      ...locParams(peaks),
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
      start_date: s,
      end_date: e,
    });
    requests.push(cachedJson(url.toString(), 24 * 3600 * 1000).then((d) => ({ year: y, data: asArray(d) })));
  }
  const results = (await Promise.allSettled(requests)).filter((r) => r.status === 'fulfilled').map((r) => r.value);
  results.sort((a, b) => b.year - a.year).slice(0, years).forEach(({ year, data }) => {
    peaks.forEach((p, i) => perPeak.get(p.no).push({ year, rows: dailyRows(data[i].daily) }));
  });

  const summary = new Map();
  for (const [no, yrs] of perPeak) {
    const all = yrs.flatMap((y) => y.rows);
    const avg = (k) => (all.length ? all.reduce((s, r) => s + (r[k] ?? 0), 0) / all.length : null);
    summary.set(no, {
      years: yrs.map((y) => ({
        year: y.year,
        tmax: Math.max(...y.rows.map((r) => r.tmax)),
        tmin: Math.min(...y.rows.map((r) => r.tmin)),
        precip: y.rows.reduce((s, r) => s + (r.precip ?? 0), 0),
        rainyDays: y.rows.filter((r) => r.precip >= 1).length,
        days: y.rows.length,
        ...describeCode(Math.max(...y.rows.map((r) => r.code))),
      })),
      avgTmax: avg('tmax'),
      avgTmin: avg('tmin'),
      avgPrecip: avg('precip'),
      rainChance: all.length ? all.filter((r) => r.precip >= 1).length / all.length : null,
    });
  }
  return summary;
}

/**
 * 依行程日期取得天氣：日期在 16 天預報範圍內 → 逐日預報；否則 → 歷年同期參考。
 * 回傳 { mode: 'forecast'|'climate'|'past', perPeak: Map }
 */
export async function getTripWeather(peaks, startDate, endDate = startDate) {
  peaks = peaks.filter((p) => p.lat != null);
  if (!peaks.length) return { mode: 'none', perPeak: new Map() };
  const today = todayTaipei();
  const lastForecast = addDays(today, FORECAST_DAYS - 1);

  if (endDate < today) return { mode: 'past', perPeak: new Map() };
  if (startDate <= lastForecast) {
    const forecast = await getForecast(peaks);
    const perPeak = new Map();
    for (const [no, rows] of forecast) {
      perPeak.set(no, rows.filter((r) => r.date >= addDays(startDate, -1) && r.date <= addDays(endDate, 1))
        .map((r) => ({ ...r, inTrip: r.date >= startDate && r.date <= endDate })));
    }
    const partial = endDate > lastForecast;
    return { mode: 'forecast', partial, lastForecast, perPeak };
  }
  const perPeak = await getClimatology(peaks, startDate, endDate);
  return { mode: 'climate', perPeak, forecastFrom: addDays(startDate, -(FORECAST_DAYS - 1)) };
}

export { todayTaipei, addDays };

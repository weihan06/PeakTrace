import express from 'express';
import session from 'express-session';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_DIR, allPeaks } from './store.js';
import { JsonSessionStore } from './session-store.js';
import authRoutes from './routes/auth.js';
import mainRoutes from './routes/main.js';
import planRoutes from './routes/plans.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT ?? 3000);

function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(DATA_DIR, '.session-secret');
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString('hex'));
  return readFileSync(file, 'utf8').trim();
}

console.log(`已載入 ${allPeaks().length} 座百岳`);

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(ROOT, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(ROOT, 'public')));
app.use(session({
  store: new JsonSessionStore(),
  secret: sessionSecret(),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 },
}));

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user ?? null;
  res.locals.flash = req.session.flash ?? null;
  res.locals.path = req.path;
  delete req.session.flash;
  next();
});

app.use(authRoutes);
app.use(mainRoutes);
app.use('/plans', planRoutes);

app.use((req, res) => res.status(404).render('error', { title: '找不到頁面', message: '找不到這個頁面。' }));
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).render('error', { title: '發生錯誤', message: err.message });
});

app.listen(PORT, () => console.log(`PeakTrace 已啟動：http://localhost:${PORT}`));

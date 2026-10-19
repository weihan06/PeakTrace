import { Router } from 'express';
import { db } from '../db.js';
import { flash } from './helpers.js';

const router = Router();

router.get('/login', (req, res) => res.render('login', { title: '登入', username: '' }));

// 只輸入帳號即可登入；帳號不存在時自動建立
router.post('/login', (req, res) => {
  const username = (req.body.username ?? '').trim();
  if (!username || username.length > 30) {
    return res.status(400).render('login', { title: '登入', username, flash: { type: 'danger', message: '請輸入 1–30 個字的帳號' } });
  }
  let user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  const isNew = !user;
  if (isNew) {
    const { lastInsertRowid } = db.prepare("INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, '')").run(username, username);
    user = { id: Number(lastInsertRowid), username, display_name: username };
  }
  const returnTo = req.session.returnTo ?? '/dashboard';
  req.session.regenerate((err) => {
    if (err) throw err;
    req.session.user = { id: user.id, username: user.username, displayName: user.display_name };
    if (isNew) flash(req, 'success', '帳號建立成功，開始記錄你的百岳吧！');
    res.redirect(returnTo);
  });
});

router.get('/register', (req, res) => res.redirect('/login'));

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

export default router;

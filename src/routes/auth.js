import { Router } from 'express';
import { mutate, nextId, now } from '../store.js';
import { findUserByName } from '../queries.js';
import { flash } from './helpers.js';

const router = Router();

router.get('/login', (req, res) => res.render('login', { title: '登入', username: '' }));

// 只輸入帳號即可登入；帳號不存在時自動建立
router.post('/login', (req, res) => {
  const username = (req.body.username ?? '').trim();
  if (!username || username.length > 30) {
    return res.status(400).render('login', { title: '登入', username, flash: { type: 'danger', message: '請輸入 1–30 個字的帳號' } });
  }
  let user = findUserByName(username);
  const isNew = !user;
  if (isNew) {
    user = mutate((s) => {
      const u = { id: nextId('users'), username, display_name: username, created_at: now() };
      s.users.push(u);
      return u;
    });
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

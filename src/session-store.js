import session from 'express-session';
import path from 'node:path';
import { DATA_DIR, JsonFile } from './store.js';

// 以 JSON 檔儲存 session，重啟伺服器後仍保持登入
export class JsonSessionStore extends session.Store {
  constructor(file = path.join(DATA_DIR, 'sessions.json')) {
    super();
    this.file = new JsonFile(file, {});
    this.sessions = this.file.data;
    const t = Date.now();
    for (const [sid, s] of Object.entries(this.sessions)) if (s.expires <= t) delete this.sessions[sid];
  }
  get(sid, cb) {
    const s = this.sessions[sid];
    cb(null, s && s.expires > Date.now() ? s.sess : null);
  }
  set(sid, sess, cb) {
    try {
      const expires = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 86400000;
      this.sessions[sid] = { sess, expires };
      this.file.save();
      cb?.(null);
    } catch (e) { cb?.(e); }
  }
  destroy(sid, cb) {
    try {
      delete this.sessions[sid];
      this.file.save();
      cb?.(null);
    } catch (e) { cb?.(e); }
  }
  touch(sid, sess, cb) {
    // 只更新記憶體中的到期時間，下次 set/destroy 時一併寫入，避免每個請求都寫檔
    if (this.sessions[sid] && sess.cookie?.expires) this.sessions[sid].expires = new Date(sess.cookie.expires).getTime();
    cb?.(null);
  }
}

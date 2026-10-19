export function requireLogin(req, res, next) {
  if (req.session.user) return next();
  req.session.returnTo = req.originalUrl;
  res.redirect('/login');
}

export function flash(req, type, message) {
  req.session.flash = { type, message };
}

export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/** 表單送來的 peaks 可能是單一值或陣列 */
export const toPeakNos = (v) => [...new Set([v ?? []].flat().map(Number).filter((n) => Number.isInteger(n) && n > 0))];

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

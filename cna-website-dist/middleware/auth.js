function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  if (req.xhr || req.headers.accept?.indexOf('json') > -1 || req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'غير مصرح لك بالدخول' });
  }
  return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({ error: 'صلاحيات المدير مطلوبة' });
}

module.exports = { requireAuth, requireAdmin };

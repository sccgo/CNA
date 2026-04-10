const express = require('express');
const bcrypt = require('bcryptjs');

module.exports = function(db) {
  const router = express.Router();

  // ─── Login ────────────────────────────────────────────────────────────────
  router.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
    const user = db.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
    if (!user || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    req.session.user = { id: user.id, username: user.username, full_name: user.full_name, role: user.role };
    res.json({ success: true, user: req.session.user });
  });

  // ─── Register (visitors) ──────────────────────────────────────────────────
  router.post('/api/register', (req, res) => {
    const regEnabled = db.prepare(`SELECT value FROM settings WHERE key='registration_enabled'`).get();
    if (regEnabled?.value !== '1') return res.status(403).json({ error: 'التسجيل مغلق حالياً' });

    const { username, password, full_name } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'يرجى تعبئة جميع الحقول' });
    if (username.length < 3) return res.status(400).json({ error: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل' });
    if (password.length < 6) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    if (!/^[a-zA-Z0-9_\u0600-\u06FF]+$/.test(username))
      return res.status(400).json({ error: 'اسم المستخدم يحتوي على رموز غير مسموح بها' });

    const hashed = bcrypt.hashSync(password, 10);
    try {
      const result = db.prepare(`INSERT INTO users (username,password,full_name,role) VALUES (?,?,?,?)`).run(username, hashed, full_name || username, 'viewer');
      const newUser = { id: result.lastInsertRowid, username, full_name: full_name || username, role: 'viewer' };
      req.session.user = newUser;
      res.json({ success: true, user: newUser });
    } catch(e) {
      res.status(400).json({ error: 'اسم المستخدم محجوز، اختر اسماً آخر' });
    }
  });

  // ─── Logout ───────────────────────────────────────────────────────────────
  router.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
  });

  // ─── Me ───────────────────────────────────────────────────────────────────
  router.get('/api/me', (req, res) => {
    res.json({ user: req.session?.user || null });
  });

  // ─── Update profile (name) ────────────────────────────────────────────────
  router.put('/api/profile', (req, res) => {
    if (!req.session?.user) return res.status(401).json({ error: 'غير مصرح' });
    const { full_name } = req.body;
    if (!full_name || !full_name.trim()) return res.status(400).json({ error: 'الاسم مطلوب' });
    db.prepare(`UPDATE users SET full_name=? WHERE id=?`).run(full_name.trim(), req.session.user.id);
    req.session.user.full_name = full_name.trim();
    res.json({ success: true, full_name: full_name.trim() });
  });

  // ─── Change password ──────────────────────────────────────────────────────
  router.post('/api/change-password', (req, res) => {
    if (!req.session?.user) return res.status(401).json({ error: 'غير مصرح' });
    const { current_password, new_password } = req.body;
    const user = db.prepare(`SELECT * FROM users WHERE id=?`).get(req.session.user.id);
    if (!bcrypt.compareSync(current_password, user.password))
      return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    if (!new_password || new_password.length < 6)
      return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    db.prepare(`UPDATE users SET password=? WHERE id=?`).run(bcrypt.hashSync(new_password,10), req.session.user.id);
    res.json({ success: true });
  });

  // ─── Admin: list users ────────────────────────────────────────────────────
  router.get('/api/users', (req, res) => {
    if (req.session?.user?.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    res.json(db.prepare(`SELECT id,username,full_name,role,created_at FROM users ORDER BY created_at DESC`).all());
  });

  // ─── Admin: add user ──────────────────────────────────────────────────────
  router.post('/api/users', (req, res) => {
    if (req.session?.user?.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    const { username, password, full_name, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'يرجى تعبئة جميع الحقول' });
    try {
      const r = db.prepare(`INSERT INTO users (username,password,full_name,role) VALUES (?,?,?,?)`).run(username, bcrypt.hashSync(password,10), full_name||username, role||'editor');
      res.json({ success: true, id: r.lastInsertRowid });
    } catch { res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' }); }
  });

  // ─── Admin: update user role/name ─────────────────────────────────────────
  router.put('/api/users/:id', (req, res) => {
    if (req.session?.user?.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    const { full_name, role } = req.body;
    db.prepare(`UPDATE users SET full_name=?, role=? WHERE id=?`).run(full_name, role, req.params.id);
    res.json({ success: true });
  });

  // ─── Admin: delete user ───────────────────────────────────────────────────
  router.delete('/api/users/:id', (req, res) => {
    if (req.session?.user?.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    if (parseInt(req.params.id) === req.session.user.id) return res.status(400).json({ error: 'لا يمكن حذف حسابك الخاص' });
    db.prepare(`DELETE FROM users WHERE id=?`).run(req.params.id);
    res.json({ success: true });
  });

  return router;
};

const express = require('express');
const bcrypt = require('bcryptjs');

module.exports = function(db) {
  const router = express.Router();

  router.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
    const user = db.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
    if (!user || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    req.session.user = { id: user.id, username: user.username, full_name: user.full_name, role: user.role };
    res.json({ success: true, user: req.session.user });
  });

  router.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
  });

  router.get('/api/me', (req, res) => {
    res.json({ user: req.session?.user || null });
  });

  router.post('/api/change-password', (req, res) => {
    if (!req.session?.user) return res.status(401).json({ error: 'غير مصرح' });
    const { current_password, new_password } = req.body;
    const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.session.user.id);
    if (!bcrypt.compareSync(current_password, user.password))
      return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    if (!new_password || new_password.length < 6)
      return res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل' });
    const hashed = bcrypt.hashSync(new_password, 10);
    db.prepare(`UPDATE users SET password = ? WHERE id = ?`).run(hashed, req.session.user.id);
    res.json({ success: true });
  });

  router.get('/api/users', (req, res) => {
    if (req.session?.user?.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    const users = db.prepare(`SELECT id, username, full_name, role, created_at FROM users`).all();
    res.json(users);
  });

  router.post('/api/users', (req, res) => {
    if (req.session?.user?.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    const { username, password, full_name, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'يرجى تعبئة جميع الحقول' });
    const hashed = bcrypt.hashSync(password, 10);
    try {
      const result = db.prepare(`INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)`).run(username, hashed, full_name || username, role || 'editor');
      res.json({ success: true, id: result.lastInsertRowid });
    } catch(e) {
      res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });
    }
  });

  router.delete('/api/users/:id', (req, res) => {
    if (req.session?.user?.role !== 'admin') return res.status(403).json({ error: 'غير مصرح' });
    if (parseInt(req.params.id) === req.session.user.id) return res.status(400).json({ error: 'لا يمكن حذف حسابك الخاص' });
    db.prepare(`DELETE FROM users WHERE id = ?`).run(req.params.id);
    res.json({ success: true });
  });

  return router;
};

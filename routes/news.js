const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  return res.status(401).json({ error: 'غير مصرح لك بالدخول' });
}

module.exports = function(db) {
  const router = express.Router();

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, '../public/uploads');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.random().toString(36).substr(2,8)}${ext}`);
    }
  });
  const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const ok = /jpeg|jpg|png|gif|webp/i.test(file.mimetype);
      cb(ok ? null : new Error('نوع الملف غير مدعوم'), ok);
    }
  });

  // ─── GET all news ───────────────────────────────────────
  router.get('/api/news', (req, res) => {
    const { page=1, limit=12, category, department, search, breaking, featured, archive_year, archive_month } = req.query;
    const offset = (page-1) * limit;
    let where = ['1=1'], params = [];

    if (category)       { where.push('n.category = ?');              params.push(category); }
    if (department)     { where.push('d.slug = ?');                  params.push(department); }
    if (search)         { where.push('(n.title LIKE ? OR n.short_description LIKE ?)'); params.push(`%${search}%`,`%${search}%`); }
    if (breaking==='1') { where.push('n.is_breaking = 1'); }
    if (featured==='1') { where.push('n.is_featured = 1'); }
    if (archive_year)   { where.push("strftime('%Y', n.created_at) = ?"); params.push(archive_year); }
    if (archive_month)  { where.push("strftime('%m', n.created_at) = ?"); params.push(String(archive_month).padStart(2,'0')); }

    const w = where.join(' AND ');
    try {
      const totalRow = db.prepare(`SELECT COUNT(*) as count FROM news n LEFT JOIN departments d ON n.department_id = d.id WHERE ${w}`).get(...params);
      const total = totalRow ? (totalRow.count || 0) : 0;
      const news = db.prepare(`
        SELECT n.*, d.name as department_name, d.slug as department_slug
        FROM news n LEFT JOIN departments d ON n.department_id = d.id
        WHERE ${w} ORDER BY n.created_at DESC LIMIT ? OFFSET ?
      `).all(...params, parseInt(limit), parseInt(offset));
      res.json({ news, total, page: parseInt(page), pages: Math.ceil(total/limit) || 1 });
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─── GET breaking news ──────────────────────────────────
  router.get('/api/news/breaking', (req, res) => {
    const news = db.prepare(`SELECT id, title FROM news WHERE is_breaking = 1 ORDER BY created_at DESC LIMIT 20`).all();
    res.json(news);
  });

  // ─── GET featured news ──────────────────────────────────
  router.get('/api/news/featured', (req, res) => {
    const news = db.prepare(`
      SELECT n.*, d.name as department_name
      FROM news n LEFT JOIN departments d ON n.department_id = d.id
      WHERE n.is_featured = 1 ORDER BY n.updated_at DESC LIMIT 1
    `).get();
    if (!news) return res.json(null);
    news.counter = db.prepare(`SELECT * FROM counters WHERE news_id = ?`).get(news.id) || null;
    const poll = db.prepare(`SELECT * FROM polls WHERE news_id = ?`).get(news.id);
    if (poll) {
      poll.options = JSON.parse(poll.options);
      poll.votes = db.prepare(`SELECT option_index, COUNT(*) as count FROM poll_votes WHERE poll_id = ? GROUP BY option_index`).all(poll.id);
      poll.total_votes = poll.votes.reduce((s,v)=>s+v.count,0);
      news.poll = poll;
    }
    res.json(news);
  });

  // ─── GET single news ────────────────────────────────────
  router.get('/api/news/:id', (req, res) => {
    const news = db.prepare(`
      SELECT n.*, d.name as department_name, d.slug as department_slug
      FROM news n LEFT JOIN departments d ON n.department_id = d.id WHERE n.id = ?
    `).get(req.params.id);
    if (!news) return res.status(404).json({ error: 'الخبر غير موجود' });

    db.prepare(`UPDATE news SET views = views + 1 WHERE id = ?`).run(news.id);
    try { news.images = JSON.parse(news.images || '[]'); } catch { news.images = []; }

    const poll = db.prepare(`SELECT * FROM polls WHERE news_id = ?`).get(news.id);
    if (poll) {
      poll.options = JSON.parse(poll.options);
      poll.votes = db.prepare(`SELECT option_index, COUNT(*) as count FROM poll_votes WHERE poll_id = ? GROUP BY option_index`).all(poll.id);
      poll.total_votes = poll.votes.reduce((s,v)=>s+v.count,0);
      news.poll = poll;
    }
    news.counter = db.prepare(`SELECT * FROM counters WHERE news_id = ?`).get(news.id) || null;
    news.related = db.prepare(`
      SELECT id, title, short_description, main_image, created_at
      FROM news WHERE id != ? AND (department_id = ? OR category = ?)
      ORDER BY created_at DESC LIMIT 3
    `).all(news.id, news.department_id, news.category);

    res.json(news);
  });

  // ─── POST create news ────────────────────────────────────
  router.post('/api/news', requireAuth, upload.fields([{name:'main_image',maxCount:1},{name:'images',maxCount:10}]), (req, res) => {
    const { title, short_description, content, is_breaking, is_featured, department_id, category } = req.body;
    if (!title) return res.status(400).json({ error: 'العنوان مطلوب' });

    const main_image = req.files?.main_image?.[0] ? '/uploads/'+req.files.main_image[0].filename : null;
    const images = (req.files?.images||[]).map(f=>'/uploads/'+f.filename);
    const flag = v => (v==='on'||v==='1'||v===true) ? 1 : 0;

    const result = db.prepare(`
      INSERT INTO news (title,short_description,content,main_image,images,is_breaking,is_featured,department_id,category)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(title, short_description||'', content||'', main_image, JSON.stringify(images),
           flag(is_breaking), flag(is_featured), department_id||null, category||'general');

    const newsId = result.lastInsertRowid;

    if (req.body.poll_question) {
      let opts = Array.isArray(req.body.poll_options) ? req.body.poll_options : [req.body.poll_options];
      opts = opts.filter(o=>o&&o.trim());
      if (opts.length >= 2) {
        const exp = req.body.poll_expires ? new Date(req.body.poll_expires).toISOString() : null;
        db.prepare(`INSERT INTO polls (news_id,question,options,expires_at) VALUES (?,?,?,?)`).run(newsId, req.body.poll_question, JSON.stringify(opts), exp);
      }
    }

    if (flag(req.body.counter_enabled)) {
      db.prepare(`INSERT OR REPLACE INTO counters (news_id,direction,start_date,label,bg_color,bg_gradient,font_style,text_color) VALUES (?,?,?,?,?,?,?,?)`)
        .run(newsId, req.body.counter_direction||'up', req.body.counter_start_date||new Date().toISOString(),
             req.body.counter_label||'منذ', req.body.counter_bg_color||'#000000',
             req.body.counter_bg_gradient||null, req.body.counter_font_style||'serif',
             req.body.counter_text_color||'#ffffff');
    }

    res.json({ success: true, id: newsId });
  });

  // ─── PUT update news ─────────────────────────────────────
  router.put('/api/news/:id', requireAuth, upload.fields([{name:'main_image',maxCount:1},{name:'images',maxCount:10}]), (req, res) => {
    const existing = db.prepare(`SELECT * FROM news WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'الخبر غير موجود' });

    const { title, short_description, content, is_breaking, is_featured, department_id, category } = req.body;
    const flag = v => (v==='on'||v==='1'||v===true) ? 1 : 0;

    const main_image = req.files?.main_image?.[0] ? '/uploads/'+req.files.main_image[0].filename : existing.main_image;

    let curImages = [];
    try { curImages = JSON.parse(existing.images||'[]'); } catch {}

    if (req.body.delete_images) {
      const del = Array.isArray(req.body.delete_images) ? req.body.delete_images : [req.body.delete_images];
      curImages = curImages.filter(i=>!del.includes(i));
      del.forEach(img => {
        const fp = path.join(__dirname,'../public',img);
        if (fs.existsSync(fp)) try { fs.unlinkSync(fp); } catch {}
      });
    }

    const newImgs = (req.files?.images||[]).map(f=>'/uploads/'+f.filename);
    const allImages = [...curImages, ...newImgs];

    db.prepare(`UPDATE news SET title=?,short_description=?,content=?,main_image=?,images=?,is_breaking=?,is_featured=?,department_id=?,category=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(title||existing.title, short_description||'', content||'', main_image,
           JSON.stringify(allImages), flag(is_breaking), flag(is_featured),
           department_id||null, category||'general', req.params.id);

    // Poll
    if (req.body.remove_poll === '1') {
      db.prepare(`DELETE FROM polls WHERE news_id = ?`).run(req.params.id);
    } else if (req.body.poll_question) {
      let opts = Array.isArray(req.body.poll_options) ? req.body.poll_options : [req.body.poll_options];
      opts = opts.filter(o=>o&&o.trim());
      if (opts.length >= 2) {
        const exp = req.body.poll_expires ? new Date(req.body.poll_expires).toISOString() : null;
        const ep = db.prepare(`SELECT id FROM polls WHERE news_id=?`).get(req.params.id);
        if (ep) {
          db.prepare(`UPDATE polls SET question=?,options=?,expires_at=? WHERE news_id=?`).run(req.body.poll_question, JSON.stringify(opts), exp, req.params.id);
        } else {
          db.prepare(`INSERT INTO polls (news_id,question,options,expires_at) VALUES (?,?,?,?)`).run(req.params.id, req.body.poll_question, JSON.stringify(opts), exp);
        }
      }
    }

    // Counter
    if (req.body.remove_counter === '1') {
      db.prepare(`DELETE FROM counters WHERE news_id = ?`).run(req.params.id);
    } else if (flag(req.body.counter_enabled)) {
      db.prepare(`INSERT OR REPLACE INTO counters (news_id,direction,start_date,label,bg_color,bg_gradient,font_style,text_color) VALUES (?,?,?,?,?,?,?,?)`)
        .run(req.params.id, req.body.counter_direction||'up', req.body.counter_start_date||new Date().toISOString(),
             req.body.counter_label||'منذ', req.body.counter_bg_color||'#000000',
             req.body.counter_bg_gradient||null, req.body.counter_font_style||'serif',
             req.body.counter_text_color||'#ffffff');
    }

    res.json({ success: true });
  });

  // ─── DELETE news ─────────────────────────────────────────
  router.delete('/api/news/:id', requireAuth, (req, res) => {
    const news = db.prepare(`SELECT * FROM news WHERE id = ?`).get(req.params.id);
    if (!news) return res.status(404).json({ error: 'الخبر غير موجود' });
    try {
      if (news.main_image) { const fp=path.join(__dirname,'../public',news.main_image); if(fs.existsSync(fp)) fs.unlinkSync(fp); }
      JSON.parse(news.images||'[]').forEach(img => { const fp=path.join(__dirname,'../public',img); if(fs.existsSync(fp)) try{fs.unlinkSync(fp);}catch{} });
    } catch {}
    db.prepare(`DELETE FROM news WHERE id = ?`).run(req.params.id);
    res.json({ success: true });
  });

  // ─── Poll vote ───────────────────────────────────────────
  router.post('/api/polls/:id/vote', (req, res) => {
    const poll = db.prepare(`SELECT * FROM polls WHERE id = ?`).get(req.params.id);
    if (!poll) return res.status(404).json({ error: 'التصويت غير موجود' });
    if (poll.expires_at && new Date(poll.expires_at) < new Date()) return res.status(400).json({ error: 'انتهت مدة التصويت' });
    const opts = JSON.parse(poll.options);
    const idx = parseInt(req.body.option_index);
    if (isNaN(idx) || idx < 0 || idx >= opts.length) return res.status(400).json({ error: 'خيار غير صالح' });
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const existing = db.prepare(`SELECT id FROM poll_votes WHERE poll_id=? AND voter_ip=?`).get(poll.id, ip);
    if (existing) return res.status(400).json({ error: 'لقد صوتت بالفعل في هذا الاستطلاع' });
    db.prepare(`INSERT INTO poll_votes (poll_id,option_index,voter_ip) VALUES (?,?,?)`).run(poll.id, idx, ip);
    const votes = db.prepare(`SELECT option_index, COUNT(*) as count FROM poll_votes WHERE poll_id=? GROUP BY option_index`).all(poll.id);
    const total = votes.reduce((s,v)=>s+v.count,0);
    res.json({ success: true, votes, total });
  });

  // ─── Departments ─────────────────────────────────────────
  router.get('/api/departments', (req, res) => {
    const depts = db.prepare(`SELECT d.*, COUNT(n.id) as news_count FROM departments d LEFT JOIN news n ON d.id=n.department_id GROUP BY d.id ORDER BY d.name`).all();
    res.json(depts);
  });

  router.post('/api/departments', requireAuth, (req, res) => {
    const { name, slug } = req.body;
    if (!name||!slug) return res.status(400).json({ error: 'الاسم والمعرف مطلوبان' });
    try {
      const r = db.prepare(`INSERT INTO departments (name,slug) VALUES (?,?)`).run(name, slug);
      res.json({ success: true, id: r.lastInsertRowid });
    } catch { res.status(400).json({ error: 'الشعبة موجودة مسبقاً' }); }
  });

  router.delete('/api/departments/:id', requireAuth, (req, res) => {
    db.prepare(`DELETE FROM departments WHERE id=?`).run(req.params.id);
    res.json({ success: true });
  });

  // ─── Settings ────────────────────────────────────────────
  router.get('/api/settings', (req, res) => {
    const rows = db.prepare(`SELECT * FROM settings`).all();
    const s = {}; rows.forEach(r => s[r.key]=r.value);
    res.json(s);
  });

  router.put('/api/settings', requireAuth, (req, res) => {
    const stmt = db.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)`);
    Object.entries(req.body).forEach(([k,v]) => stmt.run(k, v));
    res.json({ success: true });
  });

  // ─── Archive ─────────────────────────────────────────────
  router.get('/api/archive', (req, res) => {
    const rows = db.prepare(`SELECT strftime('%Y',created_at) as year, strftime('%m',created_at) as month, COUNT(*) as count FROM news GROUP BY year,month ORDER BY year DESC, month DESC`).all();
    res.json(rows);
  });

  return router;
};

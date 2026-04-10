const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { initDb } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// تأكد من مجلد الرفع
const uploadsDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middlewares
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'cna-secret-2025',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

// 🔥 static files (مهم للنشر)
app.use(express.static(path.join(__dirname, 'public')));

// (اختياري لكن مفيد)
app.disable('x-powered-by');

const page = (f) => (req, res) =>
  res.sendFile(path.join(__dirname, 'public', f));

// تشغيل قاعدة البيانات ثم السيرفر
initDb()
  .then((db) => {
    app.use((req, res, next) => {
      req.db = db;
      next();
    });

    app.use('/', require('./routes/auth')(db));
    app.use('/', require('./routes/news')(db));

    // صفحات الموقع
    app.get('/', page('index.html'));
    app.get('/news/:id', page('news.html'));
    app.get('/login', page('login.html'));
    app.get('/register', page('register.html'));
    app.get('/profile', page('profile.html'));
    app.get('/archive', page('archive.html'));
    app.get('/search', page('index.html'));
    app.get('/category/:slug', page('index.html'));

    // Admin
    app.get('/admin', page('admin/index.html'));
    app.get('/admin/create', page('admin/create.html'));
    app.get('/admin/edit/:id', page('admin/edit.html'));
    app.get('/admin/settings', page('admin/settings.html'));
    app.get('/admin/users', page('admin/users.html'));
    app.get('/admin/departments', page('admin/departments.html'));

    // تشغيل السيرفر (مهم جدًا للنشر)
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });

  })
  .catch((err) => {
    console.error('DB init failed:', err);
    process.exit(1);
  });

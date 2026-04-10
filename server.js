const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { initDb } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadsDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(session({
  secret: 'cna-secret-key-2024-secure',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize DB then start
initDb().then(db => {
  // Inject db into routes
  app.use((req, res, next) => { req.db = db; next(); });

  const authRoutes = require('./routes/auth');
  const newsRoutes = require('./routes/news');
  app.use('/', authRoutes(db));
  app.use('/', newsRoutes(db));

  // Page routes
  app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
  app.get('/news/:id', (req, res) => res.sendFile(path.join(__dirname, 'public/news.html')));
  app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));
  app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin/index.html')));
  app.get('/admin/create', (req, res) => res.sendFile(path.join(__dirname, 'public/admin/create.html')));
  app.get('/admin/edit/:id', (req, res) => res.sendFile(path.join(__dirname, 'public/admin/edit.html')));
  app.get('/admin/settings', (req, res) => res.sendFile(path.join(__dirname, 'public/admin/settings.html')));
  app.get('/admin/users', (req, res) => res.sendFile(path.join(__dirname, 'public/admin/users.html')));
  app.get('/admin/departments', (req, res) => res.sendFile(path.join(__dirname, 'public/admin/departments.html')));
  app.get('/archive', (req, res) => res.sendFile(path.join(__dirname, 'public/archive.html')));
  app.get('/category/:slug', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
  app.get('/search', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));

  app.listen(PORT, () => {
    console.log(`\n╔══════════════════════════════════════╗`);
    console.log(`║   وكالة الأنباء التنسيقية - CNA      ║`);
    console.log(`╠══════════════════════════════════════╣`);
    console.log(`║  Server: http://localhost:${PORT}       ║`);
    console.log(`║  Admin:  admin / admin123            ║`);
    console.log(`╚══════════════════════════════════════╝\n`);
  });
}).catch(err => {
  console.error('DB init failed:', err);
  process.exit(1);
});

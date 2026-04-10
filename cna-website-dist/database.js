const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'cna.db');
let saveTimer = null;

class DB {
  constructor(sqlJs, existingData) {
    this._db = existingData ? new sqlJs.Database(existingData) : new sqlJs.Database();
  }
  _save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { fs.writeFileSync(DB_PATH, Buffer.from(this._db.export())); }
      catch(e) { console.error('[DB]', e.message); }
    }, 300);
  }
  prepare(sql) {
    const self = this;
    const norm = args => (args.length===1&&Array.isArray(args[0]))?args[0]:args.map(x=>x===undefined?null:x);
    return {
      run(...args) { self._db.run(sql, norm(args)); self._save(); const r=self._db.exec('SELECT last_insert_rowid() as id,changes() as ch'); const row=r[0]?.values[0]||[0,0]; return{lastInsertRowid:row[0],changes:row[1]}; },
      get(...args) { const st=self._db.prepare(sql); const p=norm(args); if(p.length)st.bind(p); const f=st.step()?st.getAsObject():null; st.free(); return f; },
      all(...args) { const res=[],st=self._db.prepare(sql); const p=norm(args); if(p.length)st.bind(p); while(st.step())res.push(st.getAsObject()); st.free(); return res; }
    };
  }
}

async function initDb() {
  const sqlJs = await initSqlJs();
  let data = null;
  if (fs.existsSync(DB_PATH)) try { data = fs.readFileSync(DB_PATH); } catch {}
  const db = new DB(sqlJs, data);

  // Tables
  db._db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, full_name TEXT, role TEXT DEFAULT 'viewer', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db._db.run(`CREATE TABLE IF NOT EXISTS departments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, slug TEXT UNIQUE NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db._db.run(`CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL, title_en TEXT,
    short_description TEXT DEFAULT '', short_description_en TEXT,
    content TEXT DEFAULT '', content_en TEXT,
    lang TEXT DEFAULT 'ar',
    main_image TEXT, images TEXT DEFAULT '[]',
    is_breaking INTEGER DEFAULT 0, is_featured INTEGER DEFAULT 0,
    is_live INTEGER DEFAULT 0, live_url TEXT,
    department_id INTEGER, category TEXT DEFAULT 'general',
    hero_bg_type TEXT DEFAULT 'white', hero_bg_color TEXT, hero_bg_gradient TEXT, hero_bg_image TEXT,
    views INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db._db.run(`CREATE TABLE IF NOT EXISTS polls (id INTEGER PRIMARY KEY AUTOINCREMENT, news_id INTEGER, question TEXT NOT NULL, options TEXT NOT NULL, expires_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db._db.run(`CREATE TABLE IF NOT EXISTS poll_votes (id INTEGER PRIMARY KEY AUTOINCREMENT, poll_id INTEGER NOT NULL, user_id INTEGER NOT NULL, option_index INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(poll_id,user_id))`);
  db._db.run(`CREATE TABLE IF NOT EXISTS counters (id INTEGER PRIMARY KEY AUTOINCREMENT, news_id INTEGER UNIQUE, direction TEXT DEFAULT 'up', start_date DATETIME, label TEXT DEFAULT 'منذ', bg_color TEXT DEFAULT '#000000', bg_gradient TEXT, bg_image TEXT, font_style TEXT DEFAULT 'serif', text_color TEXT DEFAULT '#ffffff', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db._db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);

  // Default settings
  [['ticker_speed','40'],['ticker_bg','#000000'],['ticker_text_color','#ffffff'],
   ['site_name','وكالة الأنباء التنسيقية'],['site_name_en','CNA'],['site_tagline','المصدر الرسمي للأنباء'],
   ['logo_path','/img/logo.svg'],['favicon_path','/img/favicon.svg'],
   ['registration_enabled','1'],['newsapi_key',''],['newsapi_country','us'],['newsapi_category','general'],
   ['show_world_news','1']
  ].forEach(([k,v]) => db._db.run(`INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)`,[k,v]));

  // Departments
  [['الشؤون المحلية','local'],['الشؤون الدولية','international'],['الاقتصاد والمال','economy'],
   ['الشؤون الأمنية','security'],['الشؤون السياسية','politics'],['الثقافة والمجتمع','culture']
  ].forEach(([n,s]) => db._db.run(`INSERT OR IGNORE INTO departments (name,slug) VALUES (?,?)`,[n,s]));

  // Admin user
  if (!db.prepare(`SELECT id FROM users WHERE username='admin'`).get()) {
    db._db.run(`INSERT INTO users (username,password,full_name,role) VALUES (?,?,?,?)`,
      ['admin', bcrypt.hashSync('admin123',10), 'مدير النظام', 'admin']);
    console.log('[DB] Default admin: admin / admin123');
  }

  // Sample news
  if (!db.prepare(`SELECT COUNT(*) as c FROM news`).get()?.c) {
    const did = db.prepare(`SELECT id FROM departments WHERE slug='local'`).get()?.id || null;
    const now = new Date().toISOString();
    db._db.run(`INSERT INTO news (title,title_en,short_description,short_description_en,content,content_en,lang,is_breaking,is_featured,department_id,category,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ['مرحباً بكم في وكالة الأنباء التنسيقية','Welcome to the Coordinating News Agency',
       'الخبر التجريبي الأول','The first demo news item',
       '<p>مرحباً بكم في وكالة الأنباء التنسيقية.</p>','<p>Welcome to the Coordinating News Agency.</p>',
       'both',1,1,did,'general',now,now]);
    db._db.run(`INSERT INTO news (title,short_description,content,is_breaking,department_id,category,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`,
      ['خبر عاجل: اجتماع طارئ لمجلس الوزراء','اجتماع طارئ لبحث المستجدات','<p>عقد مجلس الوزراء اجتماعاً طارئاً اليوم.</p>',1,did,'politics',now,now]);
    db._db.run(`INSERT INTO news (title,short_description,content,department_id,category,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`,
      ['تقرير اقتصادي: نمو 4.2%','مؤشرات إيجابية للربع الأول','<p>نمو 4.2 بالمئة خلال الربع الأول.</p>',did,'economy',now,now]);
  }

  fs.writeFileSync(DB_PATH, Buffer.from(db._db.export()));
  console.log('[DB] Ready');
  return db;
}

module.exports = { initDb };

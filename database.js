const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'cna.db');
let saveTimer = null;

class DB {
  constructor(sqlJs, existingData) {
    this._sql = sqlJs;
    this._db = existingData ? new sqlJs.Database(existingData) : new sqlJs.Database();
  }

  _save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        fs.writeFileSync(DB_PATH, Buffer.from(this._db.export()));
      } catch(e) { console.error('[DB Save]', e.message); }
    }, 300);
  }

  exec(sql) {
    this._db.run(sql);
    this._save();
    return this;
  }

  _run(sql, params) {
    this._db.run(sql, params || []);
    this._save();
    const res = this._db.exec('SELECT last_insert_rowid() as id, changes() as ch');
    const row = res[0]?.values[0] || [0, 0];
    return { lastInsertRowid: row[0], changes: row[1] };
  }

  _get(sql, params) {
    const stmt = this._db.prepare(sql);
    if (params && params.length) stmt.bind(params);
    const found = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return found;
  }

  _all(sql, params) {
    const results = [];
    const stmt = this._db.prepare(sql);
    if (params && params.length) stmt.bind(params);
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return results;
  }

  prepare(sql) {
    const self = this;
    return {
      run(...args) {
        const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        return self._run(sql, params.map(p => p === undefined ? null : p));
      },
      get(...args) {
        const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        return self._get(sql, params.map(p => p === undefined ? null : p));
      },
      all(...args) {
        const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        return self._all(sql, params.map(p => p === undefined ? null : p));
      }
    };
  }

  pragma(stmt) {
    this._db.run(`PRAGMA ${stmt}`);
  }
}

async function initDb() {
  const sqlJs = await initSqlJs();
  let existingData = null;
  if (fs.existsSync(DB_PATH)) {
    try { existingData = fs.readFileSync(DB_PATH); } catch(e) {}
  }

  const db = new DB(sqlJs, existingData);

  // Tables
  db._db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, full_name TEXT, role TEXT DEFAULT 'editor', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db._db.run(`CREATE TABLE IF NOT EXISTS departments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, slug TEXT UNIQUE NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db._db.run(`CREATE TABLE IF NOT EXISTS news (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, short_description TEXT DEFAULT '', content TEXT DEFAULT '', main_image TEXT, images TEXT DEFAULT '[]', is_breaking INTEGER DEFAULT 0, is_featured INTEGER DEFAULT 0, department_id INTEGER, category TEXT DEFAULT 'general', views INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db._db.run(`CREATE TABLE IF NOT EXISTS polls (id INTEGER PRIMARY KEY AUTOINCREMENT, news_id INTEGER, question TEXT NOT NULL, options TEXT NOT NULL, expires_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db._db.run(`CREATE TABLE IF NOT EXISTS poll_votes (id INTEGER PRIMARY KEY AUTOINCREMENT, poll_id INTEGER NOT NULL, option_index INTEGER NOT NULL, voter_ip TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db._db.run(`CREATE TABLE IF NOT EXISTS counters (id INTEGER PRIMARY KEY AUTOINCREMENT, news_id INTEGER UNIQUE, direction TEXT DEFAULT 'up', start_date DATETIME, label TEXT DEFAULT 'منذ', bg_color TEXT DEFAULT '#000000', bg_gradient TEXT, bg_image TEXT, font_style TEXT DEFAULT 'serif', text_color TEXT DEFAULT '#ffffff', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db._db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);

  // Defaults
  [['ticker_speed','40'],['ticker_bg','#000000'],['ticker_text_color','#ffffff'],['site_name','وكالة الأنباء التنسيقية'],['site_name_en','CNA'],['site_tagline','المصدر الرسمي للأنباء']].forEach(([k,v]) => db._db.run(`INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)`,[k,v]));
  [['الشؤون المحلية','local'],['الشؤون الدولية','international'],['الاقتصاد والمال','economy'],['الشؤون الأمنية','security'],['الشؤون السياسية','politics'],['الثقافة والمجتمع','culture']].forEach(([n,s]) => db._db.run(`INSERT OR IGNORE INTO departments (name,slug) VALUES (?,?)`,[n,s]));

  const adminCheck = db._get(`SELECT id FROM users WHERE username='admin'`, []);
  if (!adminCheck) {
    const hashed = bcrypt.hashSync('admin123', 10);
    db._db.run(`INSERT INTO users (username,password,full_name,role) VALUES (?,?,?,?)`,['admin',hashed,'مدير النظام','admin']);
    console.log('[DB] Default admin: admin / admin123');
  }

  const cnt = db._get(`SELECT COUNT(*) as c FROM news`, []);
  if (!cnt || cnt.c == 0) {
    const dept = db._get(`SELECT id FROM departments WHERE slug='local'`,[]);
    const now = new Date().toISOString();
    const did = dept ? dept.id : null;
    db._db.run(`INSERT INTO news (title,short_description,content,is_breaking,is_featured,department_id,category,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,['مرحباً بكم في وكالة الأنباء التنسيقية','الخبر التجريبي الأول لوكالة الأنباء التنسيقية الرسمية','<p>مرحباً بكم في وكالة الأنباء التنسيقية. نقدم لكم أحدث الأخبار والتقارير بدقة واحترافية عالية.</p>',1,1,did,'general',now,now]);
    db._db.run(`INSERT INTO news (title,short_description,content,is_breaking,department_id,category,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`,['خبر عاجل: اجتماع طارئ لمجلس الوزراء','عقد مجلس الوزراء اجتماعاً طارئاً لبحث المستجدات الراهنة','<p>عقد مجلس الوزراء اجتماعاً طارئاً اليوم لمناقشة عدد من الملفات الهامة.</p>',1,did,'politics',now,now]);
    db._db.run(`INSERT INTO news (title,short_description,content,department_id,category,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`,['تقرير: مؤشرات اقتصادية إيجابية للربع الأول','نمو ملحوظ خلال الربع الأول من العام الجاري','<p>أفاد التقرير الاقتصادي الأخير بنمو 4.2 بالمئة.</p>',did,'economy',now,now]);
  }

  fs.writeFileSync(DB_PATH, Buffer.from(db._db.export()));
  console.log('[DB] Ready');
  return db;
}

module.exports = { initDb };

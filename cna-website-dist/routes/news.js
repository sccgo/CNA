const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const https = require('https');

function requireAuth(req,res,next){ if(req.session?.user)return next(); res.status(401).json({error:'يرجى تسجيل الدخول أولاً'}); }
function requireEditor(req,res,next){ const r=req.session?.user?.role; if(r==='admin'||r==='editor')return next(); res.status(403).json({error:'صلاحيات المحرر مطلوبة'}); }
const flag = v => (v==='on'||v==='1'||v===true||v==='true') ? 1 : 0;

module.exports = function(db) {
  const router = express.Router();

  // Multer - news images
  const storage = multer.diskStorage({
    destination:(req,file,cb)=>{ const d=path.join(__dirname,'../public/uploads'); if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true}); cb(null,d); },
    filename:(req,file,cb)=>cb(null,`${Date.now()}-${Math.random().toString(36).substr(2,8)}${path.extname(file.originalname)}`)
  });
  const upload = multer({ storage, limits:{fileSize:20*1024*1024}, fileFilter:(req,file,cb)=>{ const ok=/jpeg|jpg|png|gif|webp/i.test(file.mimetype); cb(ok?null:new Error('نوع الملف غير مدعوم'),ok); } });

  // Multer - logo
  const logoStorage = multer.diskStorage({
    destination:(req,file,cb)=>{ const d=path.join(__dirname,'../public/img'); if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true}); cb(null,d); },
    filename:(req,file,cb)=>cb(null,'logo'+path.extname(file.originalname))
  });
  const uploadLogo = multer({ storage:logoStorage, limits:{fileSize:5*1024*1024} });

  // ─── GET all news ─────────────────────────────────────────
  router.get('/api/news', (req,res) => {
    const {page=1,limit=12,category,department,search,breaking,featured,live,lang,archive_year,archive_month}=req.query;
    const offset=(page-1)*limit;
    let where=['1=1'],params=[];
    if(category){where.push('n.category=?');params.push(category);}
    if(department){where.push('d.slug=?');params.push(department);}
    if(search){where.push('(n.title LIKE ? OR n.title_en LIKE ? OR n.short_description LIKE ?)');params.push(`%${search}%`,`%${search}%`,`%${search}%`);}
    if(breaking==='1')where.push('n.is_breaking=1');
    if(featured==='1')where.push('n.is_featured=1');
    if(live==='1')where.push('n.is_live=1');
    if(lang){where.push("(n.lang=? OR n.lang='both')");params.push(lang);}
    if(archive_year){where.push("strftime('%Y',n.created_at)=?");params.push(archive_year);}
    if(archive_month){where.push("strftime('%m',n.created_at)=?");params.push(String(archive_month).padStart(2,'0'));}
    const w=where.join(' AND ');
    try {
      const total=db.prepare(`SELECT COUNT(*) as c FROM news n LEFT JOIN departments d ON n.department_id=d.id WHERE ${w}`).get(...params)?.c||0;
      const news=db.prepare(`SELECT n.*,d.name as department_name,d.slug as department_slug FROM news n LEFT JOIN departments d ON n.department_id=d.id WHERE ${w} ORDER BY n.created_at DESC LIMIT ? OFFSET ?`).all(...params,parseInt(limit),parseInt(offset));
      res.json({news,total,page:parseInt(page),pages:Math.ceil(total/limit)||1});
    } catch(e){res.status(500).json({error:e.message});}
  });

  router.get('/api/news/breaking',(req,res)=>{
    res.json(db.prepare(`SELECT id,title,title_en FROM news WHERE is_breaking=1 ORDER BY created_at DESC LIMIT 25`).all());
  });

  router.get('/api/news/live',(req,res)=>{
    res.json(db.prepare(`SELECT id,title,title_en,live_url FROM news WHERE is_live=1 ORDER BY updated_at DESC LIMIT 5`).all());
  });

  router.get('/api/news/featured',(req,res)=>{
    const news=db.prepare(`SELECT n.*,d.name as department_name FROM news n LEFT JOIN departments d ON n.department_id=d.id WHERE n.is_featured=1 ORDER BY n.updated_at DESC LIMIT 1`).get();
    if(!news)return res.json(null);
    news.counter=db.prepare(`SELECT * FROM counters WHERE news_id=?`).get(news.id)||null;
    const poll=db.prepare(`SELECT * FROM polls WHERE news_id=?`).get(news.id);
    if(poll){poll.options=JSON.parse(poll.options);poll.votes=db.prepare(`SELECT option_index,COUNT(*) as count FROM poll_votes WHERE poll_id=? GROUP BY option_index`).all(poll.id);poll.total_votes=poll.votes.reduce((s,v)=>s+v.count,0);news.poll=poll;}
    res.json(news);
  });

  router.get('/api/news/:id',(req,res)=>{
    const news=db.prepare(`SELECT n.*,d.name as department_name,d.slug as department_slug FROM news n LEFT JOIN departments d ON n.department_id=d.id WHERE n.id=?`).get(req.params.id);
    if(!news)return res.status(404).json({error:'الخبر غير موجود'});
    db.prepare(`UPDATE news SET views=views+1 WHERE id=?`).run(news.id);
    try{news.images=JSON.parse(news.images||'[]');}catch{news.images=[];}
    const poll=db.prepare(`SELECT * FROM polls WHERE news_id=?`).get(news.id);
    if(poll){
      poll.options=JSON.parse(poll.options);
      poll.votes=db.prepare(`SELECT option_index,COUNT(*) as count FROM poll_votes WHERE poll_id=? GROUP BY option_index`).all(poll.id);
      poll.total_votes=poll.votes.reduce((s,v)=>s+v.count,0);
      poll.user_voted=req.session?.user?db.prepare(`SELECT option_index FROM poll_votes WHERE poll_id=? AND user_id=?`).get(poll.id,req.session.user.id)?.option_index??null:null;
      news.poll=poll;
    }
    news.counter=db.prepare(`SELECT * FROM counters WHERE news_id=?`).get(news.id)||null;
    news.related=db.prepare(`SELECT id,title,title_en,short_description,main_image,created_at,lang FROM news WHERE id!=? AND (department_id=? OR category=?) ORDER BY created_at DESC LIMIT 3`).all(news.id,news.department_id,news.category);
    res.json(news);
  });

  // ─── POST create ──────────────────────────────────────────
  router.post('/api/news', requireAuth, requireEditor, upload.fields([{name:'main_image',maxCount:1},{name:'images',maxCount:10},{name:'hero_bg_image',maxCount:1}]), (req,res)=>{
    const {title,title_en,short_description,short_description_en,content,content_en,lang,is_breaking,is_featured,is_live,live_url,department_id,category,hero_bg_type,hero_bg_color,hero_bg_gradient}=req.body;
    if(!title)return res.status(400).json({error:'العنوان العربي مطلوب'});
    const main_image=req.files?.main_image?.[0]?'/uploads/'+req.files.main_image[0].filename:null;
    const hero_bg_image=req.files?.hero_bg_image?.[0]?'/uploads/'+req.files.hero_bg_image[0].filename:null;
    const images=(req.files?.images||[]).map(f=>'/uploads/'+f.filename);
    const r=db.prepare(`INSERT INTO news (title,title_en,short_description,short_description_en,content,content_en,lang,main_image,images,is_breaking,is_featured,is_live,live_url,department_id,category,hero_bg_type,hero_bg_color,hero_bg_gradient,hero_bg_image) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(title,title_en||null,short_description||'',short_description_en||null,content||'',content_en||null,lang||'ar',main_image,JSON.stringify(images),flag(is_breaking),flag(is_featured),flag(is_live),live_url||null,department_id||null,category||'general',hero_bg_type||'white',hero_bg_color||null,hero_bg_gradient||null,hero_bg_image||null);
    const newsId=r.lastInsertRowid;
    if(req.body.poll_question){let opts=Array.isArray(req.body.poll_options)?req.body.poll_options:[req.body.poll_options];opts=opts.filter(o=>o?.trim());if(opts.length>=2)db.prepare(`INSERT INTO polls (news_id,question,options,expires_at) VALUES (?,?,?,?)`).run(newsId,req.body.poll_question,JSON.stringify(opts),req.body.poll_expires?new Date(req.body.poll_expires).toISOString():null);}
    if(flag(req.body.counter_enabled))db.prepare(`INSERT OR REPLACE INTO counters (news_id,direction,start_date,label,bg_color,bg_gradient,font_style,text_color) VALUES (?,?,?,?,?,?,?,?)`).run(newsId,req.body.counter_direction||'up',req.body.counter_start_date||new Date().toISOString(),req.body.counter_label||'منذ',req.body.counter_bg_color||'#000',req.body.counter_bg_gradient||null,req.body.counter_font_style||'serif',req.body.counter_text_color||'#fff');
    res.json({success:true,id:newsId});
  });

  // ─── PUT update ───────────────────────────────────────────
  router.put('/api/news/:id', requireAuth, requireEditor, upload.fields([{name:'main_image',maxCount:1},{name:'images',maxCount:10},{name:'hero_bg_image',maxCount:1}]), (req,res)=>{
    const ex=db.prepare(`SELECT * FROM news WHERE id=?`).get(req.params.id);
    if(!ex)return res.status(404).json({error:'الخبر غير موجود'});
    const {title,title_en,short_description,short_description_en,content,content_en,lang,is_breaking,is_featured,is_live,live_url,department_id,category,hero_bg_type,hero_bg_color,hero_bg_gradient}=req.body;
    const main_image=req.files?.main_image?.[0]?'/uploads/'+req.files.main_image[0].filename:ex.main_image;
    const hero_bg_image=req.files?.hero_bg_image?.[0]?'/uploads/'+req.files.hero_bg_image[0].filename:ex.hero_bg_image;
    let curImgs=[];try{curImgs=JSON.parse(ex.images||'[]');}catch{}
    if(req.body.delete_images){const del=Array.isArray(req.body.delete_images)?req.body.delete_images:[req.body.delete_images];curImgs=curImgs.filter(i=>!del.includes(i));del.forEach(img=>{try{const fp=path.join(__dirname,'../public',img);if(fs.existsSync(fp))fs.unlinkSync(fp);}catch{}});}
    const allImgs=[...curImgs,...(req.files?.images||[]).map(f=>'/uploads/'+f.filename)];
    db.prepare(`UPDATE news SET title=?,title_en=?,short_description=?,short_description_en=?,content=?,content_en=?,lang=?,main_image=?,images=?,is_breaking=?,is_featured=?,is_live=?,live_url=?,department_id=?,category=?,hero_bg_type=?,hero_bg_color=?,hero_bg_gradient=?,hero_bg_image=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(title||ex.title,title_en||null,short_description||'',short_description_en||null,content||'',content_en||null,lang||ex.lang,main_image,JSON.stringify(allImgs),flag(is_breaking),flag(is_featured),flag(is_live),live_url||null,department_id||null,category||ex.category,hero_bg_type||ex.hero_bg_type,hero_bg_color||null,hero_bg_gradient||null,hero_bg_image||null,req.params.id);
    if(req.body.remove_poll==='1')db.prepare(`DELETE FROM polls WHERE news_id=?`).run(req.params.id);
    else if(req.body.poll_question){let opts=Array.isArray(req.body.poll_options)?req.body.poll_options:[req.body.poll_options];opts=opts.filter(o=>o?.trim());if(opts.length>=2){const exp=req.body.poll_expires?new Date(req.body.poll_expires).toISOString():null;const ep=db.prepare(`SELECT id FROM polls WHERE news_id=?`).get(req.params.id);ep?db.prepare(`UPDATE polls SET question=?,options=?,expires_at=? WHERE news_id=?`).run(req.body.poll_question,JSON.stringify(opts),exp,req.params.id):db.prepare(`INSERT INTO polls (news_id,question,options,expires_at) VALUES (?,?,?,?)`).run(req.params.id,req.body.poll_question,JSON.stringify(opts),exp);}}
    if(req.body.remove_counter==='1')db.prepare(`DELETE FROM counters WHERE news_id=?`).run(req.params.id);
    else if(flag(req.body.counter_enabled))db.prepare(`INSERT OR REPLACE INTO counters (news_id,direction,start_date,label,bg_color,bg_gradient,font_style,text_color) VALUES (?,?,?,?,?,?,?,?)`).run(req.params.id,req.body.counter_direction||'up',req.body.counter_start_date||new Date().toISOString(),req.body.counter_label||'منذ',req.body.counter_bg_color||'#000',req.body.counter_bg_gradient||null,req.body.counter_font_style||'serif',req.body.counter_text_color||'#fff');
    res.json({success:true});
  });

  router.delete('/api/news/:id', requireAuth, requireEditor, (req,res)=>{
    const n=db.prepare(`SELECT * FROM news WHERE id=?`).get(req.params.id);
    if(!n)return res.status(404).json({error:'الخبر غير موجود'});
    try{if(n.main_image){const fp=path.join(__dirname,'../public',n.main_image);if(fs.existsSync(fp))fs.unlinkSync(fp);}JSON.parse(n.images||'[]').forEach(img=>{try{const fp=path.join(__dirname,'../public',img);if(fs.existsSync(fp))fs.unlinkSync(fp);}catch{}});}catch{}
    db.prepare(`DELETE FROM news WHERE id=?`).run(req.params.id);
    res.json({success:true});
  });

  // ─── Poll vote (auth required) ────────────────────────────
  router.post('/api/polls/:id/vote', requireAuth, (req,res)=>{
    const poll=db.prepare(`SELECT * FROM polls WHERE id=?`).get(req.params.id);
    if(!poll)return res.status(404).json({error:'التصويت غير موجود'});
    if(poll.expires_at&&new Date(poll.expires_at)<new Date())return res.status(400).json({error:'انتهت مدة التصويت'});
    const opts=JSON.parse(poll.options),idx=parseInt(req.body.option_index);
    if(isNaN(idx)||idx<0||idx>=opts.length)return res.status(400).json({error:'خيار غير صالح'});
    try{db.prepare(`INSERT INTO poll_votes (poll_id,user_id,option_index) VALUES (?,?,?)`).run(poll.id,req.session.user.id,idx);}
    catch{return res.status(400).json({error:'لقد صوتت بالفعل في هذا الاستطلاع'});}
    const votes=db.prepare(`SELECT option_index,COUNT(*) as count FROM poll_votes WHERE poll_id=? GROUP BY option_index`).all(poll.id);
    res.json({success:true,votes,total:votes.reduce((s,v)=>s+v.count,0),user_voted:idx});
  });

  // ─── Departments ──────────────────────────────────────────
  router.get('/api/departments',(req,res)=>res.json(db.prepare(`SELECT d.*,COUNT(n.id) as news_count FROM departments d LEFT JOIN news n ON d.id=n.department_id GROUP BY d.id ORDER BY d.name`).all()));
  router.post('/api/departments', requireAuth, requireEditor, (req,res)=>{
    const {name,slug}=req.body;
    if(!name||!slug)return res.status(400).json({error:'الاسم والمعرف مطلوبان'});
    try{const r=db.prepare(`INSERT INTO departments (name,slug) VALUES (?,?)`).run(name,slug);res.json({success:true,id:r.lastInsertRowid});}
    catch{res.status(400).json({error:'الشعبة موجودة مسبقاً'});}
  });
  router.delete('/api/departments/:id', requireAuth, requireEditor, (req,res)=>{db.prepare(`DELETE FROM departments WHERE id=?`).run(req.params.id);res.json({success:true});});

  // ─── Settings ─────────────────────────────────────────────
  router.get('/api/settings',(req,res)=>{const rows=db.prepare(`SELECT * FROM settings`).all();const s={};rows.forEach(r=>s[r.key]=r.value);res.json(s);});
  router.put('/api/settings', requireAuth, requireEditor, (req,res)=>{const stmt=db.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)`);Object.entries(req.body).forEach(([k,v])=>stmt.run(k,v));res.json({success:true});});

  // ─── Upload logo ──────────────────────────────────────────
  router.post('/api/upload-logo', requireAuth, requireEditor, uploadLogo.single('logo'), (req,res)=>{
    if(!req.file)return res.status(400).json({error:'لم يتم رفع أي ملف'});
    const lp='/img/'+req.file.filename;
    db.prepare(`INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)`).run('logo_path',lp);
    res.json({success:true,path:lp});
  });

  // ─── World News (NewsAPI proxy) ────────────────────────────
  router.get('/api/world-news', (req,res)=>{
    const apiKey=db.prepare(`SELECT value FROM settings WHERE key='newsapi_key'`).get()?.value;
    if(!apiKey)return res.json({articles:[],error:'no_key'});
    const country=req.query.country||db.prepare(`SELECT value FROM settings WHERE key='newsapi_country'`).get()?.value||'us';
    const category=req.query.category||db.prepare(`SELECT value FROM settings WHERE key='newsapi_category'`).get()?.value||'general';
    const url=`https://newsapi.org/v2/top-headlines?country=${country}&category=${category}&pageSize=12&apiKey=${apiKey}`;
    const options={hostname:'newsapi.org',path:`/v2/top-headlines?country=${country}&category=${category}&pageSize=12&apiKey=${apiKey}`,headers:{'User-Agent':'CNA/1.0'}};
    https.get(options,r=>{
      let body='';
      r.on('data',d=>body+=d);
      r.on('end',()=>{
        try{const data=JSON.parse(body);res.json(data);}
        catch{res.status(500).json({error:'parse_error'});}
      });
    }).on('error',e=>res.status(500).json({error:e.message}));
  });

  // ─── Archive ──────────────────────────────────────────────
  router.get('/api/archive',(req,res)=>res.json(db.prepare(`SELECT strftime('%Y',created_at) as year,strftime('%m',created_at) as month,COUNT(*) as count FROM news GROUP BY year,month ORDER BY year DESC,month DESC`).all()));

  return router;
};

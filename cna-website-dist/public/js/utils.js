// CNA — Shared Utilities

const monthNamesAr = ['','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const monthNamesEn = ['','January','February','March','April','May','June','July','August','September','October','November','December'];

function formatDate(ds, lang='ar') {
  if(!ds)return '';
  const d=new Date(ds); if(isNaN(d))return '';
  const months=lang==='en'?monthNamesEn:monthNamesAr;
  return `${d.getDate()} ${months[d.getMonth()+1]} ${d.getFullYear()}`;
}
function formatDateTime(ds, lang='ar') {
  if(!ds)return '';
  const d=new Date(ds); if(isNaN(d))return '';
  const h=String(d.getHours()).padStart(2,'0'), m=String(d.getMinutes()).padStart(2,'0');
  return `${formatDate(ds,lang)} - ${h}:${m}`;
}
function timeAgo(ds) {
  const d=new Date(ds), now=new Date(), diff=now-d, mins=Math.floor(diff/60000);
  if(mins<1)return 'الآن'; if(mins<60)return `منذ ${mins} دقيقة`;
  const hrs=Math.floor(mins/60); if(hrs<24)return `منذ ${hrs} ساعة`;
  const days=Math.floor(hrs/24); if(days<30)return `منذ ${days} يوم`;
  return formatDate(ds);
}

// Toast
function showToast(msg, type='success', dur=3000) {
  let t=document.getElementById('_toast');
  if(!t){t=document.createElement('div');t.id='_toast';t.className='toast';document.body.appendChild(t);}
  t.textContent=msg; t.className=`toast ${type}`;
  requestAnimationFrame(()=>t.classList.add('show'));
  clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),dur);
}

// API
async function api(url,opts={}){
  const res=await fetch(url,{headers:{'Content-Type':'application/json',...opts.headers},...opts});
  const data=await res.json();
  if(!res.ok)throw new Error(data.error||'حدث خطأ');
  return data;
}
async function apiForm(url,fd,method='POST'){
  const res=await fetch(url,{method,body:fd});
  const data=await res.json();
  if(!res.ok)throw new Error(data.error||'حدث خطأ');
  return data;
}

// Auth header
async function initHeader(opts={}) {
  try {
    const {user}=await api('/api/me');
    const el=document.getElementById('header-actions');
    if(!el)return user;
    if(user){
      const isStaff=user.role==='admin'||user.role==='editor';
      el.innerHTML=`
        ${isStaff?'<a href="/admin" class="btn btn-sm">الإدارة</a>':''}
        <a href="/profile" class="btn btn-sm btn-ghost">${escHtml(user.full_name||user.username)}</a>
        <button onclick="logout()" class="btn btn-sm btn-ghost">خروج</button>
      `;
    } else {
      el.innerHTML=`<a href="/register" class="btn btn-sm">حساب جديد</a><a href="/login" class="btn btn-sm btn-primary">دخول</a>`;
    }
    return user;
  } catch { return null; }
}
async function logout(){await api('/api/logout',{method:'POST'});window.location.href='/';}

function escHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// Render news card (bilingual)
function renderNewsCard(n, prefLang='ar') {
  const title = (prefLang==='en'&&n.title_en) ? n.title_en : n.title;
  const desc  = (prefLang==='en'&&n.short_description_en) ? n.short_description_en : n.short_description;
  const isEn  = prefLang==='en' && n.title_en;
  const imgHtml=n.main_image
    ?`<div class="news-card-image"><img src="${n.main_image}" alt="${escHtml(title)}" loading="lazy"></div>`
    :`<div class="news-card-no-image">CNA</div>`;
  return `
    <article class="news-card ${isEn?'ltr':''}" onclick="location.href='/news/${n.id}'">
      ${imgHtml}
      <div class="news-card-body">
        <div class="news-card-category">
          ${n.is_live?`<span class="live-card-badge"><span class="live-dot-sm"></span>LIVE</span>`:''}
          ${n.is_breaking?'<span class="breaking-badge">عاجل</span>':''}
          ${isEn?'<span class="en-card-badge">EN</span>':''}
          <span>${n.department_name||n.category||'عام'}</span>
        </div>
        <h3 class="news-card-title">${escHtml(title)}</h3>
        <p class="news-card-desc">${escHtml(desc||'')}</p>
        <div class="news-card-footer">
          <span>${timeAgo(n.created_at)}</span>
          <span>${n.department_name||''}</span>
        </div>
      </div>
    </article>`;
}

// Render pagination
function renderPagination(cur, total, fn) {
  if(total<=1)return '';
  let h='<div class="pagination">';
  if(cur>1)h+=`<button class="page-btn" onclick="${fn}(${cur-1})">&#8250;</button>`;
  let s=Math.max(1,cur-2),e=Math.min(total,cur+2);
  if(s>1){h+=`<button class="page-btn" onclick="${fn}(1)">1</button>`;if(s>2)h+='<span class="page-btn" style="pointer-events:none">…</span>';}
  for(let i=s;i<=e;i++)h+=`<button class="page-btn ${i===cur?'active':''}" onclick="${fn}(${i})">${i}</button>`;
  if(e<total){if(e<total-1)h+='<span class="page-btn" style="pointer-events:none">…</span>';h+=`<button class="page-btn" onclick="${fn}(${total})">${total}</button>`;}
  if(cur<total)h+=`<button class="page-btn" onclick="${fn}(${cur+1})">&#8249;</button>`;
  return h+'</div>';
}

// Lightbox
function openLightbox(src){
  let o=document.getElementById('_lb');
  if(!o){o=document.createElement('div');o.id='_lb';o.className='modal-overlay';o.innerHTML='<button class="modal-close" onclick="closeLightbox()">&#10005;</button><img class="modal-img" id="_lb_img">';o.addEventListener('click',e=>{if(e.target===o)closeLightbox();});document.body.appendChild(o);}
  document.getElementById('_lb_img').src=src;o.classList.add('active');document.body.style.overflow='hidden';
}
function closeLightbox(){const o=document.getElementById('_lb');if(o)o.classList.remove('active');document.body.style.overflow='';}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeLightbox();});

// ─── TICKER ENGINE (FIXED) ──────────────────────────────────
function initTicker(items, speed=40, bgColor='#000', textColor='#fff') {
  const ticker=document.getElementById('breaking-ticker');
  const track=document.getElementById('ticker-track');
  if(!ticker||!track||!items.length)return;

  ticker.style.display='flex';
  if(bgColor)ticker.style.background=bgColor;
  if(textColor)ticker.style.color=textColor;

  // Build items × 3 for seamless loop
  const makeItems=()=>items.map(n=>`<span class="ticker-item" onclick="location.href='/news/${n.id}'">${escHtml(n.title)}</span><span class="ticker-sep">◆</span>`).join('');
  track.innerHTML=makeItems()+makeItems()+makeItems();

  let pos=0, animId=null, paused=false;
  const pxPerSec=Math.max(20,120-speed); // higher speed val = slower (inverted for UI)

  function step(ts){
    if(!paused){
      pos+=pxPerSec/60;
      const halfW=track.scrollWidth/3;
      if(pos>=halfW)pos=0;
      track.style.transform=`translateX(${pos}px)`;
    }
    animId=requestAnimationFrame(step);
  }
  ticker.addEventListener('mouseenter',()=>paused=true);
  ticker.addEventListener('mouseleave',()=>paused=false);
  animId=requestAnimationFrame(step);
}

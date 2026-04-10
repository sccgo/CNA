// CNA - Shared Utilities

// Format date in Arabic
function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  const h = d.getHours().toString().padStart(2,'0');
  const m = d.getMinutes().toString().padStart(2,'0');
  return `${formatDate(dateStr)} - ${h}:${m}`;
}

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `منذ ${hrs} ساعة`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `منذ ${days} يوم`;
  return formatDate(dateStr);
}

// Toast notification
function showToast(msg, type = 'success', duration = 3000) {
  let t = document.getElementById('_toast');
  if (!t) {
    t = document.createElement('div');
    t.id = '_toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = `toast ${type}`;
  requestAnimationFrame(() => { t.classList.add('show'); });
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.classList.remove('show'); }, duration);
}

// API helpers
async function api(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'حدث خطأ');
    return data;
  } catch (e) {
    throw e;
  }
}

async function apiForm(url, formData, method = 'POST') {
  const res = await fetch(url, { method, body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'حدث خطأ');
  return data;
}

// Check auth and update header
async function initHeader() {
  try {
    const data = await api('/api/me');
    const actionsEl = document.getElementById('header-actions');
    if (!actionsEl) return;
    if (data.user) {
      actionsEl.innerHTML = `
        <a href="/admin" class="btn btn-sm">لوحة الادارة</a>
        <button onclick="logout()" class="btn btn-sm btn-ghost">خروج</button>
      `;
    } else {
      actionsEl.innerHTML = `<a href="/login" class="btn btn-sm btn-primary">دخول</a>`;
    }
  } catch {}
}

async function logout() {
  await api('/api/logout', { method: 'POST' });
  window.location.href = '/';
}

// Render news card
function renderNewsCard(n) {
  const imgHtml = n.main_image
    ? `<div class="news-card-image"><img src="${n.main_image}" alt="${n.title}" loading="lazy"></div>`
    : `<div class="news-card-no-image"><span>CNA</span></div>`;
  
  return `
    <article class="news-card" onclick="location.href='/news/${n.id}'">
      ${imgHtml}
      <div class="news-card-body">
        <div class="news-card-category">
          ${n.is_breaking ? '<span class="breaking-badge">عاجل</span>' : ''}
          ${n.department_name || n.category || 'عام'}
        </div>
        <h3 class="news-card-title">${n.title}</h3>
        <p class="news-card-desc">${n.short_description || ''}</p>
        <div class="news-card-footer">
          <span>${timeAgo(n.created_at)}</span>
          <span>${n.department_name || ''}</span>
        </div>
      </div>
    </article>
  `;
}

// Render pagination
function renderPagination(current, total, onClick) {
  if (total <= 1) return '';
  let html = '<div class="pagination">';
  if (current > 1) html += `<button class="page-btn" onclick="${onClick}(${current-1})">&#8250;</button>`;
  
  let start = Math.max(1, current - 2);
  let end = Math.min(total, current + 2);
  if (start > 1) { html += `<button class="page-btn" onclick="${onClick}(1)">1</button>`; if (start > 2) html += '<span class="page-btn" style="pointer-events:none">...</span>'; }
  
  for (let i = start; i <= end; i++) {
    html += `<button class="page-btn ${i === current ? 'active' : ''}" onclick="${onClick}(${i})">${i}</button>`;
  }
  
  if (end < total) { if (end < total - 1) html += '<span class="page-btn" style="pointer-events:none">...</span>'; html += `<button class="page-btn" onclick="${onClick}(${total})">${total}</button>`; }
  if (current < total) html += `<button class="page-btn" onclick="${onClick}(${current+1})">&#8249;</button>`;
  
  html += '</div>';
  return html;
}

// Lightbox
function openLightbox(src) {
  let overlay = document.getElementById('_lightbox');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = '_lightbox';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<button class="modal-close" onclick="closeLightbox()">&#10005;</button><img class="modal-img" id="_lb_img">`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeLightbox(); });
    document.body.appendChild(overlay);
  }
  document.getElementById('_lb_img').src = src;
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  const o = document.getElementById('_lightbox');
  if (o) o.classList.remove('active');
  document.body.style.overflow = '';
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

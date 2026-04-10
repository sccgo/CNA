// Admin shared layout - included in all admin pages
function getAdminLayout(pageTitle, activeLink, contentHtml) {
  return `<!-- This is used as a template string generator -->`
}

// Admin sidebar HTML generator (used inline)
function renderAdminSidebar(active) {
  return `
    <div class="admin-sidebar">
      <div class="admin-sidebar-logo">
        <div class="admin-logo-en">CNA</div>
        <div class="admin-logo-ar">وكالة الأنباء التنسيقية</div>
      </div>
      <div class="admin-user-info">
        <div class="admin-user-name" id="admin-user-name">...</div>
        <div id="admin-user-role"></div>
      </div>
      <nav class="admin-nav">
        <div class="admin-nav-section">الرئيسية</div>
        <a href="/admin" class="admin-nav-link ${active==='dashboard'?'active':''}">
          <span class="admin-nav-icon">&#9632;</span> لوحة التحكم
        </a>
        <a href="/" class="admin-nav-link" target="_blank">
          <span class="admin-nav-icon">&#9633;</span> عرض الموقع
        </a>
        
        <div class="admin-nav-section">الأخبار</div>
        <a href="/admin/create" class="admin-nav-link ${active==='create'?'active':''}">
          <span class="admin-nav-icon">+</span> إنشاء خبر
        </a>
        <a href="/admin" class="admin-nav-link ${active==='dashboard'?'active':''}">
          <span class="admin-nav-icon">&#9776;</span> إدارة الأخبار
        </a>
        
        <div class="admin-nav-section">الإعدادات</div>
        <a href="/admin/departments" class="admin-nav-link ${active==='departments'?'active':''}">
          <span class="admin-nav-icon">&#9650;</span> الشعب
        </a>
        <a href="/admin/settings" class="admin-nav-link ${active==='settings'?'active':''}">
          <span class="admin-nav-icon">&#9881;</span> إعدادات الموقع
        </a>
        <a href="/admin/users" class="admin-nav-link ${active==='users'?'active':''}">
          <span class="admin-nav-icon">&#9786;</span> المستخدمين
        </a>
        
        <div style="padding:1.5rem; margin-top:auto">
          <button onclick="logout()" class="btn" style="width:100%; border-color:rgba(255,255,255,0.2); color:rgba(255,255,255,0.6); font-size:0.8rem">
            تسجيل الخروج
          </button>
        </div>
      </nav>
    </div>
  `;
}

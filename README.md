# وكالة الأنباء التنسيقية (CNA)
## Coordinating News Agency — Official Website

---

### متطلبات التشغيل
- Node.js v16 أو أحدث
- npm

### خطوات التشغيل

```bash
# 1. تثبيت الحزم
npm install

# 2. تشغيل الموقع
npm start

# 3. افتح المتصفح على:
http://localhost:3000
```

### بيانات الدخول الافتراضية
- **المستخدم:** `admin`
- **كلمة المرور:** `admin123`

### الصفحات
| الرابط | الوصف |
|--------|-------|
| `/` | الصفحة الرئيسية |
| `/news/:id` | صفحة تفاصيل خبر |
| `/archive` | الأرشيف |
| `/login` | بوابة الدخول |
| `/admin` | لوحة التحكم |
| `/admin/create` | إنشاء خبر جديد |
| `/admin/settings` | إعدادات الموقع |
| `/admin/users` | إدارة المستخدمين |
| `/admin/departments` | إدارة الشعب |

### API Endpoints
```
GET    /api/news              جلب الأخبار (مع فلاتر)
GET    /api/news/breaking     الأخبار العاجلة
GET    /api/news/featured     الخبر المميز
GET    /api/news/:id          خبر واحد
POST   /api/news              إنشاء خبر (يتطلب تسجيل دخول)
PUT    /api/news/:id          تعديل خبر (يتطلب تسجيل دخول)
DELETE /api/news/:id          حذف خبر (يتطلب تسجيل دخول)
POST   /api/polls/:id/vote    التصويت
GET    /api/departments       جلب الشعب
POST   /api/departments       إضافة شعبة
GET    /api/settings          جلب الإعدادات
PUT    /api/settings          تحديث الإعدادات
GET    /api/archive           بيانات الأرشيف
GET    /api/me                معلومات المستخدم الحالي
POST   /api/login             تسجيل الدخول
POST   /api/logout            تسجيل الخروج
```

### التقنيات المستخدمة
- **Backend:** Node.js + Express
- **Database:** SQLite (via sql.js — WASM, no native build needed)
- **Sessions:** express-session
- **File Upload:** multer
- **Password Hashing:** bcryptjs
- **Rich Text Editor:** Quill.js (CDN)
- **Frontend:** Vanilla HTML/CSS/JS (RTL Arabic)

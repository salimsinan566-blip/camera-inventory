# 🛡️ معايير أمان وقواعد بيانات Firestore (Firestore & Security Rules)

تُطبق هذه القواعد عند التعامل مع ملفات `firestore.rules`, `src/firebase/`, `api/firebase-admin.js`:

## 1. قواعد الأمان الصارمة (Zero Trust & Auth Validation)
- منع أي قراءة أو كتابة غير موثقة: `request.auth != null`.
- في مستندات حساسة (مثل الأرباح الصافية، الإعدادات، تقارير النثريات)، التأكد من تطابق دور المستخدم (Admin vs Cashier) عند التوسع في الصلاحيات.
- منع التعديل المباشر على الحقول الحساسة مثل `createdAt` أو مسح سجل التدقيق.

## 2. تحسين الاستعلامات والفهارس (Queries & Indexes)
- تجنب جلب مجموعات بيانات ضخمة (Collections) بالكامل إلى الواجهة؛ استخدم دائماً الفلاتر والـ Pagination أو `limit()`.
- التحقق من وجود Composite Indexes في حال استخدام استعلامات متعددة الحقول (`where` + `orderBy`).

## 3. التعامل مع البيانات الحساسة ومفاتيح الـ API
- لا تضع مفاتيح حقيقية (API Keys / Service Account JSONs) داخل كود الواجهة الأمامية.
- استخدم دائماً متغيرات البيئة `.env` و Vercel/Netlify Environment Variables.

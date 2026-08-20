# نظام إدارة مخزون كامرات المراقبة (محل + مخزن)

## المرحلة 1 — ما تم إنجازه

- هيكلة مشروع React (Vite) + Tailwind CSS جاهزة.
- إعداد اتصال Firebase/Firestore عبر متغيرات بيئة فقط (`.env`) — لا مفاتيح حقيقية في الكود.
- Schema المنتج مُعرَّف بالكامل في `src/models/product.js`: **مخزون واحد موحّد** — كل منتج مستند واحد، و SKU فريد بالكامل عبر النظام (لا تقسيم كميات بين المحل والمخزن). حقل `location` يحدد فقط أين يقع المنتج حالياً.
- **حماية الدخول بحساب واحد** (Firebase Auth email/password): شاشة دخول (`src/components/LoginScreen.jsx`) + قواعد Firestore تمنع أي وصول بدون تسجيل دخول.
- قواعد أمان Firestore (`firestore.rules`): `allow read, write: if request.auth != null;`
- واجهة مؤقتة بسيطة (`src/App.jsx`) تعرض شاشة الدخول ثم تتحقق من نجاح الاتصال بـ Firestore — واجهة إدارة المنتجات الكاملة تُبنى في المرحلة 2.

## خطوات الإعداد المطلوبة منك

1. أنشئ مشروع Firebase جديد من [console.firebase.google.com](https://console.firebase.google.com).
2. فعّل **Firestore Database** (وضع الإنتاج).
3. فعّل **Authentication > Sign-in method > Email/Password**.
4. من **Authentication > Users > Add user** أنشئ الحساب الوحيد (الإيميل وكلمة المرور اللي رح تستخدمها انت).
5. فعّل **Firebase Hosting**.
6. من إعدادات المشروع (Project Settings > Your apps) أنشئ تطبيق Web وانسخ القيم إلى ملف `.env` (انسخه من `.env.example`).
7. ثبّت الحزم: `npm install`
8. شغّل محلياً: `npm run dev` — رح تظهر شاشة تسجيل الدخول أولاً.
9. عند النشر: `npm run build` ثم `firebase deploy`، وتأكد من نشر `firestore.rules` أيضاً (`firebase deploy --only firestore:rules`).

## بنية المشروع الحالية

```
camera-inventory/
├── .env.example              # أسماء متغيرات البيئة فقط
├── firestore.rules            # قواعد أمان (تتطلب تسجيل دخول)
├── src/
│   ├── firebase/config.js     # اتصال Firebase
│   ├── firebase/auth.js       # دوال تسجيل الدخول/الخروج
│   ├── hooks/useAuth.js       # تتبع حالة الجلسة
│   ├── components/LoginScreen.jsx  # شاشة الدخول
│   ├── models/product.js      # Schema المنتج + دوال تحقق
│   ├── App.jsx                 # حماية الدخول + واجهة تحقق مؤقتة
│   └── main.jsx
```

## المرحلة القادمة
ننتقل للمرحلة 2: واجهة إدارة المنتجات الكاملة (إضافة/تعديل/حذف) مع الربط الحي بـ Firestore، باستخدام نفس Schema أعلاه (SKU فريد، مخزون موحّد).

# 🚀 دليل تشغيل خادم Evolution API v2 والكرون على سيرفر AWS

هذا الدليل يشرح خطوات تشغيل خادم **Evolution API v2** الأكثر استقراراً وقوة مع منظومة الـ **Cron** على سيرفر أمازون الخاص بك (**AWS EC2 / Lightsail**) في دقائق معدودة.

---

## 🛠️ الخطوة 1: تشغيل Evolution API عبر Docker على AWS

1. اتصل بسيرفر AWS الخاص بك عبر الـ SSH:
   ```bash
   ssh -i your-key.pem ubuntu@13.61.182.143
   ```

2. أنشئ مجلد الخادم وضع بداخله ملف `docker-compose.yml`:
   ```bash
   mkdir -p ~/evolution-whatsapp && cd ~/evolution-whatsapp
   ```

3. أنشئ ملف `docker-compose.yml` (أو انسخ المحتوى الموجود في مجلد `whatsapp-server/docker-compose.yml`):
   ```bash
   cat << 'EOF' > docker-compose.yml
   services:
     evolution-api:
       container_name: evolution_api
       image: evoapicloud/evolution-api:latest
       restart: always
       ports:
         - "8080:8080"
       environment:
         - SERVER_URL=http://localhost:8080
         - SERVER_PORT=8080
         - SERVER_TYPE=http
         - CORS_ORIGIN=*
         - CORS_METHODS=GET,POST,PUT,DELETE,OPTIONS
         - CORS_CREDENTIALS=true
         - AUTHENTICATION_TYPE=apikey
         - AUTHENTICATION_API_KEY=SafeZone2026
         - DATABASE_PROVIDER=postgresql
         - DATABASE_CONNECTION_URI=postgresql://evolution:SafeZone2026@evolution-postgres:5432/evolution_db?schema=public
         - CACHE_REDIS_ENABLED=true
         - CACHE_REDIS_URI=redis://evolution-redis:6379/6
         - CACHE_REDIS_PREFIX_KEY=evolution
         - CACHE_REDIS_SAVE_INSTANCES=true
         - DELAY_IGNORE_GROUPS=true
         - SENTRY_ENABLED=false
         - LOG_LEVEL=ERROR,WARN,INFO
       volumes:
         - evolution_instances:/evolution/instances
         - evolution_store:/evolution/store
       depends_on:
         - evolution-postgres
         - evolution-redis

     evolution-postgres:
       container_name: evolution_postgres
       image: postgres:15-alpine
       restart: always
       environment:
         POSTGRES_USER: evolution
         POSTGRES_PASSWORD: SafeZone2026
         POSTGRES_DB: evolution_db
       volumes:
         - evolution_pgdata:/var/lib/postgresql/data

     evolution-redis:
       container_name: evolution_redis
       image: redis:alpine
       restart: always
       volumes:
         - evolution_redisdata:/data

   volumes:
     evolution_instances:
     evolution_store:
     evolution_pgdata:
     evolution_redisdata:
   EOF
   ```

4. شغّل الحاوية في الخلفية بأمر واحد:
   ```bash
   sudo docker compose up -d
   ```

5. للتأكد من أن الخادم يعمل:
   ```bash
   sudo docker ps
   ```

---

## 🔓 الخطوة 2: فتح المنفذ (Port 8080) في AWS

تأكد من فتح المنفذ **8080** في لوحة تحكم AWS:
1. توجه إلى **AWS Console** ⬅️ **EC2** (أو Lightsail) ⬅️ **Security Groups**.
2. في **Inbound rules**، اضغط **Edit inbound rules**.
3. أضف قاعدة جديدة:
   - **Type**: Custom TCP
   - **Port range**: `8080`
   - **Source**: `0.0.0.0/0` (Anywhere IPv4)
4. اضغط **Save rules**.

---

## ⏰ الخطوة 3: تشغيل الـ Cron التلقائي على سيرفر AWS (بدون أي وسيط!)

سيرفر AWS شغال 24/7، ويمكنك تشغيل المنبه التلقائي بإحدى طريقتين:

### الخيار (أ) - عبر Linux Crontab (الأسهل والأسرع):
افتح محرر الكرون على السيرفر:
```bash
crontab -e
```
أضف الأسطر التالية في نهاية الملف (استبدل رابط موقعك الفعلي):
```bash
# تذكير الديون التلقائي (يفحص العملاء كل 10 دقائق)
*/10 * * * * curl -s "https://your-domain.vercel.app/api/cron-debt-reminders" > /dev/null

# التقرير اليومي للنواقص (الساعة 8 مساءً بتوقيت بغداد - 17:00 UTC)
0 17 * * * curl -s "https://your-domain.vercel.app/api/cron-report" > /dev/null

# النسخ الاحتياطي التلقائي (الساعة 11 ليلاً بتوقيت بغداد - 20:00 UTC)
0 20 * * * curl -s "https://your-domain.vercel.app/api/google-drive-backup" > /dev/null
```

### الخيار (ب) - عبر مشغل Node Cron المرفق (`aws-cron-runner.mjs`):
إذا كنت تفضل تشغيله عبر Node.js / PM2:
```bash
APP_URL="https://your-domain.vercel.app" pm2 start aws-cron-runner.mjs --name "system-cron"
```

---

## 📱 الخطوة 4: ربط الواتساب من شاشة الإعدادات في البرنامج

1. ادخل إلى نظامك ⬅️ **الإعدادات** ⬅️ تبويب **إعدادات الواتساب وتذكير الديون**.
2. تأكد من إدخال:
   - **رابط السيرفر**: `http://IP_OF_AWS_SERVER:8080` (مثال: `http://13.61.182.143:8080`).
   - **اسم الجلسة**: `SafeZone`.
   - **مفتاح الأمان**: `SafeZone2026`.
3. اضغط زر **"حفظ الإعدادات"**.
4. اضغط زر **"📱 مسح رمز الـ QR Code"**.
5. سيظهر لك رمز الـ QR عالي الجودة على الشاشة، افتح الواتساب في هاتفك وامسح الكود.
6. فور المسح، ستتحول الحالة إلى **🟢 متصل بنجاح** وسيظهر رقم هاتفك واسم المتجر.
7. جرب إرسال رسالة تجريبية إلى هاتفك للتأكد من الجاهزية 🚀.

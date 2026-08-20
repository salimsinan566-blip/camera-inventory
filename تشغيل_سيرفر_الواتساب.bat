@echo off
chcp 65001 > nul
title سيرفر واتساب المنطقة الآمنة - Safe Zone WhatsApp Gateway
color 0A

echo ========================================================
echo        🚀 جاري تشغيل سيرفر واتساب المنطقة الآمنة...
echo ========================================================
echo.

cd /d "%~dp0whatsapp-server"

if not exist node_modules (
    echo 📦 جاري تثبيت الحزم والمكتبات لأول مرة...
    call npm install
)

echo 🌐 جاري تشغيل السيرفر وفتح لوحة التحكم...
echo.

start "" cmd /c "timeout /t 2 /nobreak > nul & start http://localhost:3005"
node server.mjs

pause

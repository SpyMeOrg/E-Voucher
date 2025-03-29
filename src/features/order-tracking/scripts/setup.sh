#!/bin/bash

# سكربت إعداد السيرفر الرئيسي لنظام تتبع الأوردرات - Voo Payment
# ======================================================

# طباعة رسالة ترحيب
echo "==================================================================="
echo "              إعداد سيرفر نظام تتبع الأوردرات - Voo Payment"
echo "==================================================================="

# التأكد من تشغيل السكربت كـ root
if [ "$(id -u)" -ne 0 ]; then
    echo "يجب تشغيل هذا السكربت بصلاحيات root."
    echo "الرجاء استخدام: sudo ./setup.sh"
    exit 1
fi

# تحديث قائمة الحزم
echo "جاري تحديث قائمة الحزم..."
apt-get update

# تثبيت الحزم الأساسية
echo "جاري تثبيت الحزم الأساسية..."
apt-get install -y curl wget git build-essential libssl-dev

# تثبيت Node.js 18.x
echo "جاري تثبيت Node.js 18.x..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# التحقق من إصدار Node.js و npm
node -v
npm -v

# تثبيت PM2 عالمياً
echo "جاري تثبيت PM2..."
npm install -g pm2

# تثبيت dependancies المشروع
echo "جاري تثبيت مكتبات المشروع..."
cd /opt/voo-order-tracker
npm install

# إعداد جدار الحماية (UFW)
echo "جاري إعداد جدار الحماية..."
apt-get install -y ufw
ufw allow ssh
ufw allow http
ufw allow https
ufw --force enable

# إنشاء مستخدم خاص بالتطبيق
echo "جاري إنشاء مستخدم خاص بالتطبيق..."
useradd -m -s /bin/bash voo-app
cp -r /opt/voo-order-tracker /home/voo-app/
chown -R voo-app:voo-app /home/voo-app/voo-order-tracker

# إعداد خدمة النظام
echo "جاري إعداد خدمة النظام..."
cp /home/voo-app/voo-order-tracker/scripts/voo-tracker.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable voo-tracker
systemctl start voo-tracker

# إعداد نظام النسخ الاحتياطي التلقائي
echo "جاري إعداد نظام النسخ الاحتياطي التلقائي..."
cp /home/voo-app/voo-order-tracker/scripts/backup.sh /home/voo-app/
chmod +x /home/voo-app/backup.sh
(crontab -l 2>/dev/null; echo "0 0 * * * /home/voo-app/backup.sh") | crontab -

echo "==================================================================="
echo "               تم الانتهاء من إعداد السيرفر بنجاح!"
echo "==================================================================="
echo "* تم تثبيت Node.js 18.x"
echo "* تم تثبيت PM2"
echo "* تم إعداد جدار الحماية"
echo "* تم إنشاء مستخدم خاص بالتطبيق (voo-app)"
echo "* تم إعداد خدمة النظام"
echo "* تم إعداد نظام النسخ الاحتياطي التلقائي"
echo "==================================================================="
echo "للتحقق من حالة الخدمة:"
echo "systemctl status voo-tracker"
echo "===================================================================" 
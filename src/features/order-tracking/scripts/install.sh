#!/bin/bash

# سكربت التثبيت السريع لنظام تتبع الأوردرات - Voo Payment
# ======================================================

# طباعة رسالة ترحيب
echo "==================================================================="
echo "            تثبيت سريع لنظام تتبع الأوردرات - Voo Payment"
echo "==================================================================="

# التأكد من تشغيل السكربت كـ root
if [ "$(id -u)" -ne 0 ]; then
    echo "يجب تشغيل هذا السكربت بصلاحيات root."
    echo "الرجاء استخدام: sudo ./install.sh"
    exit 1
fi

# التحقق من وجود المتطلبات الأساسية
command -v git >/dev/null 2>&1 || { 
    echo "جاري تثبيت git..." 
    apt-get update && apt-get install -y git 
}

# استنساخ المستودع
echo "جاري استنساخ مستودع المشروع..."
mkdir -p /opt
git clone https://github.com/SpyMeOrg/E-Voucher.git /opt/voo-order-tracker

# تنفيذ سكربت الإعداد
echo "جاري تنفيذ سكربت الإعداد..."
cd /opt/voo-order-tracker
chmod +x ./src/features/order-tracking/scripts/setup.sh
./src/features/order-tracking/scripts/setup.sh

# إنشاء ملف البيئة
echo "جاري إنشاء ملف البيئة..."
cp ./src/features/order-tracking/scripts/.env.example /home/voo-app/voo-order-tracker/.env

echo "==================================================================="
echo "                 تم التثبيت بنجاح! الخطوات التالية:"
echo "==================================================================="
echo "1. قم بتعديل ملف البيئة:"
echo "   nano /home/voo-app/voo-order-tracker/.env"
echo "2. أعد تشغيل الخدمة:"
echo "   systemctl restart voo-tracker"
echo "3. تحقق من حالة الخدمة:"
echo "   systemctl status voo-tracker"
echo "===================================================================" 
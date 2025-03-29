#!/bin/bash

# سكربت النسخ الاحتياطي اليومي لنظام تتبع الأوردرات - Voo Payment
# =========================================================

# تحديد المتغيرات
DATE=$(date +"%Y-%m-%d")
BACKUP_DIR="/home/voo-app/backups"
APP_DIR="/home/voo-app/voo-order-tracker"
BACKUP_FILE="voo-tracker-backup-$DATE.tar.gz"

# التأكد من وجود مجلد النسخ الاحتياطي
if [ ! -d "$BACKUP_DIR" ]; then
    mkdir -p "$BACKUP_DIR"
fi

# إنشاء النسخة الاحتياطية
echo "جاري إنشاء النسخة الاحتياطية..."
tar -zcf "$BACKUP_DIR/$BACKUP_FILE" "$APP_DIR/data" "$APP_DIR/.env"

# حذف النسخ الاحتياطية القديمة (أكثر من 7 أيام)
echo "جاري تنظيف النسخ الاحتياطية القديمة..."
find "$BACKUP_DIR" -name "voo-tracker-backup-*.tar.gz" -type f -mtime +7 -delete

echo "تم إنشاء النسخة الاحتياطية بنجاح: $BACKUP_FILE"
echo "حجم النسخة الاحتياطية: $(du -h "$BACKUP_DIR/$BACKUP_FILE" | cut -f1)" 
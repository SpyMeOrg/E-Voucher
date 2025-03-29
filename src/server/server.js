const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// تحميل متغيرات البيئة
dotenv.config();

// إنشاء تطبيق Express
const app = express();

// الإعدادات الأساسية
app.use(bodyParser.json());
app.use(cors());

// مجلد البيانات
const DATA_DIR = process.env.DATA_DIRECTORY || path.join(__dirname, '../../data');

// التأكد من وجود مجلد البيانات
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`تم إنشاء مجلد البيانات: ${DATA_DIR}`);
}

// محاكاة استيراد الخدمات
console.log('تهيئة خدمات النظام...');
console.log('- تهيئة خدمة مراقبة البريد الإلكتروني');
console.log('- تهيئة خدمة معالجة ملفات Excel');
console.log('- تهيئة خدمة الواتساب');

// المسارات الأساسية للـ API
app.post('/connect', (req, res) => {
    const { ip, pemKey } = req.body;
    
    // حفظ بيانات الاتصال (سيتم تنفيذ الاتصال الفعلي لاحقاً)
    const serverConfig = {
        ip,
        pemKey: pemKey.substring(0, 20) + '...' // تخزين جزء من المفتاح للأمان
    };
    
    fs.writeFileSync(path.join(DATA_DIR, 'server-config.json'), JSON.stringify(serverConfig));
    
    // إرجاع حالة نجاح
    res.json({ status: 'connected', message: 'تم الاتصال بالسيرفر بنجاح' });
});

app.post('/install', (req, res) => {
    // محاكاة تثبيت المكتبات (سيتم تنفيذ التثبيت الفعلي لاحقاً)
    setTimeout(() => {
        res.json({ status: 'installed', message: 'تم تثبيت المكتبات بنجاح' });
    }, 2000);
});

app.post('/disconnect', (req, res) => {
    // إزالة ملف التكوين
    if (fs.existsSync(path.join(DATA_DIR, 'server-config.json'))) {
        fs.unlinkSync(path.join(DATA_DIR, 'server-config.json'));
    }
    
    res.json({ status: 'disconnected' });
});

// إعدادات الواتساب
app.post('/whatsapp/settings', (req, res) => {
    const { numbers, isActive } = req.body;
    
    // حفظ إعدادات الواتساب
    fs.writeFileSync(
        path.join(DATA_DIR, 'whatsapp-config.json'),
        JSON.stringify({ numbers, isActive })
    );
    
    console.log(`تم تحديث إعدادات الواتساب: ${numbers.length} أرقام، الحالة: ${isActive ? 'مفعّل' : 'معطّل'}`);
    
    res.json({ success: true, message: 'تم حفظ إعدادات الواتساب بنجاح' });
});

app.get('/whatsapp/settings', (req, res) => {
    try {
        if (fs.existsSync(path.join(DATA_DIR, 'whatsapp-config.json'))) {
            const config = JSON.parse(
                fs.readFileSync(path.join(DATA_DIR, 'whatsapp-config.json'), 'utf8')
            );
            res.json(config);
        } else {
            res.json({ numbers: [], isActive: false });
        }
    } catch (error) {
        console.error('خطأ في قراءة إعدادات الواتساب:', error);
        res.json({ numbers: [], isActive: false });
    }
});

// الحصول على الأوردرات
app.get('/orders', (req, res) => {
    try {
        if (fs.existsSync(path.join(DATA_DIR, 'orders.json'))) {
            const orders = JSON.parse(
                fs.readFileSync(path.join(DATA_DIR, 'orders.json'), 'utf8')
            );
            res.json(orders);
        } else {
            // إنشاء ملف فارغ إذا لم يكن موجوداً
            fs.writeFileSync(path.join(DATA_DIR, 'orders.json'), JSON.stringify([]));
            res.json([]);
        }
    } catch (error) {
        console.error('خطأ في قراءة الأوردرات:', error);
        res.json([]);
    }
});

// محاكاة نظام تتبع الأوردرات
function startOrderTracking() {
    console.log('بدء نظام تتبع الأوردرات...');
    
    // محاكاة استلام أوردر جديد كل 30 ثانية للاختبار
    setInterval(() => {
        if (Math.random() > 0.7) { // 30% احتمالية استلام أوردر جديد
            const newOrder = {
                id: Date.now(),
                referenceNumber: `ORD-${Math.floor(Math.random() * 10000)}`,
                mobileNumber: `01${Math.floor(Math.random() * 10)}${Math.floor(Math.random() * 100000000)}`,
                amount: Math.floor(Math.random() * 5000) + 500,
                date: new Date().toISOString(),
                operator: ['vodafone', 'etisalat', 'orange', 'we'][Math.floor(Math.random() * 4)],
                status: 'new'
            };
            
            // حساب الرسوم
            if (newOrder.operator === 'vodafone') {
                newOrder.fee = 1;
            } else {
                newOrder.fee = Math.min(newOrder.amount * 0.005, 15);
            }
            
            // المبلغ النهائي
            newOrder.finalAmount = newOrder.amount - newOrder.fee;
            
            // حفظ الأوردر
            saveOrder(newOrder);
            
            console.log(`تم استلام أوردر جديد: ${newOrder.referenceNumber}, المبلغ: ${newOrder.amount} جنيه`);
        }
    }, 30000);
}

// حفظ أوردر جديد
function saveOrder(order) {
    try {
        let orders = [];
        if (fs.existsSync(path.join(DATA_DIR, 'orders.json'))) {
            orders = JSON.parse(
                fs.readFileSync(path.join(DATA_DIR, 'orders.json'), 'utf8')
            );
        }
        
        orders.push(order);
        
        fs.writeFileSync(
            path.join(DATA_DIR, 'orders.json'),
            JSON.stringify(orders)
        );
        
        // محاكاة إرسال إشعار واتساب
        sendWhatsAppNotification(order);
    } catch (error) {
        console.error('خطأ في حفظ الأوردر:', error);
    }
}

// إرسال إشعار واتساب
function sendWhatsAppNotification(order) {
    try {
        if (fs.existsSync(path.join(DATA_DIR, 'whatsapp-config.json'))) {
            const config = JSON.parse(
                fs.readFileSync(path.join(DATA_DIR, 'whatsapp-config.json'), 'utf8')
            );
            
            if (config.isActive && config.numbers.length > 0) {
                const message = `
🔔 أوردر جديد:
⏰ ${order.referenceNumber}     ${new Date(order.date).toLocaleDateString()} ${new Date(order.date).toLocaleTimeString()}
📱 رقم الموبايل: ${order.mobileNumber}
💰 المبلغ المدفوع: ${order.amount} جنيه
💰 الرسوم: ${order.fee} جنيه
💰 المبلغ المطلوب تحويله: ${order.finalAmount} جنيه
`;
                
                console.log(`إرسال إشعار واتساب لـ ${config.numbers.length} أرقام:`);
                console.log(message);
            }
        }
    } catch (error) {
        console.error('خطأ في إرسال إشعار الواتساب:', error);
    }
}

// بدء نظام تتبع الأوردرات
startOrderTracking();

// تشغيل السيرفر
const PORT = process.env.SERVER_PORT || 3001;
app.listen(PORT, () => {
    console.log(`السيرفر يعمل على المنفذ ${PORT}`);
    console.log(`مجلد البيانات: ${DATA_DIR}`);
    console.log('---------------------------------------------');
    console.log('تم تشغيل نظام تتبع الأوردرات - Voo Payment');
    console.log('---------------------------------------------');
}); 
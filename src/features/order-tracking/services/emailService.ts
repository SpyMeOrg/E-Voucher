import { EventEmitter } from 'events';
import * as Imap from 'node-imap';

interface EmailConfig {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
}

class EmailService extends EventEmitter {
  private imap: Imap | null = null;
  private config: EmailConfig = {
    user: '',
    password: '',
    host: '',
    port: 993,
    tls: true
  };
  private isConnected = false;
  private checkInterval: NodeJS.Timeout | null = null;
  private checkIntervalMs = 60000; // فحص كل دقيقة

  constructor() {
    super();
  }

  // تكوين الخدمة
  configure(config: EmailConfig, checkIntervalMs = 60000) {
    this.config = config;
    this.checkIntervalMs = checkIntervalMs;
    return this;
  }

  // الاتصال بخادم البريد
  connect() {
    if (this.isConnected) return Promise.resolve(true);

    return new Promise((resolve, reject) => {
      try {
        this.imap = new Imap({
          user: this.config.user,
          password: this.config.password,
          host: this.config.host,
          port: this.config.port,
          tls: this.config.tls,
          tlsOptions: { rejectUnauthorized: false }
        });

        this.imap.once('ready', () => {
          this.isConnected = true;
          this.emit('connected');
          resolve(true);
        });

        this.imap.once('error', (err: Error) => {
          this.emit('error', err);
          reject(err);
        });

        this.imap.once('end', () => {
          this.isConnected = false;
          this.emit('disconnected');
        });

        this.imap.connect();
      } catch (error) {
        reject(error);
      }
    });
  }

  // قطع الاتصال
  disconnect() {
    if (this.imap && this.isConnected) {
      this.imap.end();
      this.isConnected = false;
    }

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  // بدء مراقبة البريد الوارد
  startMonitoring() {
    if (!this.isConnected) {
      return this.connect().then(() => this._startInterval());
    } else {
      return this._startInterval();
    }
  }

  // إيقاف مراقبة البريد
  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  // التحقق من وجود رسائل جديدة من المرسل المحدد
  private _startInterval() {
    this.checkInterval = setInterval(() => {
      this.checkEmails('no-reply@voopayment.com');
    }, this.checkIntervalMs);

    // تحقق فوري أول مرة
    this.checkEmails('no-reply@voopayment.com');
    return Promise.resolve(true);
  }

  // فحص البريد الوارد
  private checkEmails(fromEmail: string) {
    if (!this.imap || !this.isConnected) return;

    this.imap.openBox('INBOX', false, (err, box) => {
      if (err) {
        this.emit('error', err);
        return;
      }

      // البحث عن الرسائل من المرسل المحدد والتي لم تتم قراءتها
      const searchCriteria = [
        ['FROM', fromEmail],
        'UNSEEN'
      ];

      this.imap!.search(searchCriteria, (err, results) => {
        if (err) {
          this.emit('error', err);
          return;
        }

        if (results.length === 0) return;

        this.emit('new-emails', results.length);

        // جلب الرسائل
        const fetch = this.imap!.fetch(results, {
          bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)', 'TEXT'],
          struct: true
        });

        fetch.on('message', (msg, seqno) => {
          const email: any = { seqno, attachments: [] };

          msg.on('body', (stream, info) => {
            let buffer = '';
            stream.on('data', (chunk) => {
              buffer += chunk.toString('utf8');
            });

            stream.on('end', () => {
              if (info.which.includes('HEADER')) {
                email.headers = Imap.parseHeader(buffer);
              } else {
                email.body = buffer;
              }
            });
          });

          msg.once('attributes', (attrs) => {
            email.attributes = attrs;
          });

          msg.once('end', () => {
            this.emit('email', email);
            // البحث عن المرفقات (سيتم تنفيذه لاحقاً)
            this.fetchAttachments(email);
          });
        });

        fetch.once('error', (err) => {
          this.emit('error', err);
        });
      });
    });
  }

  // استخراج المرفقات
  private fetchAttachments(email: any) {
    // محاكاة العثور على مرفق Excel (سيتم تنفيذه لاحقاً)
    setTimeout(() => {
      this.emit('attachment', {
        emailId: email.seqno,
        filename: 'orders.xlsx',
        data: Buffer.from('محاكاة بيانات Excel')
      });
    }, 1000);
  }
}

export const emailService = new EmailService(); 
import { ServerConfig, ServerStatus } from '../types/server';
import { NodeSSH } from 'node-ssh';

class ServerService {
  private config: ServerConfig = {
    ip: '',
    pemKey: '',
    isConnected: false,
    isInstalled: false
  };

  private status: ServerStatus = {
    status: 'disconnected'
  };

  private ssh: NodeSSH = new NodeSSH();

  async connect(ip: string, pemKey: string): Promise<ServerStatus> {
    try {
      this.status.status = 'connecting';
      
      // الاتصال بالسيرفر
      await this.ssh.connect({
        host: ip,
        username: 'ubuntu',
        privateKey: pemKey,
        port: 22,
        tryKeyboard: true,
        readyTimeout: 20000
      });

      // التحقق من الاتصال
      const result = await this.ssh.execCommand('echo "Connection successful"');
      
      if (result.code === 0) {
        this.config.ip = ip;
        this.config.pemKey = pemKey;
        this.config.isConnected = true;
        this.status.status = 'connected';
        this.status.message = 'تم الاتصال بالسيرفر بنجاح';
      } else {
        throw new Error('فشل الاتصال بالسيرفر');
      }

      return this.status;
    } catch (error: any) {
      this.status.status = 'error';
      this.status.message = error?.message || 'حدث خطأ غير معروف';
      return this.status;
    }
  }

  async installDependencies(): Promise<ServerStatus> {
    try {
      this.status.status = 'installing';
      
      // تحديث النظام
      await this.ssh.execCommand('sudo apt-get update');
      
      // تثبيت Node.js
      await this.ssh.execCommand('curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -');
      await this.ssh.execCommand('sudo apt-get install -y nodejs');
      
      // تثبيت المكتبات المطلوبة
      await this.ssh.execCommand('npm install -g pm2');
      await this.ssh.execCommand('npm install node-imap xlsx whatsapp-web.js');
      
      this.config.isInstalled = true;
      this.status.status = 'installed';
      this.status.message = 'تم تثبيت المكتبات بنجاح';
      
      return this.status;
    } catch (error: any) {
      this.status.status = 'error';
      this.status.message = error?.message || 'حدث خطأ غير معروف';
      return this.status;
    }
  }

  async disconnect(): Promise<void> {
    if (this.ssh.isConnected()) {
      this.ssh.dispose();
      this.config.isConnected = false;
      this.status.status = 'disconnected';
    }
  }

  getStatus(): ServerStatus {
    return this.status;
  }

  getConfig(): ServerConfig {
    return this.config;
  }
}

export const serverService = new ServerService(); 
import { ServerConfig, ServerStatus } from '../types/server';

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

  async connect(ip: string, pemKey: string): Promise<ServerStatus> {
    try {
      this.status.status = 'connecting';
      // هنا سيتم إضافة كود الاتصال بالسيرفر باستخدام SSH
      this.config.ip = ip;
      this.config.pemKey = pemKey;
      this.config.isConnected = true;
      this.status.status = 'connected';
      return this.status;
    } catch (error) {
      this.status.status = 'error';
      this.status.message = error.message;
      return this.status;
    }
  }

  async installDependencies(): Promise<ServerStatus> {
    try {
      this.status.status = 'installing';
      // هنا سيتم إضافة أوامر تثبيت المكتبات المطلوبة
      this.config.isInstalled = true;
      this.status.status = 'installed';
      return this.status;
    } catch (error) {
      this.status.status = 'error';
      this.status.message = error.message;
      return this.status;
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
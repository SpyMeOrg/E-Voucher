import { WhatsAppConfig } from '../types/server';

class WhatsAppService {
  private config: WhatsAppConfig = {
    numbers: [],
    isActive: false
  };

  setNumbers(numbers: string[]) {
    this.config.numbers = numbers;
  }

  async sendMessage(message: string) {
    if (!this.config.isActive) return;

    // هنا سيتم إضافة كود إرسال الرسائل للواتساب
    for (const number of this.config.numbers) {
      try {
        // إرسال الرسالة للرقم
        console.log(`Sending message to ${number}: ${message}`);
      } catch (error) {
        console.error(`Error sending message to ${number}:`, error);
      }
    }
  }

  getConfig(): WhatsAppConfig {
    return this.config;
  }

  setActive(active: boolean) {
    this.config.isActive = active;
  }
}

export const whatsappService = new WhatsAppService(); 
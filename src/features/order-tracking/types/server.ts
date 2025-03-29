export interface ServerConfig {
  ip: string;
  pemKey: string;
  isConnected: boolean;
  isInstalled: boolean;
}

export interface WhatsAppConfig {
  numbers: string[];
  isActive: boolean;
}

export interface ServerStatus {
  status: 'disconnected' | 'connecting' | 'connected' | 'installing' | 'installed' | 'error';
  message?: string;
  lastCheck?: Date;
} 
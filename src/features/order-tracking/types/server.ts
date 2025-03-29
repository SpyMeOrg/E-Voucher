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
  status: 'connected' | 'disconnected' | 'error' | 'connecting' | 'installing' | 'installed';
  message?: string;
} 
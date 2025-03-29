import { ServerStatus } from '../types/server';

const API_URL = 'http://localhost:3001';

class ServerService {
  async connect(ip: string, pemKey: string): Promise<ServerStatus> {
    try {
      const response = await fetch(`${API_URL}/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ip, pemKey }),
      });
      return await response.json();
    } catch (error: any) {
      return { status: 'error', message: error.message };
    }
  }

  async installDependencies(): Promise<ServerStatus> {
    try {
      const response = await fetch(`${API_URL}/install`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return await response.json();
    } catch (error: any) {
      return { status: 'error', message: error.message };
    }
  }

  async disconnect(): Promise<ServerStatus> {
    try {
      const response = await fetch(`${API_URL}/disconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return await response.json();
    } catch (error: any) {
      return { status: 'error', message: error.message };
    }
  }
}

export const serverService = new ServerService(); 
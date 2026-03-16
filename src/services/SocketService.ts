import {io, Socket} from 'socket.io-client';
import {BASE_URL, getToken} from './api';

class SocketService {
  private socket: Socket | null = null;

  async connect() {
    if (this.socket?.connected) return;

    const token = await getToken();
    if (!token) return;

    this.socket = io(BASE_URL || '', {
      auth: {token},
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
    });

    this.socket.on('connect', () => {
      console.log('✅ Socket connected to server');
    });

    this.socket.on('connect_error', error => {
      console.error('❌ Socket connection error:', error);
    });

    this.socket.on('disconnect', reason => {
      console.log('🔌 Socket disconnected:', reason);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket() {
    return this.socket;
  }

  emit(event: string, data: any) {
    this.socket?.emit(event, data);
  }

  on(event: string, callback: (data: any) => void) {
    this.socket?.on(event, callback);
  }

  off(event: string) {
    this.socket?.off(event);
  }
}

export default new SocketService();

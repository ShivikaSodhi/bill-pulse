import type { Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (typeof window === 'undefined') {
    throw new Error('getSocket() must only be called in the browser');
  }
  if (!socket) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { io } = require('socket.io-client');
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001', {
      autoConnect: false,
    });
  }
  return socket!;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

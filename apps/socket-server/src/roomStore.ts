import { Room } from './types';

const rooms = new Map<string, Room>();

export function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateCode() : code;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

export function createRoom(hostId: string, hostName: string, title: string): Room {
  const code = generateCode();
  const room: Room = {
    code,
    hostId,
    hostName,
    title,
    polls: [],
    questions: [],
    participants: 0,
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

export function deleteRoom(code: string): void {
  rooms.delete(code);
}

export { rooms };

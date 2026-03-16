import { v4 as uuidv4 } from 'uuid';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { Room } from './types';

const ROOMS_FILE = join(__dirname, '..', '.rooms.json');

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
    hostKey: uuidv4(),
    hostName,
    title,
    polls: [],
    questions: [],
    participants: 0,
    participantList: [],
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

export function deleteRoom(code: string): void {
  rooms.delete(code);
}

export { rooms };

// ── Persistence ──────────────────────────────────────────────────────────────

function saveRooms() {
  try {
    const data = Array.from(rooms.values()).map(room => ({
      ...room,
      questions: room.questions.map(q => ({ ...q, upvotedBy: Array.from(q.upvotedBy) })),
    }));
    writeFileSync(ROOMS_FILE, JSON.stringify(data));
  } catch { /* non-fatal */ }
}

function loadRooms() {
  if (!existsSync(ROOMS_FILE)) return;
  try {
    const data: any[] = JSON.parse(readFileSync(ROOMS_FILE, 'utf-8'));
    for (const r of data) {
      rooms.set(r.code, {
        ...r,
        questions: r.questions.map((q: any) => ({ ...q, upvotedBy: new Set<string>(q.upvotedBy) })),
      });
    }
    console.log(`Restored ${data.length} room(s) from disk`);
  } catch { /* corrupt file, start fresh */ }
}

loadRooms();

// Save every 2 seconds while rooms exist
setInterval(() => { if (rooms.size > 0) saveRooms(); }, 2000);

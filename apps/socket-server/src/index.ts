import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import cors from 'cors';
import { createRoom, getRoom } from './roomStore';
import { Poll, Question, TextResponse } from './types';

const allowedOrigins = [
  'http://localhost:3000',
  ...(process.env.WEB_URL ? [process.env.WEB_URL] : []),
];

const app = express();
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/room/:code', (req, res) => {
  const room = getRoom(req.params.code);
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }
  const serialized = {
    ...room,
    questions: room.questions.map(q => ({ ...q, upvotedBy: Array.from(q.upvotedBy) })),
  };
  res.json(serialized);
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('create-room', ({ hostName, title }: { hostName: string; title: string }) => {
    const room = createRoom(socket.id, hostName, title);
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.isHost = true;
    socket.data.name = hostName;
    room.participants++;
    socket.emit('room-created', { code: room.code, room: serializeRoom(room) });
  });

  socket.on('join-room', ({ code, name }: { code: string; name: string }) => {
    const room = getRoom(code);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.isHost = room.hostId === socket.id;
    socket.data.name = name;
    room.participants++;
    socket.emit('room-joined', { room: serializeRoom(room) });
    io.to(room.code).emit('participant-count', { count: room.participants });
  });

  socket.on('create-poll', ({
    question,
    type,
    options,
    imageBase64,
    duration,
  }: {
    question: string;
    type: 'multiple-choice' | 'open-text';
    options: string[];
    imageBase64?: string;
    duration: number;
  }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room || room.hostId !== socket.id) return;

    room.polls.forEach(p => { p.isActive = false; });

    const now = Date.now();
    const poll: Poll = {
      id: uuidv4(),
      question,
      type,
      options: type === 'multiple-choice' ? options.map(text => ({ id: uuidv4(), text, votes: 0 })) : [],
      textResponses: [],
      imageBase64,
      isActive: true,
      responsesPublished: false,
      duration,
      endsAt: duration > 0 ? now + duration * 1000 : undefined,
      createdAt: now,
    };
    room.polls.push(poll);
    io.to(room.code).emit('poll-created', { poll });

    if (duration > 0) {
      setTimeout(() => {
        const r = getRoom(room.code);
        const p = r?.polls.find(p => p.id === poll.id);
        if (p && p.isActive) {
          p.isActive = false;
          io.to(room.code).emit('poll-closed', { pollId: poll.id });
        }
      }, duration * 1000);
    }
  });

  socket.on('publish-responses', ({ pollId }: { pollId: string }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room || room.hostId !== socket.id) return;
    const poll = room.polls.find(p => p.id === pollId);
    if (!poll || poll.type !== 'open-text') return;
    poll.responsesPublished = true;
    io.to(room.code).emit('responses-published', { pollId, textResponses: poll.textResponses });
  });

  socket.on('vote', ({ pollId, optionId }: { pollId: string; optionId: string }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;

    const poll = room.polls.find(p => p.id === pollId);
    if (!poll || !poll.isActive) return;

    const voteKey = `${socket.id}:${pollId}`;
    if (!socket.data.votes) socket.data.votes = new Set<string>();
    if (socket.data.votes.has(voteKey)) return;
    socket.data.votes.add(voteKey);

    const option = poll.options.find(o => o.id === optionId);
    if (!option) return;
    option.votes++;

    io.to(room.code).emit('vote-update', { pollId, options: poll.options });
  });

  socket.on('submit-text-response', ({ pollId, text }: { pollId: string; text: string }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;

    const poll = room.polls.find(p => p.id === pollId);
    if (!poll || !poll.isActive || poll.type !== 'open-text') return;

    // One response per participant per poll
    const responseKey = `text:${socket.id}:${pollId}`;
    if (!socket.data.votes) socket.data.votes = new Set<string>();
    if (socket.data.votes.has(responseKey)) return;
    socket.data.votes.add(responseKey);

    const response: TextResponse = {
      id: uuidv4(),
      text: text.trim(),
      author: socket.data.name || 'Anonymous',
      createdAt: Date.now(),
    };
    poll.textResponses.push(response);
    io.to(room.code).emit('text-response-added', { pollId, response });
  });

  socket.on('close-poll', ({ pollId }: { pollId: string }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room || room.hostId !== socket.id) return;
    const poll = room.polls.find(p => p.id === pollId);
    if (poll) {
      poll.isActive = false;
      io.to(room.code).emit('poll-closed', { pollId });
    }
  });

  socket.on('submit-question', ({ text }: { text: string }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;

    const question: Question = {
      id: uuidv4(),
      text,
      author: socket.data.name || 'Anonymous',
      upvotes: 0,
      upvotedBy: new Set(),
      createdAt: Date.now(),
    };
    room.questions.push(question);

    io.to(room.code).emit('question-added', {
      question: { ...question, upvotedBy: [] },
    });
  });

  socket.on('upvote-question', ({ questionId }: { questionId: string }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;

    const question = room.questions.find(q => q.id === questionId);
    if (!question) return;

    if (question.upvotedBy.has(socket.id)) {
      question.upvotedBy.delete(socket.id);
      question.upvotes--;
    } else {
      question.upvotedBy.add(socket.id);
      question.upvotes++;
    }

    io.to(room.code).emit('question-upvoted', {
      questionId,
      upvotes: question.upvotes,
    });
  });

  socket.on('archive-question', ({ questionId }: { questionId: string }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room || room.hostId !== socket.id) return;
    room.questions = room.questions.filter(q => q.id !== questionId);
    io.to(room.code).emit('question-archived', { questionId });
  });

  socket.on('disconnect', () => {
    const room = getRoom(socket.data.roomCode);
    if (room) {
      room.participants = Math.max(0, room.participants - 1);
      io.to(room.code).emit('participant-count', { count: room.participants });
    }
  });
});

function serializeRoom(room: ReturnType<typeof getRoom>) {
  if (!room) return null;
  return {
    ...room,
    questions: room.questions.map(q => ({ ...q, upvotedBy: Array.from(q.upvotedBy) })),
  };
}

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Socket server running on port ${PORT}`);
});

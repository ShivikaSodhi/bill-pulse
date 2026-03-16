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
  res.json(serializeRoom(room));
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('create-room', ({ hostName, title }: { hostName: string; title: string }) => {
    const room = createRoom(socket.id, hostName, title);
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.isHost = true;
    socket.data.name = hostName;
    socket.emit('room-created', { code: room.code, hostKey: room.hostKey, room: serializeRoom(room) });
  });

  socket.on('join-room', ({ code, name, hostKey }: { code: string; name: string; hostKey?: string }) => {
    const room = getRoom(code);
    if (!room) {
      socket.emit('join-error', { message: 'Room not found' });
      return;
    }
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.name = name;

    const isHost = hostKey ? hostKey === room.hostKey : room.hostId === socket.id;
    socket.data.isHost = isHost;
    if (isHost) room.hostId = socket.id;

    if (!isHost) {
      const alreadyJoined = room.participantList.some(p => p.id === socket.id);
      if (!alreadyJoined) {
        room.participants++;
        room.participantList.push({ id: socket.id, name });
      }
    }

    socket.emit('room-joined', { room: serializeRoom(room) });
    io.to(room.code).emit('participants-updated', { count: room.participants, list: room.participantList });
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
    if (!room || !socket.data.isHost) return;

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
      isRevealed: false,
      responsesPublished: false,
      duration,
      endsAt: undefined,
      createdAt: now,
    };
    room.polls.push(poll);
    io.to(room.code).emit('poll-created', { poll });
  });

  socket.on('reveal-poll', ({ pollId }: { pollId: string }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room || !socket.data.isHost) return;
    const poll = room.polls.find(p => p.id === pollId);
    if (!poll || poll.isRevealed) return;
    poll.isRevealed = true;
    io.to(room.code).emit('poll-revealed', { pollId });

    if (poll.duration > 0 && !poll.endsAt) {
      poll.endsAt = Date.now() + poll.duration * 1000;
      io.to(room.code).emit('timer-started', { pollId, endsAt: poll.endsAt });
      setTimeout(() => {
        const r = getRoom(room.code);
        const p = r?.polls.find(p => p.id === pollId);
        if (p && p.isActive) {
          p.isActive = false;
          io.to(room.code).emit('poll-closed', { pollId });
        }
      }, poll.duration * 1000);
    }
  });

  socket.on('start-timer', ({ pollId }: { pollId: string }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room || !socket.data.isHost) return;
    const poll = room.polls.find(p => p.id === pollId);
    if (!poll || !poll.isActive || poll.duration === 0 || poll.endsAt) return;
    poll.endsAt = Date.now() + poll.duration * 1000;
    io.to(room.code).emit('timer-started', { pollId, endsAt: poll.endsAt });
    setTimeout(() => {
      const r = getRoom(room.code);
      const p = r?.polls.find(p => p.id === pollId);
      if (p && p.isActive) {
        p.isActive = false;
        io.to(room.code).emit('poll-closed', { pollId });
      }
    }, poll.duration * 1000);
  });

  socket.on('publish-responses', ({ pollId }: { pollId: string }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room || !socket.data.isHost) return;
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
    if (!room || !socket.data.isHost) return;
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
    if (!room || !socket.data.isHost) return;
    room.questions = room.questions.filter(q => q.id !== questionId);
    io.to(room.code).emit('question-archived', { questionId });
  });

  socket.on('disconnect', () => {
    const room = getRoom(socket.data.roomCode);
    if (room && !socket.data.isHost) {
      room.participants = Math.max(0, room.participants - 1);
      room.participantList = room.participantList.filter(p => p.id !== socket.id);
      io.to(room.code).emit('participants-updated', { count: room.participants, list: room.participantList });
    }
  });
});

function serializeRoom(room: ReturnType<typeof getRoom>) {
  if (!room) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hostKey, ...rest } = room;
  return {
    ...rest,
    questions: room.questions.map(q => ({ ...q, upvotedBy: Array.from(q.upvotedBy) })),
  };
}

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Socket server running on port ${PORT}`);
});

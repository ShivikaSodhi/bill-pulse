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
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/room/:code', (req, res) => {
  const room = getRoom(req.params.code);
  if (!room) { res.status(404).json({ error: 'Room not found' }); return; }
  res.json(serializeRoom(room));
});

// ── Fuzzy matching helpers ──────────────────────────────────────────────────

function normText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function fuzzyScore(ref: string, candidate: string): number {
  const a = normText(ref);
  const b = normText(candidate);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  // Word-level Jaccard
  const wordsA = a.split(' ').filter(w => w.length > 1);
  const wordsB = b.split(' ').filter(w => w.length > 1);
  if (wordsA.length > 0 && wordsB.length > 0) {
    const setA = new Set(wordsA);
    const setB = new Set(wordsB);
    const intersection = [...setA].filter(w => setB.has(w)).length;
    const union = new Set([...setA, ...setB]).size;
    const jaccard = intersection / union;
    if (jaccard >= 0.5) return 0.6 + jaccard * 0.3;
  }
  // Character edit-distance ratio
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

// Strip internal socketId before sending to clients
function stripResponse(r: TextResponse): Omit<TextResponse, 'socketId'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { socketId, ...safe } = r;
  return safe;
}

// ── Socket handlers ─────────────────────────────────────────────────────────

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
    if (!room) { socket.emit('join-error', { message: 'Room not found' }); return; }
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
    question, type, options, imageBase64, duration, correctOptionIndex, correctAnswer,
  }: {
    question: string;
    type: 'multiple-choice' | 'open-text';
    options: string[];
    imageBase64?: string;
    duration: number;
    correctOptionIndex?: number;
    correctAnswer?: string;
  }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room || !socket.data.isHost) return;

    room.polls.forEach(p => { p.isActive = false; });

    const pollOptions = type === 'multiple-choice'
      ? options.map(text => ({ id: uuidv4(), text, votes: 0 }))
      : [];

    const poll: Poll = {
      id: uuidv4(),
      question,
      type,
      options: pollOptions,
      textResponses: [],
      imageBase64,
      isActive: true,
      isRevealed: false,
      responsesPublished: false,
      duration,
      endsAt: undefined,
      revealedAt: undefined,
      createdAt: Date.now(),
      correctOptionId: correctOptionIndex != null ? pollOptions[correctOptionIndex]?.id : undefined,
      correctAnswer: type === 'open-text' ? correctAnswer?.trim() || undefined : undefined,
      scoredResponseIds: [],
      userVotes: {},
      userVoteTimes: {},
    };
    room.polls.push(poll);

    // Participants: no image, no correct answer, no vote data
    io.to(room.code).emit('poll-created', {
      poll: { ...poll, correctOptionId: undefined, correctAnswer: undefined, userVotes: undefined, userVoteTimes: undefined, imageBase64: undefined },
    });
    // Host only: image + correct answer metadata
    socket.emit('poll-host-metadata', {
      pollId: poll.id,
      correctOptionId: poll.correctOptionId,
      correctAnswer: poll.correctAnswer,
      imageBase64: poll.imageBase64,
    });
  });

  socket.on('reveal-poll', ({ pollId }: { pollId: string }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room || !socket.data.isHost) return;
    const poll = room.polls.find(p => p.id === pollId);
    if (!poll || poll.isRevealed) return;
    poll.isRevealed = true;
    poll.revealedAt = Date.now();
    io.to(room.code).emit('poll-revealed', { pollId, revealedAt: poll.revealedAt, imageBase64: poll.imageBase64 });

    if (poll.duration > 0 && !poll.endsAt) {
      poll.endsAt = Date.now() + poll.duration * 1000;
      io.to(room.code).emit('timer-started', { pollId, endsAt: poll.endsAt });
      setTimeout(() => {
        const r = getRoom(room.code);
        const p = r?.polls.find(p => p.id === pollId);
        if (p && p.isActive) {
          p.isActive = false;
          awardScores(r!, p);
          awardTextScores(r!, p);
          io.to(room.code).emit('poll-closed', {
            pollId,
            correctOptionId: p.correctOptionId,
            scoredResponseIds: p.scoredResponseIds,
          });
          if (p.correctOptionId || p.scoredResponseIds.length > 0) {
            io.to(room.code).emit('leaderboard-updated', { leaderboard: r!.leaderboard });
          }
          io.to(r!.hostId).emit('poll-voter-details', { pollId, voterDetails: getVoterDetails(r!, p) });
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
        awardScores(r!, p);
        awardTextScores(r!, p);
        io.to(room.code).emit('poll-closed', {
          pollId,
          correctOptionId: p.correctOptionId,
          scoredResponseIds: p.scoredResponseIds,
        });
        if (p.correctOptionId || p.scoredResponseIds.length > 0) {
          io.to(room.code).emit('leaderboard-updated', { leaderboard: r!.leaderboard });
        }
        io.to(r!.hostId).emit('poll-voter-details', { pollId, voterDetails: getVoterDetails(r!, p) });
      }
    }, poll.duration * 1000);
  });

  socket.on('publish-responses', ({ pollId }: { pollId: string }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room || !socket.data.isHost) return;
    const poll = room.polls.find(p => p.id === pollId);
    // Only allow publishing after the poll is closed
    if (!poll || poll.type !== 'open-text' || poll.isActive) return;
    poll.responsesPublished = true;
    const sorted = [...poll.textResponses]
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(stripResponse);
    io.to(room.code).emit('responses-published', { pollId, textResponses: sorted, scoredResponseIds: poll.scoredResponseIds });
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
    poll.userVotes[socket.id] = optionId;
    if (poll.revealedAt != null) {
      poll.userVoteTimes[socket.id] = Date.now() - poll.revealedAt;
    }
    io.to(room.code).emit('vote-update', { pollId, options: poll.options });
  });

  socket.on('submit-text-response', ({ pollId, text }: { pollId: string; text: string }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    const poll = room.polls.find(p => p.id === pollId);
    if (!poll || !poll.isActive || poll.type !== 'open-text') return;

    const responseKey = `text:${socket.id}:${pollId}`;
    if (!socket.data.votes) socket.data.votes = new Set<string>();
    if (socket.data.votes.has(responseKey)) return;
    socket.data.votes.add(responseKey);

    const response: TextResponse = {
      id: uuidv4(),
      text: text.trim(),
      author: socket.data.name || 'Anonymous',
      socketId: socket.id,
      createdAt: Date.now(),
    };
    poll.textResponses.push(response);

    // Tell everyone a response was added (without socketId)
    io.to(room.code).emit('text-response-added', { pollId, response: stripResponse(response) });
    // Tell the submitter their response ID (so they can track if it scores later)
    socket.emit('text-response-submitted', { pollId, responseId: response.id });
  });

  socket.on('close-poll', ({ pollId }: { pollId: string }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room || !socket.data.isHost) return;
    const poll = room.polls.find(p => p.id === pollId);
    if (poll) {
      poll.isActive = false;
      awardScores(room, poll);
      awardTextScores(room, poll);
      io.to(room.code).emit('poll-closed', {
        pollId,
        correctOptionId: poll.correctOptionId,
        scoredResponseIds: poll.scoredResponseIds,
      });
      if (poll.correctOptionId || poll.scoredResponseIds.length > 0) {
        io.to(room.code).emit('leaderboard-updated', { leaderboard: room.leaderboard });
      }
      socket.emit('poll-voter-details', { pollId, voterDetails: getVoterDetails(room, poll) });
    }
  });

  socket.on('delete-poll', ({ pollId }: { pollId: string }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room || !socket.data.isHost) return;
    room.polls = room.polls.filter(p => p.id !== pollId);
    io.to(room.code).emit('poll-deleted', { pollId });
  });

  socket.on('unpublish-poll', ({ pollId }: { pollId: string }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room || !socket.data.isHost) return;
    const poll = room.polls.find(p => p.id === pollId);
    if (!poll || poll.isActive) return;
    reverseScores(room, poll);
    reverseTextScores(room, poll);
    room.polls = room.polls.filter(p => p.id !== pollId);
    io.to(room.code).emit('poll-deleted', { pollId });
    io.to(room.code).emit('leaderboard-updated', { leaderboard: room.leaderboard });
  });

  socket.on('update-poll', ({ pollId, question }: { pollId: string; question: string }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room || !socket.data.isHost) return;
    const poll = room.polls.find(p => p.id === pollId);
    if (!poll) return;
    poll.question = question.trim();
    io.to(room.code).emit('poll-updated', { pollId, question: poll.question });
  });

  socket.on('submit-question', ({ text }: { text: string }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    const question: Question = {
      id: uuidv4(), text, author: socket.data.name || 'Anonymous',
      upvotes: 0, upvotedBy: new Set(), createdAt: Date.now(),
    };
    room.questions.push(question);
    io.to(room.code).emit('question-added', { question: { ...question, upvotedBy: [] } });
  });

  socket.on('upvote-question', ({ questionId }: { questionId: string }) => {
    const room = getRoom(socket.data.roomCode);
    if (!room) return;
    const question = room.questions.find(q => q.id === questionId);
    if (!question) return;
    if (question.upvotedBy.has(socket.id)) {
      question.upvotedBy.delete(socket.id); question.upvotes--;
    } else {
      question.upvotedBy.add(socket.id); question.upvotes++;
    }
    io.to(room.code).emit('question-upvoted', { questionId, upvotes: question.upvotes });
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

// ── Score helpers ────────────────────────────────────────────────────────────

function getVoterDetails(room: ReturnType<typeof getRoom>, poll: Poll) {
  if (!room) return [];
  return Object.entries(poll.userVotes)
    .map(([socketId, optionId]) => {
      const participant = room.participantList.find(p => p.id === socketId);
      const option = poll.options.find(o => o.id === optionId);
      return {
        name: participant?.name ?? 'Anonymous',
        optionId,
        optionText: option?.text ?? '?',
        responseTime: poll.userVoteTimes[socketId],
      };
    })
    .sort((a, b) => (a.responseTime ?? Infinity) - (b.responseTime ?? Infinity));
}

function awardScores(room: ReturnType<typeof getRoom>, poll: Poll) {
  if (!room || !poll.correctOptionId) return;
  for (const [socketId, optionId] of Object.entries(poll.userVotes)) {
    if (optionId !== poll.correctOptionId) continue;
    const participant = room.participantList.find(p => p.id === socketId);
    if (!participant) continue;
    const entry = room.leaderboard.find(e => e.id === socketId);
    if (entry) { entry.score += 1000; }
    else { room.leaderboard.push({ id: socketId, name: participant.name, score: 1000 }); }
  }
}

function reverseScores(room: ReturnType<typeof getRoom>, poll: Poll) {
  if (!room || !poll.correctOptionId) return;
  for (const [socketId, optionId] of Object.entries(poll.userVotes)) {
    if (optionId !== poll.correctOptionId) continue;
    const idx = room.leaderboard.findIndex(e => e.id === socketId);
    if (idx === -1) continue;
    room.leaderboard[idx].score -= 1000;
    if (room.leaderboard[idx].score <= 0) room.leaderboard.splice(idx, 1);
  }
}

function awardTextScores(room: ReturnType<typeof getRoom>, poll: Poll) {
  if (!room || !poll.correctAnswer || poll.type !== 'open-text') return;
  if (poll.textResponses.length === 0) return;

  // Score each response against the reference answer
  const scored = poll.textResponses.map(r => ({
    response: r,
    sim: fuzzyScore(poll.correctAnswer!, r.text),
  }));

  const maxSim = Math.max(...scored.map(s => s.sim));
  if (maxSim < 0.4) return; // nobody close enough

  // Award the best match(es): within 90% of the top score, and above 0.4
  const threshold = Math.max(maxSim * 0.9, 0.4);
  const winners = scored.filter(s => s.sim >= threshold);

  for (const { response } of winners) {
    if (poll.scoredResponseIds.includes(response.id)) continue;
    poll.scoredResponseIds.push(response.id);
    const entry = room.leaderboard.find(e => e.id === response.socketId);
    if (entry) {
      entry.score += 1000;
    } else {
      const participant = room.participantList.find(p => p.id === response.socketId);
      room.leaderboard.push({
        id: response.socketId,
        name: participant?.name ?? response.author,
        score: 1000,
      });
    }
  }
}

function reverseTextScores(room: ReturnType<typeof getRoom>, poll: Poll) {
  if (!room || poll.type !== 'open-text') return;
  for (const responseId of poll.scoredResponseIds) {
    const response = poll.textResponses.find(r => r.id === responseId);
    if (!response?.socketId) continue;
    const idx = room.leaderboard.findIndex(e => e.id === response.socketId);
    if (idx === -1) continue;
    room.leaderboard[idx].score -= 1000;
    if (room.leaderboard[idx].score <= 0) room.leaderboard.splice(idx, 1);
  }
}

// ── Serialization ────────────────────────────────────────────────────────────

function serializeRoom(room: ReturnType<typeof getRoom>) {
  if (!room) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hostKey, ...rest } = room;
  return {
    ...rest,
    polls: room.polls.map(p => ({
      ...p,
      userVotes: undefined,
      userVoteTimes: undefined,
      correctAnswer: undefined,          // never expose to clients via room snapshot
      correctOptionId: p.isActive ? undefined : p.correctOptionId,
      imageBase64: p.isRevealed ? p.imageBase64 : undefined,
      textResponses: p.textResponses.map(stripResponse),
    })),
    questions: room.questions.map(q => ({ ...q, upvotedBy: Array.from(q.upvotedBy) })),
  };
}

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Socket server running on port ${PORT}`);
});

'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getSocket } from '@/lib/socket';
import { PollResults, TextResponse } from '@/components/PollResults';
import { QuestionList, Question } from '@/components/QuestionList';

interface PollOption {
  id: string;
  text: string;
  votes: number;
}

interface Poll {
  id: string;
  question: string;
  type: 'multiple-choice' | 'open-text';
  options: PollOption[];
  textResponses: TextResponse[];
  imageBase64?: string;
  isActive: boolean;
  isRevealed: boolean;
  responsesPublished: boolean;
  endsAt?: number;
  revealedAt?: number;
  correctOptionId?: string;
}

interface Room {
  code: string;
  title: string;
  hostName: string;
  participants: number;
  polls: Poll[];
  questions: Question[];
}

export default function ParticipantRoom() {
  const { code } = useParams<{ code: string }>();
  const [room, setRoom] = useState<Room | null>(null);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [participants, setParticipants] = useState(0);
  const [tab, setTab] = useState<'polls' | 'qa'>('polls');
  const [qText, setQText] = useState('');
  const [myVotes, setMyVotes] = useState<Record<string, string>>({});
  const [myTextResponses, setMyTextResponses] = useState<Record<string, string>>({});
  const [myTextResponseIds, setMyTextResponseIds] = useState<Record<string, string>>({});
  const [scoredResponseIds, setScoredResponseIds] = useState<Record<string, string[]>>({});
  const [socketId, setSocketId] = useState<string>('');
  const [error, setError] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [joining, setJoining] = useState(false);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [leaderboard, setLeaderboard] = useState<{ id: string; name: string; score: number }[]>([]);

  useEffect(() => {
    const socket = getSocket();

    // Rejoin on every (re)connect so server always has this socket in the room
    const savedName = localStorage.getItem(`name:${code}`);
    const rejoin = () => {
      setSocketId(socket.id || '');
      if (savedName) {
        socket.emit('join-room', { code, name: savedName });
      }
    };

    socket.on('connect', rejoin);

    socket.on('room-joined', ({ room }: { room: Room }) => {
      setJoining(false);
      setRoom(room);
      setPolls(room.polls);
      setQuestions(room.questions);
      setParticipants(room.participants);
    });

    socket.on('join-error', ({ message }: { message: string }) => {
      setJoining(false);
      setError(message);
      setShowJoinForm(true);
    });

    socket.on('poll-created', ({ poll }: { poll: Poll }) => {
      setPolls(prev => [...prev, { ...poll, textResponses: poll.textResponses ?? [] }]);
    });

    socket.on('vote-update', ({ pollId, options }: { pollId: string; options: PollOption[] }) => {
      setPolls(prev => prev.map(p => p.id === pollId ? { ...p, options } : p));
    });

    socket.on('poll-closed', ({ pollId, correctOptionId, scoredResponseIds: scored }: { pollId: string; correctOptionId?: string; scoredResponseIds?: string[] }) => {
      setPolls(prev => prev.map(p => p.id === pollId ? { ...p, isActive: false, correctOptionId } : p));
      if (scored) setScoredResponseIds(prev => ({ ...prev, [pollId]: scored }));
    });

    socket.on('poll-deleted', ({ pollId }: { pollId: string }) => {
      setPolls(prev => prev.filter(p => p.id !== pollId));
    });

    socket.on('poll-reset', ({ pollId, options }: { pollId: string; options: { id: string; text: string; votes: number }[] }) => {
      setPolls(prev => prev.map(p => p.id === pollId ? { ...p, options, textResponses: [], responsesPublished: false } : p));
      setMyVotes(prev => { const n = { ...prev }; delete n[pollId]; return n; });
      setMyTextResponses(prev => { const n = { ...prev }; delete n[pollId]; return n; });
      setMyTextResponseIds(prev => { const n = { ...prev }; delete n[pollId]; return n; });
      setScoredResponseIds(prev => { const n = { ...prev }; delete n[pollId]; return n; });
    });

    // Server tells the submitter their response ID for scoring tracking
    socket.on('text-response-submitted', ({ pollId, responseId }: { pollId: string; responseId: string }) => {
      setMyTextResponseIds(prev => ({ ...prev, [pollId]: responseId }));
    });

    socket.on('leaderboard-updated', ({ leaderboard }: { leaderboard: { id: string; name: string; score: number }[] }) => {
      setLeaderboard([...leaderboard].sort((a, b) => b.score - a.score));
    });

    socket.on('timer-started', ({ pollId, endsAt }: { pollId: string; endsAt: number }) => {
      setPolls(prev => prev.map(p => p.id === pollId ? { ...p, endsAt } : p));
    });

    socket.on('poll-revealed', ({ pollId, revealedAt, imageBase64 }: { pollId: string; revealedAt?: number; imageBase64?: string }) => {
      setPolls(prev => prev.map(p => p.id === pollId ? {
        ...p,
        isRevealed: true,
        ...(revealedAt ? { revealedAt } : {}),
        ...(imageBase64 ? { imageBase64 } : {}),
      } : p));
    });

    socket.on('question-added', ({ question }: { question: Question }) => {
      setQuestions(prev => [...prev, question]);
    });

    socket.on('question-upvoted', ({ questionId, upvotes }: { questionId: string; upvotes: number }) => {
      setQuestions(prev => prev.map(q => q.id === questionId ? { ...q, upvotes } : q));
    });

    socket.on('question-archived', ({ questionId }: { questionId: string }) => {
      setQuestions(prev => prev.filter(q => q.id !== questionId));
    });

    socket.on('text-response-added', ({ pollId, response }: { pollId: string; response: TextResponse }) => {
      setPolls(prev => prev.map(p =>
        p.id === pollId ? { ...p, textResponses: [...p.textResponses, response] } : p
      ));
    });

    socket.on('responses-published', ({ pollId, textResponses, scoredResponseIds: scored }: { pollId: string; textResponses: TextResponse[]; scoredResponseIds?: string[] }) => {
      setPolls(prev => prev.map(p =>
        p.id === pollId ? { ...p, responsesPublished: true, textResponses } : p
      ));
      if (scored) setScoredResponseIds(prev => ({ ...prev, [pollId]: scored }));
    });

    socket.on('participants-updated', ({ count }: { count: number }) => setParticipants(count));

    // Connect and join (or show form if no name yet)
    if (savedName) {
      if (socket.connected) {
        rejoin();
      } else {
        socket.connect();
      }
    } else {
      setShowJoinForm(true);
      if (!socket.connected) socket.connect();
    }

    return () => {
      socket.off('connect', rejoin);
      socket.off('room-joined');
      socket.off('join-error');
      socket.off('poll-created');
      socket.off('vote-update');
      socket.off('poll-closed');
      socket.off('leaderboard-updated');
      socket.off('timer-started');
      socket.off('poll-revealed');
      socket.off('question-added');
      socket.off('question-upvoted');
      socket.off('question-archived');
      socket.off('text-response-added');
      socket.off('responses-published');
      socket.off('participants-updated');
      socket.off('poll-deleted');
      socket.off('poll-reset');
      socket.off('text-response-submitted');
      socket.disconnect();
    };
  }, [code]);

  const handleJoinSubmit = () => {
    const name = nameInput.trim();
    if (!name) return;
    localStorage.setItem(`name:${code}`, name);
    setShowJoinForm(false);
    setJoining(true);
    setError('');
    const socket = getSocket();
    if (!socket.connected) socket.connect();
    socket.emit('join-room', { code, name });
  };

  const handleVote = (pollId: string, optionId: string) => {
    getSocket().emit('vote', { pollId, optionId });
    setMyVotes(prev => ({ ...prev, [pollId]: optionId }));
  };

  const handleSubmitQuestion = () => {
    if (!qText.trim()) return;
    getSocket().emit('submit-question', { text: qText.trim() });
    setQText('');
  };

  const handleTextResponse = (pollId: string, text: string) => {
    getSocket().emit('submit-text-response', { pollId, text });
    setMyTextResponses(prev => ({ ...prev, [pollId]: text }));
  };

  const handleUpvote = (questionId: string) => {
    getSocket().emit('upvote-question', { questionId });
    setQuestions(prev => prev.map(q => {
      if (q.id !== questionId) return q;
      const already = q.upvotedBy.includes(socketId);
      return {
        ...q,
        upvotes: already ? q.upvotes - 1 : q.upvotes + 1,
        upvotedBy: already ? q.upvotedBy.filter(id => id !== socketId) : [...q.upvotedBy, socketId],
      };
    }));
  };

  // Auto-advance to latest when a new question is revealed (unless user navigated back)
  useEffect(() => {
    const visible = polls.filter(p => !p.isActive || p.isRevealed);
    if (autoAdvanceRef.current && visible.length > 0) {
      setViewIndex(visible.length - 1);
    }
  }, [polls]);

  // Show join form if no name saved yet (direct URL access)
  if (showJoinForm && !room) {
    return (
      <div className="min-h-screen bg-mesh flex flex-col items-center justify-center p-6">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-10">
          <div className="w-8 h-8 rounded-xl bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/40">
            <span className="text-white text-sm font-black">B</span>
          </div>
          <span className="text-white font-bold text-lg tracking-tight">Bill Pulse</span>
        </div>

        <div className="w-full max-w-sm">
          {/* Code badge */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 bg-brand-500/20 border border-brand-500/30 rounded-full px-4 py-1.5 mb-4">
              <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
              <span className="text-brand-300 text-xs font-semibold uppercase tracking-wider">Live session</span>
            </div>
            <div className="font-mono font-black text-4xl tracking-[0.2em] text-white mb-1">{code}</div>
            <p className="text-white/50 text-sm">Enter your name to join this session</p>
          </div>

          <div className="bg-white/5 border border-white/10 backdrop-blur-sm rounded-2xl p-6 space-y-4">
            <input
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
              placeholder="Your name"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleJoinSubmit()}
              autoFocus
            />
            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                <span className="text-red-400 text-sm">⚠</span>
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}
            <button
              onClick={handleJoinSubmit}
              disabled={!nameInput.trim() || joining}
              className="w-full bg-brand-500 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-colors shadow-lg shadow-brand-500/30 text-sm"
            >
              {joining ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Joining…
                </span>
              ) : 'Join Session →'}
            </button>
          </div>

          <p className="text-center text-xs text-white/30 mt-5">
            Wrong room?{' '}
            <a href="/" className="text-brand-400 hover:text-brand-300 underline underline-offset-2">Go to home</a>
          </p>
        </div>
      </div>
    );
  }

  if (error && !room) {
    return (
      <div className="min-h-screen bg-mesh flex flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl mb-4">😕</div>
        <h2 className="text-2xl font-bold text-white mb-2">Room not found</h2>
        <p className="text-white/50 mb-6">
          The room <span className="font-mono font-bold text-white/80">{code}</span> doesn&apos;t exist or has ended.
        </p>
        <a
          href="/"
          className="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
        >
          Back to home
        </a>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-mesh flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/50 text-sm">Connecting to session…</p>
        </div>
      </div>
    );
  }

  // Live: active AND revealed (hidden until host reveals)
  const livePolls = polls.filter(p => p.isActive && p.isRevealed);
  // Waiting: active but not yet revealed
  const hasUnrevealedActive = polls.some(p => p.isActive && !p.isRevealed);
  // Past: closed
  const pastPolls = polls.filter(p => !p.isActive);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-brand-600 text-white px-4 py-4 shadow">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-bold text-xl">{room.title}</h1>
            <p className="text-brand-200 text-sm">Hosted by {room.hostName}</p>
          </div>
          <div className="text-right">
            <div className="font-mono font-bold text-lg tracking-widest">{code}</div>
            <div className="text-xs text-brand-200">{participants} here</div>
          </div>
        </div>
      </div>

      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex">
          {(['polls', 'qa'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-semibold uppercase tracking-wide border-b-2 transition-colors ${
                tab === t ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500'
              }`}
            >
              {t === 'polls' ? `Polls${activePoll ? ' ●' : ''}` : `Q&A (${questions.length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {tab === 'polls' && (
          <div className="space-y-6">
            {/* ── Live section ── */}
            {livePolls.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                  </span>
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                    Live — {livePolls.length} active {livePolls.length === 1 ? 'poll' : 'polls'}
                  </p>
                </div>
                <div className="space-y-3">
                  {livePolls.map(poll => (
                    <PollResults
                      key={poll.id}
                      question={poll.question}
                      type={poll.type}
                      options={poll.options}
                      textResponses={poll.textResponses}
                      imageBase64={poll.imageBase64}
                      isActive={true}
                      isRevealed={poll.isRevealed}
                      responsesPublished={poll.responsesPublished}
                      endsAt={poll.endsAt}
                      revealedAt={poll.revealedAt}
                      correctOptionId={poll.correctOptionId}
                      scoredResponseIds={scoredResponseIds[poll.id]}
                      myVote={myVotes[poll.id]}
                      myTextResponse={myTextResponses[poll.id]}
                      myTextResponseId={myTextResponseIds[poll.id]}
                      onVote={(optionId) => handleVote(poll.id, optionId)}
                      onTextResponse={(text) => handleTextResponse(poll.id, text)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Waiting indicator (question created but not yet revealed) */}
            {hasUnrevealedActive && livePolls.length === 0 && (
              <div className="text-center py-10 text-gray-400">
                <div className="w-8 h-8 border-2 border-brand-300 border-t-brand-500 rounded-full animate-spin mx-auto mb-3" />
                <p className="font-medium text-gray-500">Next question coming up...</p>
                <p className="text-sm mt-1">Stand by</p>
              </div>
            )}

            {/* Nothing at all yet */}
            {livePolls.length === 0 && !hasUnrevealedActive && pastPolls.length === 0 && (
              <div className="text-center py-20 text-gray-400">
                <div className="text-5xl mb-3">📊</div>
                <p className="font-medium text-gray-500">Waiting for the first question...</p>
              </div>
            )}

            {/* ── Leaderboard ── */}
            {leaderboard.length > 0 && (
              <div className="bg-white rounded-xl shadow p-4">
                <p className="text-xs font-semibold text-yellow-600 uppercase tracking-wide mb-2">🏆 Leaderboard</p>
                <div className="space-y-1.5">
                  {leaderboard.map((entry, i) => (
                    <div key={entry.id} className={`flex items-center gap-3 rounded-lg px-2 py-1 ${entry.id === socketId ? 'bg-brand-50' : ''}`}>
                      <span className="text-sm font-bold text-gray-400 w-5 text-right">{i + 1}</span>
                      <span className="flex-1 text-sm font-medium text-gray-800 truncate">
                        {entry.name}{entry.id === socketId ? ' (you)' : ''}
                      </span>
                      <span className="text-sm font-bold text-yellow-600">{entry.score.toLocaleString()} pts</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Past section ── */}
            {pastPolls.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Past — {pastPolls.length} {pastPolls.length === 1 ? 'poll' : 'polls'}
                </p>
                <div className="space-y-3">
                  {pastPolls.map(poll => (
                    <PollResults
                      key={poll.id}
                      question={poll.question}
                      type={poll.type}
                      options={poll.options}
                      textResponses={poll.textResponses}
                      imageBase64={poll.imageBase64}
                      isActive={false}
                      isRevealed={poll.isRevealed}
                      responsesPublished={poll.responsesPublished}
                      revealedAt={poll.revealedAt}
                      correctOptionId={poll.correctOptionId}
                      scoredResponseIds={scoredResponseIds[poll.id]}
                      myVote={myVotes[poll.id]}
                      myTextResponse={myTextResponses[poll.id]}
                      myTextResponseId={myTextResponseIds[poll.id]}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'qa' && (
          <QuestionList questions={questions} mySocketId={socketId} onUpvote={handleUpvote} />
        )}
      </div>

      {tab === 'qa' && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4">
          <div className="max-w-lg mx-auto flex gap-3">
            <input
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Ask a question..."
              value={qText}
              onChange={e => setQText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmitQuestion()}
            />
            <button
              onClick={handleSubmitQuestion}
              disabled={!qText.trim()}
              className="bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white px-4 rounded-lg font-medium transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

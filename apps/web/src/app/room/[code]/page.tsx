'use client';
import { useEffect, useState, useRef } from 'react';
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
  const [socketId, setSocketId] = useState<string>('');
  const [error, setError] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [joining, setJoining] = useState(false);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [leaderboard, setLeaderboard] = useState<{ id: string; name: string; score: number }[]>([]);
  const [viewIndex, setViewIndex] = useState(0);
  const autoAdvanceRef = useRef(true);

  useEffect(() => {
    const socket = getSocket();
    if (!socket.connected) socket.connect();

    setSocketId(socket.id || '');
    socket.on('connect', () => setSocketId(socket.id || ''));

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
      setPolls(prev => [...prev.map(p => ({ ...p, isActive: false })), { ...poll, textResponses: poll.textResponses ?? [] }]);
    });

    socket.on('vote-update', ({ pollId, options }: { pollId: string; options: PollOption[] }) => {
      setPolls(prev => prev.map(p => p.id === pollId ? { ...p, options } : p));
    });

    socket.on('poll-closed', ({ pollId, correctOptionId }: { pollId: string; correctOptionId?: string }) => {
      setPolls(prev => prev.map(p => p.id === pollId ? { ...p, isActive: false, correctOptionId } : p));
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

    socket.on('responses-published', ({ pollId, textResponses }: { pollId: string; textResponses: TextResponse[] }) => {
      setPolls(prev => prev.map(p =>
        p.id === pollId ? { ...p, responsesPublished: true, textResponses } : p
      ));
    });

    socket.on('participants-updated', ({ count }: { count: number }) => setParticipants(count));

    // Auto-join if name is already saved, otherwise show join form
    const savedName = localStorage.getItem(`name:${code}`);
    if (savedName) {
      socket.emit('join-room', { code, name: savedName });
    } else {
      setShowJoinForm(true);
    }

    return () => {
      socket.off('connect');
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
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-6 space-y-4">
          <div className="text-center mb-2">
            <div className="font-mono font-bold text-2xl tracking-widest text-brand-600 mb-1">{code}</div>
            <p className="text-gray-500 text-sm">Enter your name to join</p>
          </div>
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Your name"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleJoinSubmit()}
            autoFocus
          />
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          <button
            onClick={handleJoinSubmit}
            disabled={!nameInput.trim() || joining}
            className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {joining ? 'Joining...' : 'Join Room'}
          </button>
          <p className="text-center text-sm text-gray-400">
            or <a href="/" className="text-brand-500 hover:underline">go to home page</a>
          </p>
        </div>
      </div>
    );
  }

  if (error && !room) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-2xl text-red-500 font-semibold mb-2">Room not found</p>
          <p className="text-gray-500 mb-4">The room <span className="font-mono font-bold">{code}</span> doesn&apos;t exist or has ended.</p>
          <a href="/" className="text-brand-500 hover:underline">Go back home</a>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center text-gray-400">
          <p className="text-lg">Joining room...</p>
        </div>
      </div>
    );
  }

  const activePoll = polls.find(p => p.isActive);
  // Polls visible to participants: closed ones + active if revealed
  const visiblePolls = polls.filter(p => !p.isActive || p.isRevealed);
  const clampedIndex = Math.min(viewIndex, Math.max(0, visiblePolls.length - 1));
  const currentPoll = visiblePolls[clampedIndex];
  const isOnLatest = clampedIndex === visiblePolls.length - 1;

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
          <>
            {/* No questions revealed yet */}
            {visiblePolls.length === 0 && (
              <div className="text-center py-20 text-gray-400">
                <div className="text-5xl mb-3">📊</div>
                {activePoll
                  ? <><p className="font-semibold text-gray-500 text-lg">Next question coming up...</p><p className="text-sm mt-1">Stand by</p></>
                  : <p className="font-medium text-gray-500">Waiting for the first question...</p>
                }
              </div>
            )}

            {/* Question card */}
            {currentPoll && (
              <div className="space-y-3">
                {/* Navigation bar */}
                {visiblePolls.length > 1 && (
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => { autoAdvanceRef.current = false; setViewIndex(i => Math.max(0, i - 1)); }}
                      disabled={clampedIndex === 0}
                      className="flex items-center gap-1 text-sm font-medium text-brand-600 disabled:text-gray-300 disabled:cursor-not-allowed"
                    >
                      ← Prev
                    </button>
                    <span className="text-xs text-gray-400 font-medium">
                      Question {clampedIndex + 1} of {visiblePolls.length}
                    </span>
                    <button
                      onClick={() => {
                        const next = clampedIndex + 1;
                        if (next >= visiblePolls.length) return;
                        setViewIndex(next);
                        if (next === visiblePolls.length - 1) autoAdvanceRef.current = true;
                      }}
                      disabled={clampedIndex === visiblePolls.length - 1}
                      className="flex items-center gap-1 text-sm font-medium text-brand-600 disabled:text-gray-300 disabled:cursor-not-allowed"
                    >
                      Next →
                    </button>
                  </div>
                )}

                {/* Live badge when a new question is waiting */}
                {!isOnLatest && activePoll && activePoll.isRevealed && (
                  <button
                    onClick={() => { autoAdvanceRef.current = true; setViewIndex(visiblePolls.length - 1); }}
                    className="w-full text-center text-xs bg-green-50 border border-green-200 text-green-700 font-semibold py-2 rounded-lg"
                  >
                    ● Live question — tap to jump to it
                  </button>
                )}

                <PollResults
                  key={currentPoll.id}
                  question={currentPoll.question}
                  type={currentPoll.type}
                  options={currentPoll.options}
                  textResponses={currentPoll.textResponses}
                  imageBase64={currentPoll.imageBase64}
                  isActive={currentPoll.isActive}
                  isRevealed={currentPoll.isRevealed}
                  responsesPublished={currentPoll.responsesPublished}
                  endsAt={currentPoll.isActive ? currentPoll.endsAt : undefined}
                  revealedAt={currentPoll.revealedAt}
                  correctOptionId={currentPoll.correctOptionId}
                  myVote={myVotes[currentPoll.id]}
                  myTextResponse={myTextResponses[currentPoll.id]}
                  onVote={currentPoll.isActive ? (optionId) => handleVote(currentPoll.id, optionId) : undefined}
                  onTextResponse={currentPoll.isActive ? (text) => handleTextResponse(currentPoll.id, text) : undefined}
                />

                {/* Leaderboard (shown after any scored question closes) */}
                {!currentPoll.isActive && leaderboard.length > 0 && isOnLatest && (
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

                {isOnLatest && !currentPoll.isActive && (
                  <p className="text-center text-sm text-gray-400">Waiting for next question...</p>
                )}
              </div>
            )}
          </>
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

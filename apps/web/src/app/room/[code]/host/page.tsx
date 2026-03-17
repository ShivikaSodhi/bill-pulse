'use client';
import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { getSocket } from '@/lib/socket';
import { PollResults, TextResponse } from '@/components/PollResults';
import { CreatePoll, QuestionData } from '@/components/CreatePoll';
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
  duration: number;
  endsAt?: number;
  revealedAt?: number;
  timerStarted?: boolean;
  correctOptionId?: string;
}

interface Room {
  code: string;
  title: string;
  hostName: string;
  participants: number;
}

// Inline edit form for a pending poll
function EditPendingForm({
  data,
  onSave,
  onCancel,
}: {
  data: QuestionData;
  onSave: (updated: QuestionData) => void;
  onCancel: () => void;
}) {
  const [question, setQuestion] = useState(data.question);
  const [options, setOptions] = useState<string[]>(data.options.length > 0 ? data.options : ['', '']);
  const [correctOptionIndex, setCorrectOptionIndex] = useState<number | undefined>(data.correctOptionIndex);
  const [duration, setDuration] = useState(data.duration);

  const updateOption = (i: number, val: string) => {
    setOptions(prev => prev.map((o, idx) => idx === i ? val : o));
  };

  const save = () => {
    if (!question.trim()) return;
    onSave({ ...data, question: question.trim(), options, correctOptionIndex, duration });
  };

  return (
    <div className="bg-white border-2 border-pink-200 rounded-2xl p-4 space-y-3 shadow-sm">
      <p className="text-xs font-bold text-brand-600 uppercase tracking-widest">Edit question</p>
      <input
        className="w-full bg-gray-50 border border-pink-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        value={question}
        onChange={e => setQuestion(e.target.value)}
        placeholder="Question"
      />
      {data.pollType === 'multiple-choice' && (
        <div className="space-y-1.5">
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCorrectOptionIndex(correctOptionIndex === i ? undefined : i)}
                className={`w-5 h-5 rounded-full border-2 shrink-0 transition-colors ${
                  correctOptionIndex === i ? 'bg-green-500 border-green-500' : 'border-gray-300'
                }`}
              />
              <input
                className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={opt}
                onChange={e => updateOption(i, e.target.value)}
                placeholder={`Option ${i + 1}`}
              />
              {options.length > 2 && (
                <button
                  onClick={() => {
                    setOptions(prev => prev.filter((_, idx) => idx !== i));
                    if (correctOptionIndex === i) setCorrectOptionIndex(undefined);
                    else if (correctOptionIndex != null && correctOptionIndex > i) setCorrectOptionIndex(correctOptionIndex - 1);
                  }}
                  className="text-gray-300 hover:text-red-500 text-lg leading-none"
                >×</button>
              )}
            </div>
          ))}
          {options.length < 6 && (
            <button
              onClick={() => setOptions(prev => [...prev, ''])}
              className="text-xs text-brand-600 hover:text-brand-700 font-bold"
            >+ Add option</button>
          )}
        </div>
      )}
      <div className="flex items-center gap-3">
        <label className="text-xs text-gray-500">Duration:</label>
        <select
          value={duration}
          onChange={e => setDuration(Number(e.target.value))}
          className="bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-800"
        >
          <option value={0}>No timer</option>
          <option value={15}>15s</option>
          <option value={30}>30s</option>
          <option value={60}>1 min</option>
          <option value={120}>2 min</option>
        </select>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200">Cancel</button>
        <button onClick={save} className="text-sm bg-brand-500 hover:bg-brand-600 text-white font-bold px-3 py-1.5 rounded-lg">Save</button>
      </div>
    </div>
  );
}

// Modal for editing a past (closed) poll
function EditPollModal({
  poll,
  correctAnswer: initialCorrectAnswer,
  onSave,
  onClose,
}: {
  poll: { id: string; question: string; type: string; options: { id: string; text: string }[]; correctOptionId?: string };
  correctAnswer?: string;
  onSave: (data: { question: string; correctOptionId?: string; correctAnswer?: string }) => void;
  onClose: () => void;
}) {
  const [question, setQuestion] = useState(poll.question);
  const [correctOptionId, setCorrectOptionId] = useState<string | undefined>(poll.correctOptionId);
  const [correctAnswer, setCorrectAnswer] = useState(initialCorrectAnswer ?? '');

  const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const OPTION_COLORS = ['bg-red-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500', 'bg-pink-500'];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-3xl overflow-hidden shadow-2xl">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-pink-100 bg-pink-50/50">
          <h2 className="text-lg font-black text-gray-900">Edit Poll</h2>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-700 text-2xl leading-none transition-colors">×</button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Question */}
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-2">Question</label>
            <textarea
              className="w-full bg-gray-50 border border-pink-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              rows={3}
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="Question text..."
            />
          </div>

          {/* MC: mark correct option */}
          {poll.type === 'multiple-choice' && poll.options.length > 0 && (
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-2">
                Correct Option <span className="text-gray-300 normal-case">(tap to toggle)</span>
              </label>
              <div className="space-y-2">
                {poll.options.map((opt, i) => {
                  const isCorrect = correctOptionId === opt.id;
                  const color = OPTION_COLORS[i % OPTION_COLORS.length];
                  const letter = OPTION_LETTERS[i] ?? String(i + 1);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setCorrectOptionId(isCorrect ? undefined : opt.id)}
                      className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 border transition-all text-left ${
                        isCorrect
                          ? 'border-green-300 bg-green-50'
                          : 'border-gray-100 bg-gray-50 hover:bg-pink-50'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-lg ${color} flex items-center justify-center font-black text-white text-xs shrink-0`}>
                        {isCorrect ? '✓' : letter}
                      </div>
                      <span className={`text-sm font-semibold flex-1 ${isCorrect ? 'text-green-700' : 'text-gray-700'}`}>
                        {opt.text}
                      </span>
                      {isCorrect && <span className="text-xs text-green-600 font-bold">Correct</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Open text: correct answer */}
          {poll.type === 'open-text' && (
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block mb-2">Reference Answer</label>
              <input
                className="w-full bg-gray-50 border border-pink-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={correctAnswer}
                onChange={e => setCorrectAnswer(e.target.value)}
                placeholder="Expected answer (exact match, case/space insensitive)"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-pink-100">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave({ question: question.trim(), correctOptionId, correctAnswer: correctAnswer.trim() || undefined })}
            disabled={!question.trim()}
            className="flex-1 py-3 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-30 text-sm font-black text-white transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HostRoom() {
  const { code } = useParams<{ code: string }>();
  const [room, setRoom] = useState<Room | null>(null);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [participants, setParticipants] = useState(0);
  const [participantList, setParticipantList] = useState<{ id: string; name: string }[]>([]);
  const [pendingPolls, setPendingPolls] = useState<QuestionData[]>([]);
  const [leaderboard, setLeaderboard] = useState<{ id: string; name: string; score: number }[]>([]);
  const [voterDetails, setVoterDetails] = useState<Record<string, { name: string; optionId: string; optionText: string; responseTime?: number }[]>>({});
  const [scoredResponseIds, setScoredResponseIds] = useState<Record<string, string[]>>({});
  const [correctAnswers, setCorrectAnswers] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<'polls' | 'qa'>('polls');
  const [socketId, setSocketId] = useState('');

  // Edit state for past polls
  const [editingPollId, setEditingPollId] = useState<string | null>(null);
  // Edit state for pending polls
  const [editingPendingIndex, setEditingPendingIndex] = useState<number | null>(null);

  const initialized = useRef(false);
  const pendingPollsRef = useRef<QuestionData[]>([]);

  useEffect(() => { pendingPollsRef.current = pendingPolls; }, [pendingPolls]);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const socket = getSocket();
    if (!socket.connected) socket.connect();
    setSocketId(socket.id || '');

    const rejoin = () => {
      setSocketId(socket.id || '');
      const name = typeof window !== 'undefined' ? (localStorage.getItem(`name:${code}`) || 'Host') : 'Host';
      const hostKey = typeof window !== 'undefined' ? (localStorage.getItem(`hostKey:${code}`) ?? undefined) : undefined;
      socket.emit('join-room', { code, name, hostKey });
    };
    socket.on('connect', rejoin);

    const handleRoomData = ({ room }: { room: Room & { polls: Poll[]; questions: Question[]; participantList: { id: string; name: string }[] } }) => {
      setRoom(room);
      setPolls(room.polls);
      setQuestions(room.questions);
      setParticipants(room.participants);
      setParticipantList(room.participantList ?? []);
    };

    socket.on('room-joined', handleRoomData);
    socket.on('room-created', ({ room }: { code: string; room: Room & { polls: Poll[]; questions: Question[]; participantList: { id: string; name: string }[] } }) => {
      setRoom(room);
      setPolls(room.polls);
      setQuestions(room.questions);
      setParticipants(room.participants);
      setParticipantList(room.participantList ?? []);
    });

    socket.on('poll-created', ({ poll }: { poll: Poll }) => {
      setPolls(prev => [...prev, { ...poll, textResponses: poll.textResponses ?? [] }]);
    });

    // Host-only: image + correct answer metadata
    socket.on('poll-host-metadata', ({ pollId, correctOptionId, correctAnswer, imageBase64 }: { pollId: string; correctOptionId?: string; correctAnswer?: string; imageBase64?: string }) => {
      setPolls(prev => prev.map(p => p.id === pollId ? {
        ...p,
        ...(correctOptionId ? { correctOptionId } : {}),
        ...(imageBase64 ? { imageBase64 } : {}),
      } : p));
      if (correctAnswer) setCorrectAnswers(prev => ({ ...prev, [pollId]: correctAnswer }));
    });

    socket.on('vote-update', ({ pollId, options }: { pollId: string; options: PollOption[] }) => {
      setPolls(prev => prev.map(p => p.id === pollId ? { ...p, options } : p));
    });

    socket.on('text-response-added', ({ pollId, response }: { pollId: string; response: TextResponse }) => {
      setPolls(prev => prev.map(p =>
        p.id === pollId ? { ...p, textResponses: [...p.textResponses, response] } : p
      ));
    });

    socket.on('responses-published', ({ pollId, textResponses, scoredResponseIds: scored }: { pollId: string; textResponses?: import('@/components/PollResults').TextResponse[]; scoredResponseIds?: string[] }) => {
      setPolls(prev => prev.map(p => p.id === pollId ? {
        ...p,
        responsesPublished: true,
        ...(textResponses ? { textResponses } : {}),
      } : p));
      if (scored) setScoredResponseIds(prev => ({ ...prev, [pollId]: scored }));
    });

    socket.on('leaderboard-updated', ({ leaderboard }: { leaderboard: { id: string; name: string; score: number }[] }) => {
      setLeaderboard([...leaderboard].sort((a, b) => b.score - a.score));
    });

    socket.on('poll-voter-details', ({ pollId, voterDetails }: { pollId: string; voterDetails: { name: string; optionId: string; optionText: string; responseTime?: number }[] }) => {
      setVoterDetails(prev => ({ ...prev, [pollId]: voterDetails }));
    });

    socket.on('poll-closed', ({ pollId, correctOptionId, scoredResponseIds: scored }: { pollId: string; correctOptionId?: string; scoredResponseIds?: string[] }) => {
      setPolls(prev => prev.map(p => p.id === pollId ? { ...p, isActive: false, correctOptionId: correctOptionId ?? p.correctOptionId } : p));
      if (scored && scored.length > 0) setScoredResponseIds(prev => ({ ...prev, [pollId]: scored }));
      const next = pendingPollsRef.current[0];
      if (next) {
        setPendingPolls(prev => prev.slice(1));
        getSocket().emit('create-poll', { question: next.question, type: next.pollType, options: next.options, imageBase64: next.imageBase64, duration: next.duration, correctOptionIndex: next.correctOptionIndex, correctAnswer: next.correctAnswer });
      }
    });

    socket.on('timer-started', ({ pollId, endsAt }: { pollId: string; endsAt: number }) => {
      setPolls(prev => prev.map(p => p.id === pollId ? { ...p, endsAt, timerStarted: true } : p));
    });

    socket.on('poll-revealed', ({ pollId, revealedAt, imageBase64 }: { pollId: string; revealedAt?: number; imageBase64?: string }) => {
      setPolls(prev => prev.map(p => p.id === pollId ? {
        ...p,
        isRevealed: true,
        ...(revealedAt ? { revealedAt } : {}),
        ...(imageBase64 ? { imageBase64 } : {}),
      } : p));
    });

    socket.on('poll-deleted', ({ pollId }: { pollId: string }) => {
      setPolls(prev => prev.filter(p => p.id !== pollId));
    });

    socket.on('poll-reset', ({ pollId, options }: { pollId: string; options: { id: string; text: string; votes: number }[] }) => {
      setPolls(prev => prev.map(p => p.id === pollId ? { ...p, options, textResponses: [], responsesPublished: false } : p));
      setScoredResponseIds(prev => { const n = { ...prev }; delete n[pollId]; return n; });
      setVoterDetails(prev => { const n = { ...prev }; delete n[pollId]; return n; });
    });

    socket.on('poll-updated', ({ pollId, question, correctOptionId, correctAnswer }: { pollId: string; question: string; correctOptionId?: string; correctAnswer?: string }) => {
      setPolls(prev => prev.map(p => p.id === pollId ? { ...p, question, correctOptionId: correctOptionId ?? p.correctOptionId } : p));
      if (correctAnswer !== undefined) setCorrectAnswers(prev => ({ ...prev, [pollId]: correctAnswer }));
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

    socket.on('participants-updated', ({ count, list }: { count: number; list: { id: string; name: string }[] }) => {
      setParticipants(count);
      setParticipantList(list);
    });

    if (socket.connected) rejoin();

    return () => {
      socket.off('room-joined');
      socket.off('room-created');
      socket.off('poll-created');
      socket.off('poll-host-metadata');
      socket.off('vote-update');
      socket.off('text-response-added');
      socket.off('responses-published');
      socket.off('leaderboard-updated');
      socket.off('poll-voter-details');
      socket.off('poll-closed');
      socket.off('timer-started');
      socket.off('poll-revealed');
      socket.off('poll-deleted');
      socket.off('poll-reset');
      socket.off('poll-updated');
      socket.off('question-added');
      socket.off('question-upvoted');
      socket.off('question-archived');
      socket.off('participants-updated');
      socket.off('connect');
    };
  }, [code]);

  const handleCreatePoll = (questions: QuestionData[]) => {
    if (questions.length === 0) return;
    const [first, ...rest] = questions;
    getSocket().emit('create-poll', { question: first.question, type: first.pollType, options: first.options, imageBase64: first.imageBase64, duration: first.duration, correctOptionIndex: first.correctOptionIndex, correctAnswer: first.correctAnswer });
    if (rest.length > 0) setPendingPolls(prev => [...prev, ...rest]);
  };

  const handleClosePoll = (pollId: string) => {
    getSocket().emit('close-poll', { pollId });
  };

  const handleRevealPoll = (pollId: string) => {
    getSocket().emit('reveal-poll', { pollId });
  };

  const handlePublishResponses = (pollId: string) => {
    getSocket().emit('publish-responses', { pollId });
  };

  const handleDeletePoll = (pollId: string) => {
    getSocket().emit('delete-poll', { pollId });
  };

  const handleUnpublishPoll = (pollId: string) => {
    getSocket().emit('unpublish-poll', { pollId });
  };

  const handleSaveEditPoll = (pollId: string, data: { question: string; correctOptionId?: string; correctAnswer?: string }) => {
    if (!data.question.trim()) return;
    getSocket().emit('update-poll', { pollId, question: data.question, correctOptionId: data.correctOptionId ?? null, correctAnswer: data.correctAnswer ?? null });
    setEditingPollId(null);
  };

  const handleArchive = (questionId: string) => {
    getSocket().emit('archive-question', { questionId });
  };

  const handleUpvote = (questionId: string) => {
    getSocket().emit('upvote-question', { questionId });
  };

  const activePolls = polls.filter(p => p.isActive);
  const pastPolls = polls.filter(p => !p.isActive);

  const allPolls = [...activePolls, ...pastPolls];
  const editingPoll = editingPollId ? polls.find(p => p.id === editingPollId) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-rose-50 to-fuchsia-50 pb-8">
      {/* Edit poll modal */}
      {editingPoll && (
        <EditPollModal
          poll={editingPoll}
          correctAnswer={correctAnswers[editingPoll.id]}
          onClose={() => setEditingPollId(null)}
          onSave={(data) => handleSaveEditPoll(editingPoll.id, data)}
        />
      )}
      {/* Header */}
      <div className="bg-white border-b border-pink-100 shadow-sm px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-0.5">Host Dashboard</div>
            <h1 className="font-bold text-xl text-gray-900">{room?.title || 'Loading...'}</h1>
          </div>
          <div className="text-right">
            <div className="font-mono font-black text-2xl tracking-[0.2em] text-brand-600">{code}</div>
            <div className="text-xs text-gray-400 mt-0.5">{participants} participants</div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="bg-white border-b border-pink-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex">
          {(['polls', 'qa'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-colors ${
                tab === t ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {t === 'polls' ? 'Polls' : `Q&A (${questions.length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-5">
        {tab === 'polls' && (
          <>
            {/* Participant count */}
            <div className="bg-white border border-pink-100 rounded-2xl px-4 py-3 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                </span>
                <span className="text-sm text-gray-600">
                  <span className="text-2xl font-black text-gray-900 mr-1">{participants}</span>
                  participant{participants !== 1 ? 's' : ''} joined
                </span>
              </div>
              {participantList.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {participantList.map(p => (
                    <span key={p.id} className="text-xs bg-pink-50 text-pink-700 border border-pink-200 px-2.5 py-0.5 rounded-full font-semibold">
                      {p.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400">Waiting for participants to join...</p>
              )}
            </div>

            <CreatePoll onCreatePoll={handleCreatePoll} />

            {/* Pending queue */}
            {pendingPolls.length > 0 && (
              <div>
                <p className="text-xs font-bold text-brand-600 uppercase tracking-widest mb-2">
                  Up Next ({pendingPolls.length})
                </p>
                <div className="space-y-1.5">
                  {pendingPolls.map((poll, i) => (
                    <div key={i}>
                      {editingPendingIndex === i ? (
                        <EditPendingForm
                          data={poll}
                          onSave={updated => {
                            setPendingPolls(prev => prev.map((p, idx) => idx === i ? updated : p));
                            setEditingPendingIndex(null);
                          }}
                          onCancel={() => setEditingPendingIndex(null)}
                        />
                      ) : (
                        <div className="flex items-center gap-3 bg-white border border-pink-100 rounded-xl px-4 py-2.5 shadow-sm">
                          <span className="text-xs text-gray-400 font-mono w-4 shrink-0">{i + 1}.</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{poll.question}</p>
                            <p className="text-xs text-gray-400">
                              {poll.pollType === 'multiple-choice' ? `${poll.options.length} options` : 'Open text'}
                              {poll.duration > 0 ? ` · ${poll.duration >= 60 ? `${poll.duration / 60}min` : `${poll.duration}s`}` : ''}
                            </p>
                          </div>
                          <button
                            onClick={() => setEditingPendingIndex(i)}
                            className="text-gray-300 hover:text-brand-500 text-sm shrink-0 transition-colors"
                            title="Edit"
                          >✏️</button>
                          <button
                            onClick={() => setPendingPolls(prev => prev.filter((_, idx) => idx !== i))}
                            className="text-gray-300 hover:text-red-500 text-lg leading-none shrink-0 transition-colors"
                            title="Remove"
                          >×</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Active polls */}
            {activePolls.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  <p className="text-xs font-bold text-green-500 uppercase tracking-widest">
                    Live Polls ({activePolls.length})
                  </p>
                </div>
                <div className="space-y-3">
                  {activePolls.map(poll => (
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
                      isHost={true}
                      duration={poll.duration}
                      endsAt={poll.endsAt}
                      revealedAt={poll.revealedAt}
                      correctOptionId={poll.correctOptionId}
                      onClose={() => handleClosePoll(poll.id)}
                      onPublish={() => handlePublishResponses(poll.id)}
                      onReveal={!poll.isRevealed ? () => handleRevealPoll(poll.id) : undefined}
                      onEdit={() => setEditingPollId(poll.id)}
                      questionNumber={allPolls.indexOf(poll) + 1}
                      totalQuestions={allPolls.length + pendingPolls.length}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Past polls */}
            {pastPolls.length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Past Polls</p>
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
                      isHost={true}
                      revealedAt={poll.revealedAt}
                      correctOptionId={poll.correctOptionId}
                      voterDetails={voterDetails[poll.id]}
                      onPublish={!poll.responsesPublished ? () => handlePublishResponses(poll.id) : undefined}
                      onEdit={() => setEditingPollId(poll.id)}
                      onDelete={() => handleDeletePoll(poll.id)}
                      onUnpublish={() => handleUnpublishPoll(poll.id)}
                      correctAnswer={correctAnswers[poll.id]}
                      scoredResponseIds={scoredResponseIds[poll.id]}
                      questionNumber={allPolls.indexOf(poll) + 1}
                      totalQuestions={allPolls.length + pendingPolls.length}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Leaderboard */}
            {leaderboard.length > 0 && (
              <div className="bg-white border border-amber-100 rounded-2xl px-4 py-4 shadow-sm">
                <p className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-3">🏆 Leaderboard</p>
                <div className="space-y-2">
                  {leaderboard.map((entry, i) => (
                    <div key={entry.id} className="flex items-center gap-3 rounded-xl px-3 py-2 bg-gray-50">
                      <span className="text-sm font-black text-gray-400 w-5 text-right">{i + 1}</span>
                      <span className="flex-1 text-sm font-semibold text-gray-700 truncate">{entry.name}</span>
                      <span className="text-sm font-black text-amber-500">{entry.score.toLocaleString()} pts</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activePolls.length === 0 && pastPolls.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <div className="text-5xl mb-3">📊</div>
                <p className="font-bold text-lg">Create your first poll above</p>
              </div>
            )}
          </>
        )}

        {tab === 'qa' && (
          <QuestionList
            questions={questions}
            mySocketId={socketId}
            isHost={true}
            onUpvote={handleUpvote}
            onArchive={handleArchive}
          />
        )}
      </div>
    </div>
  );
}

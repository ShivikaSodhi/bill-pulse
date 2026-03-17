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
    <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-brand-600 uppercase tracking-wide">Edit question</p>
      <input
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
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
                className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
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
                  className="text-gray-300 hover:text-red-400 text-lg leading-none"
                >×</button>
              )}
            </div>
          ))}
          {options.length < 6 && (
            <button
              onClick={() => setOptions(prev => [...prev, ''])}
              className="text-xs text-brand-500 hover:text-brand-700 font-medium"
            >+ Add option</button>
          )}
        </div>
      )}
      <div className="flex items-center gap-3">
        <label className="text-xs text-gray-500">Duration:</label>
        <select
          value={duration}
          onChange={e => setDuration(Number(e.target.value))}
          className="border border-gray-300 rounded px-2 py-1 text-sm"
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
        <button onClick={save} className="text-sm bg-brand-500 hover:bg-brand-600 text-white font-medium px-3 py-1.5 rounded-lg">Save</button>
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
  const [editPollQuestion, setEditPollQuestion] = useState('');
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
      setPolls(prev => [...prev.map(p => ({ ...p, isActive: false })), { ...poll, textResponses: poll.textResponses ?? [] }]);
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

    socket.on('poll-updated', ({ pollId, question }: { pollId: string; question: string }) => {
      setPolls(prev => prev.map(p => p.id === pollId ? { ...p, question } : p));
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

  const handleSaveEditPoll = (pollId: string) => {
    if (!editPollQuestion.trim()) return;
    getSocket().emit('update-poll', { pollId, question: editPollQuestion.trim() });
    setEditingPollId(null);
    setEditPollQuestion('');
  };

  const handleArchive = (questionId: string) => {
    getSocket().emit('archive-question', { questionId });
  };

  const handleUpvote = (questionId: string) => {
    getSocket().emit('upvote-question', { questionId });
  };

  const activePoll = polls.find(p => p.isActive);
  const pastPolls = polls.filter(p => !p.isActive);

  return (
    <div className="min-h-screen bg-gray-50 pb-6">
      <div className="bg-brand-700 text-white px-4 py-4 shadow">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <div className="text-xs text-brand-300 font-semibold uppercase tracking-wide mb-0.5">Host Dashboard</div>
            <h1 className="font-bold text-xl">{room?.title || 'Loading...'}</h1>
          </div>
          <div className="text-right">
            <div className="font-mono font-bold text-2xl tracking-widest bg-brand-600 px-3 py-1 rounded-lg">{code}</div>
            <div className="text-xs text-brand-300 mt-1">{participants} participants</div>
          </div>
        </div>
      </div>

      <div className="bg-brand-50 border-b border-brand-100 px-4 py-2">
        <p className="max-w-2xl mx-auto text-sm text-brand-700 text-center">
          Share code <strong className="font-mono">{code}</strong> · Participants go to{' '}
          <span className="font-mono text-xs bg-white border border-brand-200 px-1 rounded">localhost:3000/room/{code}</span>
        </p>
      </div>

      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex">
          {(['polls', 'qa'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-semibold uppercase tracking-wide border-b-2 transition-colors ${
                tab === t ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500'
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
            <div className="bg-white rounded-xl shadow border border-gray-100 px-4 py-3">
              <div className="flex items-center gap-3 mb-2">
                <span className="relative flex h-3 w-3 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                </span>
                <span className="text-sm font-medium text-gray-700">
                  <span className="text-2xl font-bold text-gray-900 mr-1">{participants}</span>
                  participant{participants !== 1 ? 's' : ''} joined
                </span>
              </div>
              {participantList.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {participantList.map(p => (
                    <span key={p.id} className="text-xs bg-brand-50 text-brand-700 border border-brand-100 px-2 py-0.5 rounded-full font-medium">
                      {p.name}
                    </span>
                  ))}
                </div>
              )}
              {participantList.length === 0 && (
                <p className="text-xs text-gray-400">Waiting for participants to join...</p>
              )}
            </div>

            <CreatePoll onCreatePoll={handleCreatePoll} />

            {/* Pending queue */}
            {pendingPolls.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-brand-500 uppercase tracking-wide mb-2">Up Next ({pendingPolls.length})</p>
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
                        <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-2.5 border border-gray-100 shadow-sm">
                          <span className="text-xs text-gray-400 font-mono w-4 shrink-0">{i + 1}.</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{poll.question}</p>
                            <p className="text-xs text-gray-400">
                              {poll.pollType === 'multiple-choice' ? `${poll.options.length} options` : 'Open text'}
                              {poll.duration > 0 ? ` · ${poll.duration >= 60 ? `${poll.duration / 60}min` : `${poll.duration}s`}` : ''}
                            </p>
                          </div>
                          <button
                            onClick={() => setEditingPendingIndex(i)}
                            className="text-gray-300 hover:text-brand-400 text-sm font-medium shrink-0"
                            title="Edit"
                          >✏️</button>
                          <button
                            onClick={() => setPendingPolls(prev => prev.filter((_, idx) => idx !== i))}
                            className="text-gray-300 hover:text-red-400 text-lg leading-none shrink-0"
                            title="Remove"
                          >×</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Active poll */}
            {activePoll && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">Live Poll</p>
                  {pendingPolls.length > 0 && (
                    <button
                      onClick={() => handleClosePoll(activePoll.id)}
                      className="text-xs bg-brand-500 hover:bg-brand-600 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Next Question →
                    </button>
                  )}
                </div>
                <PollResults
                  question={activePoll.question}
                  type={activePoll.type}
                  options={activePoll.options}
                  textResponses={activePoll.textResponses}
                  imageBase64={activePoll.imageBase64}
                  isActive={true}
                  isRevealed={activePoll.isRevealed}
                  responsesPublished={activePoll.responsesPublished}
                  isHost={true}
                  duration={activePoll.duration}
                  endsAt={activePoll.endsAt}
                  revealedAt={activePoll.revealedAt}
                  correctOptionId={activePoll.correctOptionId}
                  onClose={() => handleClosePoll(activePoll.id)}
                  onPublish={() => handlePublishResponses(activePoll.id)}
                  onReveal={!activePoll.isRevealed ? () => handleRevealPoll(activePoll.id) : undefined}
                />
              </div>
            )}

            {/* Past polls */}
            {pastPolls.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Past Polls</p>
                <div className="space-y-3">
                  {pastPolls.map(poll => (
                    <div key={poll.id}>
                      {editingPollId === poll.id ? (
                        <div className="bg-white rounded-xl shadow p-4 space-y-3">
                          <p className="text-xs font-semibold text-brand-600 uppercase tracking-wide">Edit question text</p>
                          <input
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                            value={editPollQuestion}
                            onChange={e => setEditPollQuestion(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSaveEditPoll(poll.id)}
                            autoFocus
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => { setEditingPollId(null); setEditPollQuestion(''); }}
                              className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200"
                            >Cancel</button>
                            <button
                              onClick={() => handleSaveEditPoll(poll.id)}
                              className="text-sm bg-brand-500 hover:bg-brand-600 text-white font-medium px-3 py-1.5 rounded-lg"
                            >Save</button>
                          </div>
                        </div>
                      ) : (
                        <PollResults
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
                          onEdit={() => { setEditingPollId(poll.id); setEditPollQuestion(poll.question); }}
                          onDelete={() => handleDeletePoll(poll.id)}
                          onUnpublish={() => handleUnpublishPoll(poll.id)}
                          correctAnswer={correctAnswers[poll.id]}
                          scoredResponseIds={scoredResponseIds[poll.id]}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Leaderboard */}
            {leaderboard.length > 0 && (
              <div className="bg-white rounded-xl shadow border border-gray-100 px-4 py-3">
                <p className="text-xs font-semibold text-yellow-600 uppercase tracking-wide mb-2">🏆 Leaderboard</p>
                <div className="space-y-1.5">
                  {leaderboard.map((entry, i) => (
                    <div key={entry.id} className="flex items-center gap-3">
                      <span className="text-sm font-bold text-gray-400 w-5 text-right">{i + 1}</span>
                      <span className="flex-1 text-sm font-medium text-gray-800 truncate">{entry.name}</span>
                      <span className="text-sm font-bold text-yellow-600">{entry.score.toLocaleString()} pts</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {polls.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-2">📊</div>
                <p>Create your first poll above</p>
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

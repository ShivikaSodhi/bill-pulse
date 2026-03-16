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
  responsesPublished: boolean;
  duration: number;
  endsAt?: number;
}

interface Room {
  code: string;
  title: string;
  hostName: string;
  participants: number;
}

export default function HostRoom() {
  const { code } = useParams<{ code: string }>();
  const [room, setRoom] = useState<Room | null>(null);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [participants, setParticipants] = useState(0);
  const [pendingPolls, setPendingPolls] = useState<QuestionData[]>([]);
  const [tab, setTab] = useState<'polls' | 'qa'>('polls');
  const [socketId, setSocketId] = useState('');
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const socket = getSocket();
    if (!socket.connected) socket.connect();
    setSocketId(socket.id || '');
    socket.on('connect', () => setSocketId(socket.id || ''));

    const handleRoomData = ({ room }: { room: Room & { polls: Poll[]; questions: Question[] } }) => {
      setRoom(room);
      setPolls(room.polls);
      setQuestions(room.questions);
      setParticipants(room.participants);
    };

    socket.on('room-joined', handleRoomData);
    socket.on('room-created', ({ room }: { code: string; room: Room & { polls: Poll[]; questions: Question[] } }) => {
      setRoom(room);
      setPolls(room.polls);
      setQuestions(room.questions);
      setParticipants(room.participants);
    });

    socket.on('poll-created', ({ poll }: { poll: Poll }) => {
      setPolls(prev => [...prev.map(p => ({ ...p, isActive: false })), { ...poll, textResponses: poll.textResponses ?? [] }]);
    });

    socket.on('vote-update', ({ pollId, options }: { pollId: string; options: PollOption[] }) => {
      setPolls(prev => prev.map(p => p.id === pollId ? { ...p, options } : p));
    });

    socket.on('text-response-added', ({ pollId, response }: { pollId: string; response: TextResponse }) => {
      setPolls(prev => prev.map(p =>
        p.id === pollId ? { ...p, textResponses: [...p.textResponses, response] } : p
      ));
    });

    socket.on('responses-published', ({ pollId }: { pollId: string }) => {
      setPolls(prev => prev.map(p => p.id === pollId ? { ...p, responsesPublished: true } : p));
    });

    socket.on('poll-closed', ({ pollId }: { pollId: string }) => {
      setPolls(prev => prev.map(p => p.id === pollId ? { ...p, isActive: false } : p));
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

    socket.on('participant-count', ({ count }: { count: number }) => setParticipants(count));

    const name = typeof window !== 'undefined' ? (localStorage.getItem(`name:${code}`) || 'Host') : 'Host';
    const hostKey = typeof window !== 'undefined' ? (localStorage.getItem(`hostKey:${code}`) ?? undefined) : undefined;
    socket.emit('join-room', { code, name, hostKey });

    return () => {
      socket.off('room-joined');
      socket.off('room-created');
      socket.off('poll-created');
      socket.off('vote-update');
      socket.off('text-response-added');
      socket.off('responses-published');
      socket.off('poll-closed');
      socket.off('question-added');
      socket.off('question-upvoted');
      socket.off('question-archived');
      socket.off('participant-count');
      socket.off('connect');
    };
  }, [code]);

  const handleCreatePoll = (questions: QuestionData[]) => {
    if (questions.length === 0) return;
    const [first, ...rest] = questions;
    getSocket().emit('create-poll', { question: first.question, type: first.pollType, options: first.options, imageBase64: first.imageBase64, duration: first.duration });
    if (rest.length > 0) setPendingPolls(prev => [...prev, ...rest]);
  };

  const handleLaunchPending = (poll: QuestionData, index: number) => {
    getSocket().emit('create-poll', { question: poll.question, type: poll.pollType, options: poll.options, imageBase64: poll.imageBase64, duration: poll.duration });
    setPendingPolls(prev => prev.filter((_, i) => i !== index));
  };

  const handleClosePoll = (pollId: string) => {
    getSocket().emit('close-poll', { pollId });
  };

  const handlePublishResponses = (pollId: string) => {
    getSocket().emit('publish-responses', { pollId });
  };

  const handleArchive = (questionId: string) => {
    getSocket().emit('archive-question', { questionId });
  };

  const handleUpvote = (questionId: string) => {
    getSocket().emit('upvote-question', { questionId });
  };

  const activePoll = polls.find(p => p.isActive);

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
            <CreatePoll onCreatePoll={handleCreatePoll} />

            {pendingPolls.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-brand-500 uppercase tracking-wide mb-2">Poll Queue ({pendingPolls.length})</p>
                <div className="space-y-2">
                  {pendingPolls.map((poll, i) => (
                    <div key={i} className="flex items-center justify-between bg-white rounded-xl shadow px-4 py-3 border border-brand-100">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{poll.question}</p>
                        <p className="text-xs text-gray-400">{poll.pollType === 'multiple-choice' ? `${poll.options.length} options` : 'Open text'}{poll.duration > 0 ? ` · ${poll.duration >= 60 ? `${poll.duration / 60}min` : `${poll.duration}s`} timer` : ''}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <button
                          onClick={() => handleLaunchPending(poll, i)}
                          className="text-xs bg-brand-500 hover:bg-brand-600 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Launch
                        </button>
                        <button
                          onClick={() => setPendingPolls(prev => prev.filter((_, idx) => idx !== i))}
                          className="text-gray-400 hover:text-red-500 text-lg leading-none"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activePoll && (
              <div>
                <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2">Live Poll</p>
                <PollResults
                  question={activePoll.question}
                  type={activePoll.type}
                  options={activePoll.options}
                  textResponses={activePoll.textResponses}
                  imageBase64={activePoll.imageBase64}
                  isActive={true}
                  responsesPublished={activePoll.responsesPublished}
                  isHost={true}
                  endsAt={activePoll.endsAt}
                  onClose={() => handleClosePoll(activePoll.id)}
                  onPublish={() => handlePublishResponses(activePoll.id)}
                />
              </div>
            )}

            {polls.filter(p => !p.isActive).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Past Polls</p>
                <div className="space-y-3">
                  {polls.filter(p => !p.isActive).map(poll => (
                    <PollResults
                      key={poll.id}
                      question={poll.question}
                      type={poll.type}
                      options={poll.options}
                      textResponses={poll.textResponses}
                      imageBase64={poll.imageBase64}
                      isActive={false}
                      responsesPublished={poll.responsesPublished}
                      isHost={true}
                      onPublish={!poll.responsesPublished ? () => handlePublishResponses(poll.id) : undefined}
                    />
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

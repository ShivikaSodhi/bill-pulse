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
  responsesPublished: boolean;
  endsAt?: number;
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
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const socket = getSocket();
    if (!socket.connected) socket.connect();

    setSocketId(socket.id || '');
    socket.on('connect', () => setSocketId(socket.id || ''));

    socket.on('room-joined', ({ room }: { room: Room }) => {
      setRoom(room);
      setPolls(room.polls);
      setQuestions(room.questions);
      setParticipants(room.participants);
    });

    socket.on('join-error', ({ message }: { message: string }) => setError(message));

    socket.on('poll-created', ({ poll }: { poll: Poll }) => {
      setPolls(prev => [...prev.map(p => ({ ...p, isActive: false })), { ...poll, textResponses: poll.textResponses ?? [] }]);
    });

    socket.on('vote-update', ({ pollId, options }: { pollId: string; options: PollOption[] }) => {
      setPolls(prev => prev.map(p => p.id === pollId ? { ...p, options } : p));
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

    socket.on('participant-count', ({ count }: { count: number }) => setParticipants(count));

    const name = typeof window !== 'undefined' ? (localStorage.getItem(`name:${code}`) || 'Anonymous') : 'Anonymous';
    socket.emit('join-room', { code, name });

    return () => {
      socket.off('room-joined');
      socket.off('join-error');
      socket.off('poll-created');
      socket.off('vote-update');
      socket.off('poll-closed');
      socket.off('question-added');
      socket.off('question-upvoted');
      socket.off('question-archived');
      socket.off('text-response-added');
      socket.off('responses-published');
      socket.off('participant-count');
      socket.off('connect');
    };
  }, [code]);

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

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-2xl text-red-500 font-semibold mb-2">Room not found</p>
          <p className="text-gray-500 mb-4">{error}</p>
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
  const closedPolls = polls.filter(p => !p.isActive);

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
            {activePoll && (
              <div>
                <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2">Live Now</p>
                <PollResults
                  key={activePoll.id}
                  question={activePoll.question}
                  type={activePoll.type}
                  options={activePoll.options}
                  textResponses={activePoll.textResponses}
                  imageBase64={activePoll.imageBase64}
                  isActive={true}
                  responsesPublished={activePoll.responsesPublished}
                  endsAt={activePoll.endsAt}
                  myVote={myVotes[activePoll.id]}
                  myTextResponse={myTextResponses[activePoll.id]}
                  onVote={(optionId) => handleVote(activePoll.id, optionId)}
                  onTextResponse={(text) => handleTextResponse(activePoll.id, text)}
                />
              </div>
            )}
            {!activePoll && polls.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-2">📊</div>
                <p>Waiting for host to launch a poll...</p>
              </div>
            )}
            {closedPolls.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Previous Polls</p>
                <div className="space-y-3">
                  {closedPolls.map(poll => (
                    <PollResults
                      key={poll.id}
                      question={poll.question}
                      type={poll.type}
                      options={poll.options}
                      textResponses={poll.textResponses}
                      imageBase64={poll.imageBase64}
                      isActive={false}
                      responsesPublished={poll.responsesPublished}
                      myVote={myVotes[poll.id]}
                      myTextResponse={myTextResponses[poll.id]}
                    />
                  ))}
                </div>
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

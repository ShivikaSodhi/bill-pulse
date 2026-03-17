'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket';

const FEATURES = [
  { icon: '📊', label: 'Real-time polls & results' },
  { icon: '🙋', label: 'Live Q&A with upvotes' },
  { icon: '🏆', label: 'Quiz mode with leaderboard' },
  { icon: '⏱', label: 'Timed questions & auto-advance' },
];

export default function Home() {
  const router = useRouter();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [hostName, setHostName] = useState('');
  const [title, setTitle] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = () => {
    if (!hostName.trim() || !title.trim()) { setError('Please fill in all fields'); return; }
    setLoading(true);
    setError('');
    const socket = getSocket();
    socket.connect();
    socket.once('room-created', ({ code, hostKey }: { code: string; hostKey: string }) => {
      localStorage.setItem(`host:${code}`, '1');
      localStorage.setItem(`hostKey:${code}`, hostKey);
      localStorage.setItem(`name:${code}`, hostName);
      router.push(`/room/${code}/host`);
    });
    socket.emit('create-room', { hostName: hostName.trim(), title: title.trim() });
  };

  const handleJoin = () => {
    if (!joinCode.trim() || !joinName.trim()) { setError('Please fill in all fields'); return; }
    setLoading(true);
    setError('');
    const socket = getSocket();
    socket.connect();
    socket.once('room-joined', () => {
      localStorage.setItem(`name:${joinCode.toUpperCase()}`, joinName);
      router.push(`/room/${joinCode.toUpperCase()}`);
    });
    socket.once('join-error', ({ message }: { message: string }) => {
      setError(message);
      setLoading(false);
      socket.disconnect();
    });
    socket.emit('join-room', { code: joinCode.toUpperCase().trim(), name: joinName.trim() });
  };

  return (
    <main className="min-h-screen flex flex-col lg:flex-row">

      {/* ── Left panel: brand ── */}
      <div className="relative lg:w-[52%] bg-mesh flex flex-col justify-between p-8 lg:p-14 overflow-hidden min-h-[280px] lg:min-h-screen">
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -top-32 -left-32 w-96 h-96 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 w-72 h-72 rounded-full bg-brand-600/15 blur-3xl" />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/40">
              <span className="text-white text-lg font-black leading-none">B</span>
            </div>
            <span className="text-white font-bold text-xl tracking-tight">Bill Pulse</span>
          </div>
        </div>

        {/* Hero copy */}
        <div className="relative z-10 mt-12 lg:mt-0">
          <div className="inline-flex items-center gap-2 bg-brand-500/20 border border-brand-500/30 rounded-full px-3 py-1 mb-6">
            <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
            <span className="text-brand-300 text-xs font-semibold uppercase tracking-wider">Live audience engagement</span>
          </div>

          <h1 className="text-4xl lg:text-5xl xl:text-6xl font-black text-white leading-[1.1] tracking-tight mb-5">
            Run polls your<br />
            <span className="text-brand-400">audience loves.</span>
          </h1>
          <p className="text-white/60 text-base lg:text-lg max-w-sm leading-relaxed">
            Interactive polls, Q&A, and quizzes — all updating live as your audience responds.
          </p>

          {/* Feature list */}
          <div className="mt-10 grid grid-cols-2 gap-3">
            {FEATURES.map(f => (
              <div key={f.label} className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-base">
                  {f.icon}
                </div>
                <span className="text-white/70 text-sm font-medium leading-tight">{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom tagline */}
        <div className="relative z-10 mt-10 lg:mt-0">
          <p className="text-white/30 text-xs">No account needed · Free to use</p>
        </div>
      </div>

      {/* ── Right panel: form ── */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 p-6 lg:p-12">
        <div className="w-full max-w-[380px]">

          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-brand-500 flex items-center justify-center">
                <span className="text-white text-base font-black">B</span>
              </div>
              <span className="text-gray-900 font-bold text-xl">Bill Pulse</span>
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">
              {tab === 'create' ? 'Host an event' : 'Join an event'}
            </h2>
            <p className="text-gray-500 text-sm">
              {tab === 'create'
                ? 'Create a session and share the code with your audience.'
                : 'Enter the code your host shared to participate live.'}
            </p>
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 bg-gray-200/70 rounded-xl p-1 mb-6">
            {(['create', 'join'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(''); }}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  tab === t
                    ? 'bg-white text-brand-600 shadow-sm shadow-black/5'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'create' ? 'Host Event' : 'Join Event'}
              </button>
            ))}
          </div>

          {/* Form */}
          <div className="space-y-4">
            {tab === 'create' ? (
              <>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Your name</label>
                  <input
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-shadow shadow-sm"
                    placeholder="e.g. Alice"
                    value={hostName}
                    onChange={e => setHostName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Event title</label>
                  <input
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-shadow shadow-sm"
                    placeholder="e.g. Team All-Hands Q2"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  />
                </div>
                <button
                  onClick={handleCreate}
                  disabled={loading || !hostName.trim() || !title.trim()}
                  className="w-full bg-brand-500 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-colors shadow-lg shadow-brand-500/30 text-sm mt-2"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating…
                    </span>
                  ) : 'Create Event →'}
                </button>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Event code</label>
                  <input
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-center uppercase tracking-[0.25em] font-mono text-xl font-bold text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-shadow shadow-sm"
                    placeholder="ABC123"
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    maxLength={6}
                    onKeyDown={e => e.key === 'Enter' && handleJoin()}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Your name</label>
                  <input
                    className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-shadow shadow-sm"
                    placeholder="e.g. Bob"
                    value={joinName}
                    onChange={e => setJoinName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleJoin()}
                  />
                </div>
                <button
                  onClick={handleJoin}
                  disabled={loading || !joinCode.trim() || !joinName.trim()}
                  className="w-full bg-brand-500 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-colors shadow-lg shadow-brand-500/30 text-sm mt-2"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Joining…
                    </span>
                  ) : 'Join Event →'}
                </button>
              </>
            )}

            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                <span className="text-red-500 text-sm">⚠</span>
                <p className="text-red-600 text-sm font-medium">{error}</p>
              </div>
            )}
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            No account needed · Free to use
          </p>
        </div>
      </div>
    </main>
  );
}

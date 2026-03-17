'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSocket } from '@/lib/socket';


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
      <div className="hidden lg:flex lg:w-[48%] bg-[#0f0f0f] flex-col justify-between p-14 min-h-screen border-r border-white/5">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center">
            <span className="text-white text-sm font-bold leading-none">B</span>
          </div>
          <span className="text-white/90 font-semibold text-base tracking-tight">Bill Pulse</span>
        </div>

        {/* Center copy */}
        <div>
          <p className="text-white/30 text-xs font-medium uppercase tracking-widest mb-6">Live polling</p>
          <h1 className="text-4xl font-semibold text-white leading-snug tracking-tight mb-4">
            No more next<br />Slide Please...
          </h1>
          <p className="text-white/40 text-sm leading-relaxed max-w-xs">
            Polls, open-ended questions, and Q&A — no logins, no friction.
          </p>
        </div>

        {/* Footer */}
        <p className="text-white/20 text-xs">No account needed</p>
      </div>

      {/* ── Right panel: form ── */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 p-6 lg:p-12">
        <div className="w-full max-w-[380px]">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-7 h-7 rounded-lg bg-brand-500 flex items-center justify-center">
              <span className="text-white text-sm font-bold leading-none">B</span>
            </div>
            <span className="text-gray-900 font-semibold text-base tracking-tight">Bill Pulse</span>
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

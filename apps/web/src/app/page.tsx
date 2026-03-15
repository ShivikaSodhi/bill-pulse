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
    socket.once('room-created', ({ code }: { code: string }) => {
      localStorage.setItem(`host:${code}`, '1');
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
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-brand-600 mb-2">Bill Pulse</h1>
          <p className="text-gray-500">Live polls and Q&A for your audience</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="flex">
            {(['create', 'join'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(''); }}
                className={`flex-1 py-4 font-semibold text-sm uppercase tracking-wide transition-colors ${
                  tab === t ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {t === 'create' ? 'Host Event' : 'Join Event'}
              </button>
            ))}
          </div>

          <div className="p-6 space-y-4">
            {tab === 'create' ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="e.g. Alice"
                    value={hostName}
                    onChange={e => setHostName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Event Title</label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="e.g. Team All-Hands Q2"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  />
                </div>
                <button
                  onClick={handleCreate}
                  disabled={loading}
                  className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
                >
                  {loading ? 'Creating...' : 'Create Event'}
                </button>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Event Code</label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 uppercase tracking-widest font-mono text-lg"
                    placeholder="ABC123"
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    maxLength={6}
                    onKeyDown={e => e.key === 'Enter' && handleJoin()}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="e.g. Bob"
                    value={joinName}
                    onChange={e => setJoinName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleJoin()}
                  />
                </div>
                <button
                  onClick={handleJoin}
                  disabled={loading}
                  className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
                >
                  {loading ? 'Joining...' : 'Join Event'}
                </button>
              </>
            )}

            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          </div>
        </div>
      </div>
    </main>
  );
}

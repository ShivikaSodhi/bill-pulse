'use client';
import { useState, useEffect } from 'react';

interface Option { id: string; text: string; votes: number; }
export interface TextResponse { id: string; text: string; author: string; createdAt: number; }

interface PollResultsProps {
  question: string;
  type?: 'multiple-choice' | 'open-text';
  options: Option[];
  textResponses?: TextResponse[];
  imageBase64?: string;
  isActive: boolean;
  isRevealed?: boolean;
  responsesPublished?: boolean;
  isHost?: boolean;
  duration?: number;
  endsAt?: number;
  revealedAt?: number;
  myVote?: string;
  myTextResponse?: string;
  correctOptionId?: string;
  voterDetails?: { name: string; optionId: string; optionText: string; responseTime?: number }[];
  onVote?: (optionId: string) => void;
  onTextResponse?: (text: string) => void;
  onPublish?: () => void;
  onClose?: () => void;
  onReveal?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onUnpublish?: () => void;
  correctAnswer?: string;
  scoredResponseIds?: string[];
  myTextResponseId?: string;
  questionNumber?: number;
  totalQuestions?: number;
}

const OPTION_COLORS = [
  { btn: 'bg-pink-400 hover:bg-pink-300 active:bg-pink-500 shadow-pink-400/25',       result: 'border-pink-200 bg-pink-50',     bar: 'bg-pink-400',    letter: 'A' },
  { btn: 'bg-violet-400 hover:bg-violet-300 active:bg-violet-500 shadow-violet-400/25', result: 'border-violet-200 bg-violet-50', bar: 'bg-violet-400',  letter: 'B' },
  { btn: 'bg-rose-400 hover:bg-rose-300 active:bg-rose-500 shadow-rose-400/25',         result: 'border-rose-200 bg-rose-50',     bar: 'bg-rose-400',    letter: 'C' },
  { btn: 'bg-purple-400 hover:bg-purple-300 active:bg-purple-500 shadow-purple-400/25', result: 'border-purple-200 bg-purple-50', bar: 'bg-purple-400',  letter: 'D' },
  { btn: 'bg-fuchsia-400 hover:bg-fuchsia-300 active:bg-fuchsia-500 shadow-fuchsia-400/25', result: 'border-fuchsia-200 bg-fuchsia-50', bar: 'bg-fuchsia-400', letter: 'E' },
  { btn: 'bg-indigo-400 hover:bg-indigo-300 active:bg-indigo-500 shadow-indigo-400/25', result: 'border-indigo-200 bg-indigo-50', bar: 'bg-indigo-400',  letter: 'F' },
];

function Countdown({ endsAt }: { endsAt: number }) {
  const [remaining, setRemaining] = useState(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => {
      const secs = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(secs);
      if (secs === 0) clearInterval(id);
    }, 500);
    return () => clearInterval(id);
  }, [endsAt, remaining]);
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const display = mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${secs}s`;
  const urgent = remaining <= 10;
  return (
    <span className={`font-mono font-bold text-sm px-2.5 py-1 rounded-lg border ${
      urgent
        ? 'bg-red-50 text-red-600 border-red-200 animate-pulse'
        : 'bg-pink-50 text-pink-600 border-pink-200'
    }`}>
      {display}
    </span>
  );
}

function TimerBar({ endsAt, duration }: { endsAt: number; duration: number }) {
  const calc = () => Math.max(0, (endsAt - Date.now()) / 1000);
  const [remaining, setRemaining] = useState(calc);
  useEffect(() => {
    const id = setInterval(() => {
      const r = calc();
      setRemaining(r);
      if (r <= 0) clearInterval(id);
    }, 100);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt]);
  const pct = duration > 0 ? (remaining / duration) * 100 : 0;
  const urgent = remaining <= 10;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 font-medium uppercase tracking-widest">Time left</span>
        <span className={`font-mono font-black text-base ${urgent ? 'text-red-500 animate-pulse' : 'text-pink-600'}`}>
          {Math.ceil(remaining)}s
        </span>
      </div>
      <div className="h-2.5 bg-pink-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-100 ${urgent ? 'bg-red-500' : 'bg-pink-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function fmt(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function PollResults({
  question,
  type = 'multiple-choice',
  options,
  textResponses = [],
  imageBase64,
  isActive,
  isRevealed = true,
  responsesPublished = false,
  isHost = false,
  duration,
  endsAt,
  revealedAt,
  myVote,
  myTextResponse,
  correctOptionId,
  voterDetails,
  onVote,
  onTextResponse,
  onPublish,
  onClose,
  onReveal,
  onDelete,
  onEdit,
  onUnpublish,
  correctAnswer,
  scoredResponseIds = [],
  myTextResponseId,
  questionNumber,
  totalQuestions,
}: PollResultsProps) {
  const [inputText, setInputText] = useState('');
  const total = options.reduce((s, o) => s + o.votes, 0);
  const canVote = isActive && !!onVote && !myVote;

  const handleTextSubmit = () => {
    if (!inputText.trim() || !onTextResponse) return;
    onTextResponse(inputText.trim());
    setInputText('');
  };

  const visibleResponses = isHost || responsesPublished ? textResponses : [];
  const sortedResponses = [...visibleResponses].sort((a, b) => a.createdAt - b.createdAt);

  return (
    <div className="bg-white border-2 border-pink-100 rounded-3xl overflow-hidden shadow-lg shadow-pink-100/60">

      {/* ── Header bar ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-pink-100 bg-pink-50/50">
        <div className="flex items-center gap-3">
          {questionNumber != null && totalQuestions != null && (
            <span className="text-xs font-bold text-pink-400 tracking-widest uppercase">
              Q{questionNumber}
              <span className="text-pink-300"> / {totalQuestions}</span>
            </span>
          )}
          <span className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${
            isActive
              ? 'bg-pink-50 text-pink-600 border-pink-200'
              : 'bg-gray-50 text-gray-400 border-gray-200'
          }`}>
            {isActive && <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse" />}
            {isActive ? 'LIVE' : 'CLOSED'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isActive && endsAt && <Countdown endsAt={endsAt} />}
          {/* Host controls — edit always visible, reset/delete only when closed */}
          {isHost && (
            <div className="flex items-center gap-1">
              {onEdit && (
                <button
                  onClick={onEdit}
                  title="Edit question"
                  className="text-gray-300 hover:text-pink-500 p-1.5 rounded-lg hover:bg-pink-50 transition-colors text-sm"
                >✏️</button>
              )}
              {!isActive && onUnpublish && (
                <button
                  onClick={onUnpublish}
                  title="Reset all responses and reverse scores"
                  className="text-xs text-brand-600 hover:text-brand-700 font-bold border border-brand-200 hover:border-brand-400 px-2.5 py-1 rounded-lg transition-colors bg-brand-50"
                >Reset</button>
              )}
              {!isActive && onDelete && (
                <button
                  onClick={onDelete}
                  title="Delete poll"
                  className="text-gray-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors text-sm"
                >🗑</button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="p-5 space-y-5">

        {/* Image */}
        {imageBase64 && (isRevealed || isHost) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageBase64} alt="poll" className="w-full max-h-56 object-cover rounded-2xl border border-pink-100" />
        )}
        {imageBase64 && !isRevealed && !isHost && (
          <div className="w-full h-20 bg-pink-50 rounded-2xl border border-pink-100 flex items-center justify-center">
            <span className="text-sm text-pink-300">Image hidden until revealed</span>
          </div>
        )}

        {/* Question text — big! */}
        <h3 className="text-3xl font-bold text-gray-900 leading-snug">{question}</h3>

        {/* Timer progress bar */}
        {isActive && endsAt && duration && duration > 0 && (
          <TimerBar endsAt={endsAt} duration={duration} />
        )}

        {/* ── Multiple choice ── */}
        {type === 'multiple-choice' && (
          <>
            {canVote ? (
              /* Pre-vote: big coloured grid */
              <div className="grid grid-cols-2 gap-3">
                {options.map((option, i) => {
                  const c = OPTION_COLORS[i % OPTION_COLORS.length];
                  return (
                    <button
                      key={option.id}
                      onClick={() => onVote!(option.id)}
                      className={`${c.btn} rounded-2xl p-4 text-left shadow-lg transition-all duration-150 active:scale-95 min-h-[4.5rem]`}
                    >
                      <div className="w-7 h-7 rounded-lg bg-black/20 flex items-center justify-center font-black text-white text-xs mb-3">
                        {c.letter}
                      </div>
                      <p className="text-white font-bold text-sm leading-snug">{option.text}</p>
                    </button>
                  );
                })}
              </div>
            ) : (
              /* Post-vote / host view: result tiles */
              <div className="grid grid-cols-2 gap-3">
                {options.map((option, i) => {
                  const c = OPTION_COLORS[i % OPTION_COLORS.length];
                  const pct = total > 0 ? Math.round((option.votes / total) * 100) : 0;
                  const isCorrect = correctOptionId === option.id;
                  const voted = myVote === option.id;
                  return (
                    <div
                      key={option.id}
                      className={`relative rounded-2xl p-4 border overflow-hidden min-h-[4.5rem] ${
                        isCorrect
                          ? 'border-green-300 bg-green-50'
                          : `${c.result} ${voted ? 'ring-2 ring-pink-300' : ''}`
                      }`}
                    >
                      {/* Bar fill */}
                      <div
                        className={`absolute inset-y-0 left-0 ${isCorrect ? 'bg-green-400' : c.bar} opacity-20 transition-all duration-700`}
                        style={{ width: `${pct}%` }}
                      />
                      <div className="relative">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs mb-2 text-white ${
                          isCorrect ? 'bg-green-500' : `${c.bar}`
                        }`}>
                          {isCorrect ? '✓' : c.letter}
                        </div>
                        <p className={`text-sm font-bold leading-snug ${
                          isCorrect ? 'text-green-700' : voted ? 'text-gray-900' : 'text-gray-500'
                        }`}>
                          {option.text}
                        </p>
                        <p className={`text-xs mt-1 font-mono ${isCorrect ? 'text-green-600' : 'text-gray-400'}`}>
                          {pct}% · {option.votes}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Score feedback + vote total */}
            <div className="flex items-center justify-between">
              <div>
                {!isActive && correctOptionId && myVote && (
                  myVote === correctOptionId
                    ? <span className="text-sm font-black text-green-600">+1000 pts ✓</span>
                    : <span className="text-sm font-bold text-red-500">Incorrect</span>
                )}
              </div>
              <p className="text-xs text-gray-400">{total} vote{total !== 1 ? 's' : ''}</p>
            </div>

            {/* Host voter breakdown */}
            {isHost && !isActive && voterDetails && voterDetails.length > 0 && (
              <div className="border-t border-pink-100 pt-4 space-y-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                  Responses — fastest first
                </p>
                <div className="space-y-3 max-h-52 overflow-y-auto">
                  {options.map((opt, i) => {
                    const c = OPTION_COLORS[i % OPTION_COLORS.length];
                    const voters = voterDetails.filter(v => v.optionId === opt.id);
                    if (voters.length === 0) return null;
                    const isCorrectOpt = correctOptionId === opt.id;
                    return (
                      <div key={opt.id}>
                        <p className={`text-xs font-bold mb-1.5 ${isCorrectOpt ? 'text-green-600' : 'text-gray-500'}`}>
                          {isCorrectOpt ? '✓ ' : ''}{opt.text}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {voters.map((v, j) => (
                            <span key={j} className={`text-xs px-2 py-0.5 rounded-full font-medium border flex items-center gap-1 ${
                              isCorrectOpt
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : `${c.result} text-gray-600`
                            }`}>
                              {v.name}
                              {v.responseTime != null && (
                                <span className="opacity-50">{fmt(v.responseTime)}</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Open text ── */}
        {type === 'open-text' && (
          <div className="space-y-3">
            {/* Participant input */}
            {!isHost && isActive && (
              myTextResponse ? (
                <div className="bg-pink-50 border border-pink-200 rounded-xl px-4 py-3 text-sm text-pink-700">
                  Your answer: <span className="font-bold text-pink-800">{myTextResponse}</span>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    className="flex-1 bg-gray-50 border border-pink-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent transition-all"
                    placeholder="Type your answer..."
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleTextSubmit()}
                    autoFocus
                  />
                  <button
                    onClick={handleTextSubmit}
                    disabled={!inputText.trim()}
                    className="bg-brand-500 hover:bg-brand-600 disabled:opacity-30 text-white px-4 rounded-xl text-sm font-bold transition-colors"
                  >
                    Submit
                  </button>
                </div>
              )
            )}

            {!isHost && isActive && myTextResponse && (
              <p className="text-sm text-gray-400 text-center">Waiting for host to close & publish...</p>
            )}

            {/* Participant score result after close */}
            {!isHost && !isActive && myTextResponseId && (
              scoredResponseIds.includes(myTextResponseId)
                ? <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                    <span className="text-green-600 font-black text-sm">+1000 pts</span>
                    <span className="text-green-700 text-sm">Your answer matched!</span>
                  </div>
                : myTextResponse
                  ? <p className="text-sm text-gray-400 text-center py-1">No match this round</p>
                  : null
            )}

            {/* Host: reference answer + publish control */}
            {isHost && (
              <div className="space-y-2">
                {correctAnswer && (
                  <div className="flex items-center gap-2 bg-pink-50 border border-pink-200 rounded-xl px-4 py-2.5">
                    <span className="text-xs font-bold text-pink-500 shrink-0 uppercase tracking-widest">Answer:</span>
                    <span className="text-sm text-pink-800 font-semibold">{correctAnswer}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    {textResponses.length} response{textResponses.length !== 1 ? 's' : ''}
                    {scoredResponseIds.length > 0 && (
                      <span className="ml-2 text-xs bg-green-50 text-green-700 border border-green-200 font-bold px-1.5 py-0.5 rounded-full">
                        {scoredResponseIds.length} matched
                      </span>
                    )}
                  </span>
                  {!isActive && !responsesPublished && onPublish && (
                    <button
                      onClick={onPublish}
                      disabled={textResponses.length === 0}
                      className="text-xs bg-green-500 hover:bg-green-600 disabled:opacity-30 text-white font-bold px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Publish Responses
                    </button>
                  )}
                  {isActive && onPublish && (
                    <span className="text-xs text-gray-400">Close poll first</span>
                  )}
                  {responsesPublished && (
                    <span className="text-xs bg-green-50 text-green-700 border border-green-200 font-bold px-2 py-1 rounded-full">
                      Published
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Responses list */}
            {sortedResponses.length > 0 && (
              <div className="space-y-2">
                {!isHost && responsesPublished && (
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Responses</p>
                )}
                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                  {sortedResponses.map((r, i) => {
                    const isScored = scoredResponseIds.includes(r.id);
                    const isOwn = myTextResponseId === r.id;
                    return (
                      <div key={r.id} className={`rounded-xl px-3 py-2.5 border ${
                        isScored ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100'
                      }`}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm text-gray-800 flex-1">{r.text}</p>
                          {isScored && (
                            <span className="text-xs bg-green-500 text-white font-black px-2 py-0.5 rounded shrink-0">+1000</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <p className={`text-xs ${isOwn ? 'text-brand-500 font-semibold' : 'text-gray-400'}`}>
                            {r.author}{isOwn ? ' (you)' : ''}
                          </p>
                          {isHost && revealedAt != null && (
                            <span className="text-xs text-gray-300 font-mono">{fmt(r.createdAt - revealedAt)}</span>
                          )}
                          {isHost && <span className="text-xs text-gray-200">#{i + 1}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {isHost && textResponses.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-3">Waiting for responses...</p>
            )}
          </div>
        )}

        {/* ── Host active controls ── */}
        {isHost && isActive && (
          <div className="flex items-center justify-between pt-3 border-t border-pink-100">
            <div>
              {!isRevealed && onReveal && (
                <button
                  onClick={onReveal}
                  className="text-sm bg-brand-500 hover:bg-brand-600 text-white font-bold px-5 py-2 rounded-xl transition-colors shadow-lg shadow-brand-500/25"
                >
                  Reveal Question
                </button>
              )}
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="text-xs text-red-500 hover:text-red-600 font-bold border border-red-200 hover:border-red-300 px-3 py-1.5 rounded-lg transition-colors bg-red-50"
              >
                Close Poll
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

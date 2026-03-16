'use client';
import { useState, useEffect } from 'react';

interface Option {
  id: string;
  text: string;
  votes: number;
}

export interface TextResponse {
  id: string;
  text: string;
  author: string;
}

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
  myVote?: string;
  myTextResponse?: string;
  correctOptionId?: string;
  voterDetails?: { name: string; optionId: string; optionText: string }[];
  onVote?: (optionId: string) => void;
  onTextResponse?: (text: string) => void;
  onPublish?: () => void;
  onClose?: () => void;
  onReveal?: () => void;
}

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
    <span className={`font-mono font-bold text-sm px-2 py-0.5 rounded ${
      urgent ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-700'
    }`}>
      ⏱ {display}
    </span>
  );
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
  myVote,
  myTextResponse,
  correctOptionId,
  voterDetails,
  onVote,
  onTextResponse,
  onPublish,
  onClose,
  onReveal,
}: PollResultsProps) {
  const [inputText, setInputText] = useState('');
  const total = options.reduce((s, o) => s + o.votes, 0);
  const max = Math.max(...options.map(o => o.votes), 1);

  const handleTextSubmit = () => {
    if (!inputText.trim() || !onTextResponse) return;
    onTextResponse(inputText.trim());
    setInputText('');
  };

  const visibleResponses = isHost || responsesPublished ? textResponses : [];

  return (
    <div className="bg-white rounded-xl shadow p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-gray-800 text-lg leading-tight">{question}</h3>
        <div className="flex items-center gap-2 shrink-0">
          {isActive && endsAt && <Countdown endsAt={endsAt} />}
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
            isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {isActive ? 'Live' : 'Closed'}
          </span>
        </div>
      </div>

      {/* Image */}
      {imageBase64 && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageBase64} alt="poll" className="w-full max-h-56 object-cover rounded-lg border border-gray-100" />
      )}

      {/* Multiple choice */}
      {type === 'multiple-choice' && (
        <>
          <div className="space-y-3">
            {options.map(option => {
              const pct = total > 0 ? Math.round((option.votes / total) * 100) : 0;
              const isLeader = option.votes === max && option.votes > 0;
              const voted = myVote === option.id;
              const isCorrect = correctOptionId === option.id;
              const canVote = isActive && onVote && !myVote;

              return (
                <div key={option.id}>
                  {canVote ? (
                    <button onClick={() => onVote!(option.id)} className="w-full text-left group">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700 group-hover:text-brand-600">{option.text}</span>
                        <span className="text-xs text-gray-400">{option.votes}</span>
                      </div>
                      <div className="relative h-9 bg-gray-100 rounded-lg overflow-hidden group-hover:bg-gray-200 transition-colors">
                        <div className="absolute inset-y-0 left-0 bg-brand-500 rounded-lg transition-all duration-500 opacity-30" style={{ width: `${pct}%` }} />
                        <span className="absolute inset-0 flex items-center px-3 text-xs text-gray-600">Click to vote</span>
                      </div>
                    </button>
                  ) : (
                    <div className={`rounded-lg ${isCorrect ? 'ring-2 ring-green-400' : ''}`}>
                      <div className="flex items-center justify-between mb-1 px-0.5">
                        <span className={`text-sm font-medium flex items-center gap-1.5 ${isCorrect ? 'text-green-700' : voted ? 'text-brand-600' : 'text-gray-700'}`}>
                          {isCorrect && <span className="text-green-500 font-bold">✓</span>}
                          {voted && !isCorrect && <span className="text-brand-500">●</span>}
                          {option.text}
                        </span>
                        <span className="text-xs text-gray-500">{pct}% · {option.votes}</span>
                      </div>
                      <div className="h-6 bg-gray-100 rounded-lg overflow-hidden">
                        <div className={`h-full rounded-lg transition-all duration-700 ${
                          isCorrect ? 'bg-green-500' : isLeader ? 'bg-brand-500' : 'bg-brand-300'
                        }`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between">
            <div>
              {!isActive && correctOptionId && myVote && (
                myVote === correctOptionId
                  ? <span className="text-sm font-semibold text-green-600">+1000 pts</span>
                  : <span className="text-sm text-red-400">Incorrect</span>
              )}
            </div>
            <p className="text-xs text-gray-400">{total} total votes</p>
          </div>

          {/* Host: per-user answer breakdown */}
          {isHost && !isActive && voterDetails && voterDetails.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Responses ({voterDetails.length})</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {options.map(opt => {
                  const voters = voterDetails.filter(v => v.optionId === opt.id);
                  if (voters.length === 0) return null;
                  return (
                    <div key={opt.id} className="mb-2">
                      <p className={`text-xs font-semibold mb-1 ${correctOptionId === opt.id ? 'text-green-600' : 'text-gray-500'}`}>
                        {correctOptionId === opt.id ? '✓ ' : ''}{opt.text}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {voters.map((v, i) => (
                          <span key={i} className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            correctOptionId === opt.id ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {v.name}
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

      {/* Open text */}
      {type === 'open-text' && (
        <div className="space-y-3">
          {/* Participant input */}
          {!isHost && isActive && (
            myTextResponse ? (
              <div className="bg-brand-50 border border-brand-200 rounded-lg px-3 py-2 text-sm text-brand-700">
                Your answer: <span className="font-medium">{myTextResponse}</span>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Type your answer..."
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleTextSubmit()}
                />
                <button
                  onClick={handleTextSubmit}
                  disabled={!inputText.trim()}
                  className="bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white px-3 rounded-lg text-sm font-medium transition-colors"
                >
                  Submit
                </button>
              </div>
            )
          )}

          {/* Participant: waiting for publish */}
          {!isHost && myTextResponse && !responsesPublished && (
            <p className="text-sm text-gray-400 text-center py-2">Waiting for host to publish responses...</p>
          )}

          {/* Host: response count + publish button */}
          {isHost && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
                {textResponses.length} response{textResponses.length !== 1 ? 's' : ''} received
              </span>
              {!responsesPublished && onPublish && (
                <button
                  onClick={onPublish}
                  disabled={textResponses.length === 0}
                  className="text-sm bg-green-500 hover:bg-green-600 disabled:opacity-40 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
                >
                  Publish Responses
                </button>
              )}
              {responsesPublished && (
                <span className="text-xs bg-green-100 text-green-700 font-medium px-2 py-1 rounded-full">Published</span>
              )}
            </div>
          )}

          {/* Responses list */}
          {visibleResponses.length > 0 && (
            <div className="space-y-2">
              {!isHost && responsesPublished && (
                <p className="text-xs font-semibold text-green-600 uppercase tracking-wide">Responses revealed</p>
              )}
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {visibleResponses.map(r => (
                  <div key={r.id} className="bg-gray-50 rounded-lg px-3 py-2">
                    <p className="text-sm text-gray-800">{r.text}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{r.author}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isHost && textResponses.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-3">Waiting for responses...</p>
          )}
        </div>
      )}

      {/* Host controls */}
      {isHost && isActive && (
        <div className="flex items-center justify-between pt-1 border-t border-gray-100">
          <div className="flex items-center gap-2">
            {!isRevealed && onReveal && (
              <button
                onClick={onReveal}
                className="text-xs bg-brand-500 hover:bg-brand-600 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                Reveal Question
              </button>
            )}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-xs text-red-500 hover:text-red-700 font-medium border border-red-200 px-2 py-1 rounded"
            >
              Close Poll
            </button>
          )}
        </div>
      )}
    </div>
  );
}

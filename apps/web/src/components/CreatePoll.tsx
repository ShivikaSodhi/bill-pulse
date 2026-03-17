'use client';
import { useState, useRef } from 'react';

type PollType = 'multiple-choice' | 'open-text';

const DURATION_OPTIONS = [
  { label: 'No timer', value: 0 },
  { label: '30s', value: 30 },
  { label: '1 min', value: 60 },
  { label: '2 min', value: 120 },
  { label: '5 min', value: 300 },
];

export interface QuestionData {
  question: string;
  pollType: PollType;
  options: string[];
  correctOptionIndex?: number;
  correctAnswer?: string;
  imageBase64?: string;
  duration: number;
}

interface CreatePollProps {
  onCreatePoll: (questions: QuestionData[]) => void;
}

export function CreatePoll({ onCreatePoll }: CreatePollProps) {
  const [step, setStep] = useState<'closed' | 'type' | 'form'>('closed');
  const [question, setQuestion] = useState('');
  const [pollType, setPollType] = useState<PollType>('multiple-choice');
  const [options, setOptions] = useState(['', '']);
  const [correctOptionIndex, setCorrectOptionIndex] = useState<number | undefined>();
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [imageBase64, setImageBase64] = useState<string | undefined>();
  const [imagePreview, setImagePreview] = useState<string | undefined>();
  const [duration, setDuration] = useState(0);
  const [queuedQuestions, setQueuedQuestions] = useState<QuestionData[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const addOption = () => setOptions(prev => [...prev, '']);
  const removeOption = (i: number) => {
    setOptions(prev => prev.filter((_, idx) => idx !== i));
    if (correctOptionIndex === i) setCorrectOptionIndex(undefined);
    else if (correctOptionIndex != null && correctOptionIndex > i) setCorrectOptionIndex(correctOptionIndex - 1);
  };
  const updateOption = (i: number, val: string) => setOptions(prev => prev.map((o, idx) => idx === i ? val : o));

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) { alert('Image must be under 1 MB'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImageBase64(result);
      setImagePreview(result);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageBase64(undefined);
    setImagePreview(undefined);
    if (fileRef.current) fileRef.current.value = '';
  };

  const getCurrentQuestion = (): QuestionData | null => {
    if (!question.trim()) return null;
    if (pollType === 'multiple-choice') {
      const validOptions = options.map(o => o.trim()).filter(Boolean);
      if (validOptions.length < 2) return null;
      return { question: question.trim(), pollType, options: validOptions, correctOptionIndex, imageBase64, duration };
    }
    return { question: question.trim(), pollType, options: [], correctAnswer: correctAnswer.trim() || undefined, imageBase64, duration };
  };

  const resetForm = () => {
    setQuestion('');
    setOptions(['', '']);
    setCorrectOptionIndex(undefined);
    setCorrectAnswer('');
    setImageBase64(undefined);
    setImagePreview(undefined);
    setDuration(0);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handlePickType = (type: PollType) => {
    setPollType(type);
    setStep('form');
    resetForm();
  };

  const handleAddQuestion = () => {
    const current = getCurrentQuestion();
    if (!current) return;
    setQueuedQuestions(prev => [...prev, current]);
    resetForm();
    setStep('type');
  };

  const handleSubmit = () => {
    const current = getCurrentQuestion();
    const allQuestions = current ? [...queuedQuestions, current] : queuedQuestions;
    if (allQuestions.length === 0) return;
    onCreatePoll(allQuestions);
    setQueuedQuestions([]);
    resetForm();
    setStep('closed');
  };

  const removeQueued = (i: number) => setQueuedQuestions(prev => prev.filter((_, idx) => idx !== i));

  const currentIsValid = !!getCurrentQuestion();
  const totalCount = queuedQuestions.length + (currentIsValid ? 1 : 0);

  if (step === 'closed') {
    return (
      <button
        onClick={() => setStep(queuedQuestions.length > 0 ? 'type' : 'type')}
        className="w-full border-2 border-dashed border-brand-300 hover:border-brand-500 text-brand-500 hover:text-brand-600 rounded-xl py-4 font-medium transition-colors"
      >
        + Create New Poll
      </button>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow border-2 border-brand-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">
          {step === 'type' ? 'Choose question type' : 'New question'}
        </h3>
        <button
          onClick={() => { setStep('closed'); setQueuedQuestions([]); resetForm(); }}
          className="text-gray-400 hover:text-gray-600 text-xl leading-none"
        >
          ×
        </button>
      </div>

      {/* Queue preview */}
      {queuedQuestions.length > 0 && (
        <div className="px-5 pb-3 space-y-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Queue ({queuedQuestions.length})</p>
          {queuedQuestions.map((q, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
              <span className="text-xs text-gray-400 font-mono w-4">{i + 1}.</span>
              <span className="text-sm text-gray-700 truncate flex-1">{q.question}</span>
              <span className="text-xs text-gray-400 shrink-0">{q.pollType === 'multiple-choice' ? 'MC' : 'Text'}</span>
              <button onClick={() => removeQueued(i)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
            </div>
          ))}
        </div>
      )}

      {/* Step: type picker */}
      {step === 'type' && (
        <div className="px-5 pb-5 grid grid-cols-2 gap-3">
          <button
            onClick={() => handlePickType('multiple-choice')}
            className="flex flex-col items-start gap-2 border-2 border-gray-200 hover:border-brand-400 hover:bg-brand-50 rounded-xl p-4 transition-all text-left group"
          >
            <div className="text-2xl">📊</div>
            <div>
              <p className="font-semibold text-gray-800 group-hover:text-brand-700">Multiple Choice</p>
              <p className="text-xs text-gray-500 mt-0.5">Voting & quizzes with options</p>
            </div>
          </button>
          <button
            onClick={() => handlePickType('open-text')}
            className="flex flex-col items-start gap-2 border-2 border-gray-200 hover:border-brand-400 hover:bg-brand-50 rounded-xl p-4 transition-all text-left group"
          >
            <div className="text-2xl">💬</div>
            <div>
              <p className="font-semibold text-gray-800 group-hover:text-brand-700">Open Text</p>
              <p className="text-xs text-gray-500 mt-0.5">Collect free-form answers</p>
            </div>
          </button>
        </div>
      )}

      {/* Step: form */}
      {step === 'form' && (
        <div className="px-5 pb-5 space-y-4">
          {/* Back + type badge */}
          <div className="flex items-center gap-2">
            <button onClick={() => setStep('type')} className="text-xs text-brand-500 hover:text-brand-700 flex items-center gap-1">
              ← Back
            </button>
            <span className="text-xs bg-brand-100 text-brand-700 font-medium px-2 py-0.5 rounded-full">
              {pollType === 'multiple-choice' ? '📊 Multiple Choice' : '💬 Open Text'}
            </span>
          </div>

          {/* Question */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Question</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="What do you want to ask?"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              autoFocus
            />
          </div>

          {/* Timer */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Timer</label>
            <div className="flex gap-2 flex-wrap">
              {DURATION_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setDuration(opt.value)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    duration === opt.value ? 'bg-brand-500 border-brand-500 text-white' : 'border-gray-300 text-gray-600 hover:border-brand-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Image upload */}
          <div>
            {imagePreview ? (
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="preview" className="h-28 rounded-lg object-cover border border-gray-200" />
                <button
                  onClick={removeImage}
                  className="absolute top-1 right-1 bg-white rounded-full w-6 h-6 flex items-center justify-center shadow text-gray-500 hover:text-red-500 text-sm"
                >
                  ×
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 cursor-pointer w-fit border border-dashed border-gray-300 hover:border-brand-400 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-brand-600 transition-colors">
                <span>📷</span> Add image
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
              </label>
            )}
          </div>

          {/* Options — multiple choice */}
          {pollType === 'multiple-choice' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Options</label>
                {correctOptionIndex != null && (
                  <span className="text-xs bg-green-100 text-green-700 font-medium px-2 py-0.5 rounded-full">Quiz mode on</span>
                )}
              </div>
              <div className="space-y-2">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCorrectOptionIndex(correctOptionIndex === i ? undefined : i)}
                      title="Mark as correct answer"
                      className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                        correctOptionIndex === i
                          ? 'bg-green-500 border-green-500 text-white'
                          : 'border-gray-300 hover:border-green-400'
                      }`}
                    >
                      {correctOptionIndex === i && <span className="text-[10px] font-bold">✓</span>}
                    </button>
                    <input
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      placeholder={`Option ${i + 1}`}
                      value={opt}
                      onChange={e => updateOption(i, e.target.value)}
                    />
                    {options.length > 2 && (
                      <button onClick={() => removeOption(i)} className="text-red-400 hover:text-red-600 px-2 text-lg">×</button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1.5">Click ○ to mark the correct answer (optional)</p>
              <button onClick={addOption} className="mt-2 text-sm text-brand-500 hover:text-brand-700">+ Add option</button>
            </div>
          )}

          {pollType === 'open-text' && (
            <div className="space-y-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reference answer <span className="text-gray-400 font-normal">(optional — enables scoring)</span>
                </label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                  placeholder="e.g. Paris"
                  value={correctAnswer}
                  onChange={e => setCorrectAnswer(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">
                  The closest matching answer(s) get +1000 pts. Uses fuzzy matching — typos are OK.
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            {currentIsValid && (
              <button
                onClick={handleAddQuestion}
                className="flex-1 border border-brand-500 text-brand-600 hover:bg-brand-50 font-semibold py-2 rounded-lg transition-colors text-sm"
              >
                + Add Another
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={totalCount === 0}
              className="flex-1 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-semibold py-2 rounded-lg transition-colors"
            >
              Launch{totalCount > 1 ? ` (${totalCount})` : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

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
  imageBase64?: string;
  duration: number;
}

interface CreatePollProps {
  onCreatePoll: (questions: QuestionData[]) => void;
}

export function CreatePoll({ onCreatePoll }: CreatePollProps) {
  const [question, setQuestion] = useState('');
  const [pollType, setPollType] = useState<PollType>('multiple-choice');
  const [options, setOptions] = useState(['', '']);
  const [imageBase64, setImageBase64] = useState<string | undefined>();
  const [imagePreview, setImagePreview] = useState<string | undefined>();
  const [duration, setDuration] = useState(0);
  const [open, setOpen] = useState(false);
  const [queuedQuestions, setQueuedQuestions] = useState<QuestionData[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const addOption = () => setOptions(prev => [...prev, '']);
  const removeOption = (i: number) => setOptions(prev => prev.filter((_, idx) => idx !== i));
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
      return { question: question.trim(), pollType, options: validOptions, imageBase64, duration };
    }
    return { question: question.trim(), pollType, options: [], imageBase64, duration };
  };

  const resetCurrentForm = () => {
    setQuestion('');
    setPollType('multiple-choice');
    setOptions(['', '']);
    setImageBase64(undefined);
    setImagePreview(undefined);
    setDuration(0);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleAddQuestion = () => {
    const current = getCurrentQuestion();
    if (!current) return;
    setQueuedQuestions(prev => [...prev, current]);
    resetCurrentForm();
  };

  const handleSubmit = () => {
    const current = getCurrentQuestion();
    const allQuestions = current ? [...queuedQuestions, current] : queuedQuestions;
    if (allQuestions.length === 0) return;
    onCreatePoll(allQuestions);
    setQueuedQuestions([]);
    resetCurrentForm();
    setOpen(false);
  };

  const removeQueued = (i: number) => setQueuedQuestions(prev => prev.filter((_, idx) => idx !== i));

  const currentIsValid = !!getCurrentQuestion();
  const totalCount = queuedQuestions.length + (currentIsValid ? 1 : 0);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full border-2 border-dashed border-brand-300 hover:border-brand-500 text-brand-500 hover:text-brand-600 rounded-xl py-4 font-medium transition-colors"
      >
        + Create New Poll
      </button>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow p-5 space-y-4 border-2 border-brand-200">
      <h3 className="font-semibold text-gray-800">New Poll</h3>

      {/* Queued questions */}
      {queuedQuestions.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Queue ({queuedQuestions.length})</p>
          {queuedQuestions.map((q, i) => (
            <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
              <span className="text-xs text-gray-400 font-mono w-4">{i + 1}.</span>
              <span className="text-sm text-gray-700 truncate flex-1">{q.question}</span>
              <span className="text-xs text-gray-400 shrink-0">{q.pollType === 'multiple-choice' ? 'MC' : 'Text'}</span>
              <button onClick={() => removeQueued(i)} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
            </div>
          ))}
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs text-gray-500 font-medium">Question {queuedQuestions.length + 1}</p>
          </div>
        </div>
      )}

      {/* Poll type toggle */}
      <div className="flex gap-2">
        {(['multiple-choice', 'open-text'] as PollType[]).map(t => (
          <button
            key={t}
            onClick={() => setPollType(t)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
              pollType === t ? 'bg-brand-500 border-brand-500 text-white' : 'border-gray-300 text-gray-600 hover:border-brand-400'
            }`}
          >
            {t === 'multiple-choice' ? 'Multiple Choice' : 'Open Text'}
          </button>
        ))}
      </div>

      {/* Question */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Question</label>
        <input
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="What do you want to ask?"
          value={question}
          onChange={e => setQuestion(e.target.value)}
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
        <label className="block text-sm font-medium text-gray-700 mb-1">Image (optional)</label>
        {imagePreview ? (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreview} alt="preview" className="h-32 rounded-lg object-cover border border-gray-200" />
            <button
              onClick={removeImage}
              className="absolute top-1 right-1 bg-white rounded-full w-6 h-6 flex items-center justify-center shadow text-gray-500 hover:text-red-500 text-sm"
            >
              ×
            </button>
          </div>
        ) : (
          <label className="flex items-center gap-2 cursor-pointer w-fit border border-dashed border-gray-300 hover:border-brand-400 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-brand-600 transition-colors">
            <span>📷</span> Upload image
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
          </label>
        )}
      </div>

      {/* Options — only for multiple choice */}
      {pollType === 'multiple-choice' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Options</label>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex gap-2">
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
          <button onClick={addOption} className="mt-2 text-sm text-brand-500 hover:text-brand-700">+ Add option</button>
        </div>
      )}

      {pollType === 'open-text' && (
        <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          Participants type a free-text answer. Responses are hidden until you publish them.
        </p>
      )}

      <div className="flex gap-3">
        {currentIsValid && (
          <button
            onClick={handleAddQuestion}
            className="flex-1 border border-brand-500 text-brand-600 hover:bg-brand-50 font-semibold py-2 rounded-lg transition-colors text-sm"
          >
            + Add Question
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={totalCount === 0}
          className="flex-1 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white font-semibold py-2 rounded-lg transition-colors"
        >
          Launch Poll{totalCount > 1 ? ` (${totalCount})` : ''}
        </button>
        <button
          onClick={() => { setOpen(false); setQueuedQuestions([]); resetCurrentForm(); }}
          className="px-4 text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

'use client';

export interface Question {
  id: string;
  text: string;
  author: string;
  upvotes: number;
  upvotedBy: string[];
}

interface QuestionListProps {
  questions: Question[];
  mySocketId?: string;
  isHost?: boolean;
  onUpvote: (id: string) => void;
  onArchive?: (id: string) => void;
}

export function QuestionList({ questions, mySocketId, isHost, onUpvote, onArchive }: QuestionListProps) {
  const sorted = [...questions].sort((a, b) => b.upvotes - a.upvotes);

  if (sorted.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <div className="text-4xl mb-2">💬</div>
        <p>No questions yet. Be the first!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sorted.map((q, idx) => {
        const hasUpvoted = mySocketId ? q.upvotedBy.includes(mySocketId) : false;
        return (
          <div key={q.id} className={`bg-white rounded-xl shadow p-4 flex gap-3 ${idx === 0 ? 'border-l-4 border-brand-500' : ''}`}>
            <button
              onClick={() => onUpvote(q.id)}
              className={`flex flex-col items-center gap-0.5 min-w-[40px] rounded-lg p-2 transition-colors ${
                hasUpvoted ? 'bg-brand-100 text-brand-600' : 'hover:bg-gray-100 text-gray-400'
              }`}
            >
              <span className="text-lg leading-none">▲</span>
              <span className="text-sm font-bold">{q.upvotes}</span>
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-gray-800 leading-relaxed">{q.text}</p>
              <p className="text-xs text-gray-400 mt-1">{q.author}</p>
            </div>
            {isHost && onArchive && (
              <button
                onClick={() => onArchive(q.id)}
                className="text-gray-300 hover:text-red-400 transition-colors self-start text-lg"
                title="Archive question"
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

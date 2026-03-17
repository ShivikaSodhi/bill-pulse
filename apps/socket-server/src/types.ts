export interface PollOption {
  id: string;
  text: string;
  votes: number;
}

export interface TextResponse {
  id: string;
  text: string;
  author: string;
  socketId: string;   // internal — stripped before sending to clients
  createdAt: number;
}

export interface Poll {
  id: string;
  question: string;
  type: 'multiple-choice' | 'open-text';
  options: PollOption[];
  textResponses: TextResponse[];
  imageBase64?: string;
  isActive: boolean;
  isRevealed: boolean;
  responsesPublished: boolean;
  duration: number;
  endsAt?: number;
  revealedAt?: number;
  createdAt: number;
  correctOptionId?: string;
  correctAnswer?: string;          // reference answer for open-text scoring
  scoredResponseIds: string[];     // text response IDs that scored
  userVotes: Record<string, string>;
  userVoteTimes: Record<string, number>;
}

export interface Question {
  id: string;
  text: string;
  author: string;
  upvotes: number;
  upvotedBy: Set<string>;
  createdAt: number;
}

export interface Room {
  code: string;
  hostId: string;
  hostKey: string;
  hostName: string;
  title: string;
  polls: Poll[];
  questions: Question[];
  participants: number;
  participantList: { id: string; name: string }[];
  leaderboard: { id: string; name: string; score: number }[];
  createdAt: number;
}

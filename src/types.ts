export type GameMode = 'ranked' | 'casual' | 'suddendeath' | 'practice';

export type GameState = 'lobby' | 'waiting' | 'countdown' | 'playing' | 'ended';

export interface PlayerProfile {
  id: string;
  name: string;
  avatarUrl: string;
  elo: number;
  rankTitle: string;
  rankBadgeColor: string;
  totalPushups: number;
  wins: number;
  losses: number;
  isHost?: boolean;
  isReady?: boolean;
}

export interface OpponentState {
  id: string;
  name: string;
  avatarUrl: string;
  elo: number;
  rankTitle: string;
  score: number;
  currentDepth: number; // 0 to 100
  isPushingDown: boolean;
  lastRepTimestamp: number;
  reaction?: string;
  isBot?: boolean;
}

export interface GameRoom {
  id: string;
  code: string;
  title?: string;
  hostId: string;
  hostName: string;
  hostAvatar?: string;
  guestId?: string;
  guestName?: string;
  mode: GameMode;
  duration: number; // in seconds (e.g. 60)
  targetReps?: number;
  status: GameState;
  createdAt: number;
}

export interface PushupKeypoints {
  nose?: { x: number; y: number; score: number };
  leftShoulder?: { x: number; y: number; score: number };
  rightShoulder?: { x: number; y: number; score: number };
  leftElbow?: { x: number; y: number; score: number };
  rightElbow?: { x: number; y: number; score: number };
  leftWrist?: { x: number; y: number; score: number };
  rightWrist?: { x: number; y: number; score: number };
  leftHip?: { x: number; y: number; score: number };
  rightHip?: { x: number; y: number; score: number };
  leftKnee?: { x: number; y: number; score: number };
  rightKnee?: { x: number; y: number; score: number };
}

export interface PushupAnalysis {
  state: 'UP' | 'GOING_DOWN' | 'DOWN' | 'PUSHING_UP';
  depthPercentage: number; // 0 to 100
  elbowAngle: number;
  isGoodForm: boolean;
  feedbackText: string;
  repCount: number;
}

export interface FloatingReaction {
  id: string;
  emoji: string;
  sender: 'you' | 'opponent';
  x: number; // percentage
  timestamp: number;
}

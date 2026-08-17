import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Trophy, Flame, RotateCcw, Home, Award, ArrowUpRight, ArrowDownRight, Sparkles } from 'lucide-react';
import { soundEffects } from '../lib/audio';
import { HexAvatar } from './HexAvatar';
import { PlayerProfile, OpponentState } from '../types';

interface MatchEndModalProps {
  myScore: number;
  opponentScore: number;
  myProfile: PlayerProfile;
  opponent: OpponentState;
  onRematch: () => void;
  onExit: () => void;
}

export const MatchEndModal: React.FC<MatchEndModalProps> = ({
  myScore,
  opponentScore,
  myProfile,
  opponent,
  onRematch,
  onExit,
}) => {
  const isWinner = myScore > opponentScore;
  const isTie = myScore === opponentScore;
  const eloDelta = isWinner ? 32 : isTie ? 5 : -18;

  useEffect(() => {
    if (isWinner) {
      soundEffects.playVictoryFanfare();
      // Confetti burst
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
      setTimeout(() => {
        confetti({
          particleCount: 50,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
        });
        confetti({
          particleCount: 50,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
        });
      }, 300);
    }
  }, [isWinner]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-center overflow-hidden">
        {/* Top Glow Accent */}
        <div
          className={`absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full blur-3xl opacity-50 ${
            isWinner ? 'bg-amber-500' : isTie ? 'bg-cyan-500' : 'bg-rose-500'
          }`}
        />

        {/* Victory / Defeat Badge */}
        <div className="relative z-10 flex flex-col items-center">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-3 shadow-lg ${
              isWinner
                ? 'bg-gradient-to-tr from-amber-500 to-yellow-300 text-slate-950 ring-4 ring-amber-400/30'
                : isTie
                ? 'bg-gradient-to-tr from-cyan-500 to-blue-400 text-white'
                : 'bg-gradient-to-tr from-rose-600 to-red-400 text-white'
            }`}
          >
            {isWinner ? (
              <Trophy className="w-9 h-9" />
            ) : isTie ? (
              <Award className="w-9 h-9" />
            ) : (
              <Flame className="w-9 h-9" />
            )}
          </div>

          <h2 className="text-3xl font-black tracking-tight text-white uppercase mb-1">
            {isWinner ? 'VICTORY!' : isTie ? 'DRAW MATCH' : 'DEFEAT'}
          </h2>
          <p className="text-sm font-medium text-slate-400 mb-6">
            {isWinner
              ? '압도적인 푸쉬업 승리! 순위 포인트 획득!'
              : isTie
              ? '치열한 접전! 무승부 기록'
              : '아쉬운 패배! 다시 도전하여 복수하세요!'}
          </p>

          {/* Versus Summary Cards */}
          <div className="w-full grid grid-cols-2 gap-3 bg-slate-950/60 rounded-2xl p-4 border border-slate-800/80 mb-6">
            {/* You */}
            <div className="flex flex-col items-center border-r border-slate-800/80 pr-2">
              <HexAvatar
                name={myProfile.name}
                avatarUrl={myProfile.avatarUrl}
                elo={myProfile.elo}
                side="left"
              />
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-black text-emerald-400">{myScore}</span>
                <span className="text-xs font-bold text-slate-400">REPS</span>
              </div>
              <div className="flex items-center gap-1 text-xs font-bold text-emerald-400 mt-1">
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>+{eloDelta > 0 ? eloDelta : 0} ELO</span>
              </div>
            </div>

            {/* Opponent */}
            <div className="flex flex-col items-center pl-2">
              <HexAvatar
                name={opponent.name}
                avatarUrl={opponent.avatarUrl}
                elo={opponent.elo}
                side="right"
              />
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-black text-rose-500">{opponentScore}</span>
                <span className="text-xs font-bold text-slate-400">REPS</span>
              </div>
              <div className="flex items-center gap-1 text-xs font-bold text-slate-400 mt-1">
                <span>{opponent.elo} ELO</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="w-full flex flex-col sm:flex-row gap-2.5">
            <button
              onClick={onRematch}
              className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-sm tracking-wide shadow-lg shadow-amber-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              재대결 (Rematch)
            </button>
            <button
              onClick={onExit}
              className="py-3 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm border border-slate-700 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Home className="w-4 h-4" />
              로비로 (Lobby)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

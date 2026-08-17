import React from 'react';
import { Shield, Trophy, Flame, Zap, Award } from 'lucide-react';

interface HexAvatarProps {
  name: string;
  avatarUrl?: string;
  elo: number;
  rankTitle?: string;
  side: 'left' | 'right';
  highlight?: boolean;
}

export function getRankTier(elo: number): { title: string; color: string; bgGradient: string; icon: typeof Shield } {
  if (elo >= 3500) {
    return { title: 'Grandmaster', color: '#EC4899', bgGradient: 'from-amber-400 via-rose-500 to-purple-600', icon: Trophy };
  } else if (elo >= 2800) {
    return { title: 'Master', color: '#A855F7', bgGradient: 'from-purple-500 to-indigo-600', icon: Flame };
  } else if (elo >= 2000) {
    return { title: 'Diamond', color: '#38BDF8', bgGradient: 'from-cyan-400 to-blue-600', icon: Zap };
  } else if (elo >= 1500) {
    return { title: 'Platinum', color: '#34D399', bgGradient: 'from-emerald-400 to-teal-600', icon: Shield };
  } else if (elo >= 1000) {
    return { title: 'Gold', color: '#FBBF24', bgGradient: 'from-yellow-400 to-amber-600', icon: Award };
  } else {
    return { title: 'Silver', color: '#94A3B8', bgGradient: 'from-slate-400 to-slate-600', icon: Shield };
  }
}

export const HexAvatar: React.FC<HexAvatarProps> = ({
  name,
  avatarUrl,
  elo,
  rankTitle,
  side,
  highlight = false,
}) => {
  const rank = getRankTier(elo);
  const RankIcon = rank.icon;
  const isLeft = side === 'left';

  // Default avatars if none provided
  const displayImage = avatarUrl || (
    isLeft
      ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=160&auto=format&fit=crop&q=80'
      : 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=160&auto=format&fit=crop&q=80'
  );

  return (
    <div className={`flex flex-col items-center select-none ${isLeft ? 'text-left' : 'text-right'}`}>
      {/* Hexagon Wrapper */}
      <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center">
        {/* Outer Glowing Hexagon Frame */}
        <div
          className={`absolute inset-0 bg-gradient-to-b ${
            isLeft
              ? 'from-emerald-400 via-teal-500 to-cyan-600 shadow-[0_0_15px_rgba(16,185,129,0.5)]'
              : 'from-amber-400 via-rose-500 to-purple-600 shadow-[0_0_15px_rgba(244,63,94,0.5)]'
          } ${highlight ? 'scale-105 animate-pulse' : ''} transition-all duration-300`}
          style={{
            clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)',
          }}
        />

        {/* Inner Dark Background */}
        <div
          className="absolute inset-[2.5px] bg-slate-950 flex items-center justify-center overflow-hidden"
          style={{
            clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)',
          }}
        >
          <img
            src={displayImage}
            alt={name}
            className="w-full h-full object-cover object-center"
            crossOrigin="anonymous"
          />
        </div>

        {/* Rank Badge Shield on bottom corner */}
        <div
          className={`absolute -bottom-1 ${
            isLeft ? '-right-1' : '-right-1'
          } w-7 h-7 rounded-full bg-gradient-to-tr ${rank.bgGradient} p-0.5 shadow-lg flex items-center justify-center text-white ring-2 ring-slate-900 z-10`}
          title={`${rankTitle || rank.title} (${elo} ELO)`}
        >
          <RankIcon className="w-3.5 h-3.5" />
        </div>
      </div>

      {/* Name and ELO */}
      <div className="mt-1.5 flex flex-col items-center">
        <span className="text-sm sm:text-base font-bold text-white tracking-wide drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          {name}
        </span>
        <span className="text-[11px] sm:text-xs font-semibold text-slate-300 tracking-wider">
          {elo} ELO
        </span>
      </div>
    </div>
  );
};

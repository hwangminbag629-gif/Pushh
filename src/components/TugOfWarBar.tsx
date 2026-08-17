import React from 'react';

interface TugOfWarBarProps {
  myScore: number;
  opponentScore: number;
  myDepth?: number; // 0-100 current pushup depth
  opponentDepth?: number;
}

export const TugOfWarBar: React.FC<TugOfWarBarProps> = ({
  myScore,
  opponentScore,
  myDepth = 0,
  opponentDepth = 0,
}) => {
  // Calculate tug-of-war ratio
  // Base 50% when equal. Each rep gives +/- 5% shift, capped between 10% and 90%
  const repDiff = myScore - opponentScore;
  const depthDiff = (myDepth - opponentDepth) * 0.03; // Slight live visual twitch during rep
  const rawPercentage = 50 + repDiff * 6 + depthDiff;
  const clampedPercentage = Math.max(8, Math.min(92, rawPercentage));

  return (
    <div className="w-full flex items-center justify-between gap-3 px-3 py-1 select-none">
      {/* Left (My) Big Neon Green Score */}
      <div className="w-12 text-left">
        <span className="text-4xl sm:text-5xl font-black text-emerald-400 tracking-tighter drop-shadow-[0_0_12px_rgba(52,211,153,0.8)]">
          {myScore}
        </span>
      </div>

      {/* Center Tug Of War Momentum Bar */}
      <div className="flex-1 max-w-sm mx-auto relative flex items-center">
        {/* Track container */}
        <div className="w-full h-3 sm:h-3.5 bg-slate-900/90 rounded-full p-0.5 border border-slate-700/60 shadow-inner flex overflow-hidden relative">
          {/* Green segment (Player) */}
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-green-400 rounded-l-full transition-all duration-300 ease-out shadow-[0_0_10px_rgba(34,197,94,0.6)]"
            style={{ width: `${clampedPercentage}%` }}
          />

          {/* Red segment (Opponent) */}
          <div
            className="h-full bg-gradient-to-r from-rose-500 to-red-600 rounded-r-full transition-all duration-300 ease-out shadow-[0_0_10px_rgba(239,68,68,0.6)]"
            style={{ width: `${100 - clampedPercentage}%` }}
          />

          {/* Center Glowing Diamond Split Marker */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-[0_0_8px_#ffffff,0_0_15px_rgba(255,255,255,0.9)] transition-all duration-300 ease-out z-10 border border-slate-300"
            style={{ left: `${clampedPercentage}%` }}
          />
        </div>
      </div>

      {/* Right (Opponent) Big Neon Red Score */}
      <div className="w-12 text-right">
        <span className="text-4xl sm:text-5xl font-black text-rose-500 tracking-tighter drop-shadow-[0_0_12px_rgba(244,63,94,0.8)]">
          {opponentScore}
        </span>
      </div>
    </div>
  );
};

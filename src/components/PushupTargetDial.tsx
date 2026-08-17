import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PushupAnalysis } from '../types';

interface PushupTargetDialProps {
  repCount: number;
  analysis: PushupAnalysis | null;
  onManualTap?: () => void;
}

export const PushupTargetDial: React.FC<PushupTargetDialProps> = ({
  repCount,
  analysis,
  onManualTap,
}) => {
  const depth = analysis?.depthPercentage || 0;
  const isDown = analysis?.state === 'DOWN';
  const isPushingUp = analysis?.state === 'PUSHING_UP';
  const isGoingDown = analysis?.state === 'GOING_DOWN';

  return (
    <div className="relative flex flex-col items-center justify-center select-none">
      {/* Visual Target Container */}
      <div
        className="relative w-36 h-28 sm:w-44 sm:h-32 flex items-end justify-center cursor-pointer group"
        onClick={onManualTap}
        title="화면 탭으로도 푸쉬업 카운트 가능 (Click or Tap to test rep)"
      >
        {/* Outer Halo / Golden Arcs */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {/* Animated concentric ring */}
          <div
            className={`w-36 h-36 sm:w-44 sm:h-44 rounded-full border-4 ${
              isDown
                ? 'border-emerald-400 scale-105 shadow-[0_0_25px_rgba(52,211,153,0.8)]'
                : isPushingUp
                ? 'border-amber-300 scale-100 shadow-[0_0_20px_rgba(251,191,36,0.6)]'
                : 'border-amber-400/80'
            } transition-all duration-150 flex items-center justify-center`}
          >
            {/* Top decorative notches / dots on the ring */}
            <div className="absolute top-2 w-3 h-3 rounded-full bg-amber-300 border-2 border-slate-900 shadow-sm" />
            <div className="absolute top-5 left-8 w-2.5 h-2.5 rounded-full bg-amber-300 border-2 border-slate-900 shadow-sm" />
            <div className="absolute top-5 right-8 w-2.5 h-2.5 rounded-full bg-amber-300 border-2 border-slate-900 shadow-sm" />
          </div>
        </div>

        {/* Semi-circular Base / Yellow Dome */}
        <motion.div
          key={repCount}
          initial={{ scale: 0.92 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          className={`relative w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-gradient-to-b from-amber-400 to-amber-500 border-4 border-slate-950 shadow-[0_4px_25px_rgba(245,158,11,0.6)] flex items-center justify-center overflow-hidden transition-transform duration-100 group-active:scale-95`}
        >
          {/* Dynamic Depth Fill Indicator overlay from bottom to top */}
          <div
            className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-emerald-500/80 to-emerald-400/40 pointer-events-none transition-all duration-75"
            style={{ height: `${depth}%` }}
          />

          {/* Golden Highlight Arc */}
          <div className="absolute top-2 inset-x-4 h-6 rounded-full bg-white/25 blur-[1px] pointer-events-none" />

          {/* Large Rep Number inside */}
          <AnimatePresence mode="popLayout">
            <motion.span
              key={repCount}
              initial={{ y: 15, opacity: 0, scale: 0.7 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -15, opacity: 0, scale: 1.2 }}
              transition={{ duration: 0.15 }}
              className="relative z-10 text-5xl sm:text-6xl font-black text-slate-950 tracking-tighter"
            >
              {repCount}
            </motion.span>
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Real-time State & Depth Feedback Badge */}
      <div className="mt-2 flex flex-col items-center gap-1">
        <span
          className={`px-3 py-0.5 rounded-full text-xs font-extrabold uppercase tracking-wide transition-all ${
            isDown
              ? 'bg-emerald-500 text-slate-950 animate-bounce shadow-md'
              : isGoingDown
              ? 'bg-amber-400 text-slate-950'
              : isPushingUp
              ? 'bg-cyan-400 text-slate-950'
              : 'bg-black/60 text-amber-300 backdrop-blur-md border border-amber-400/30'
          }`}
        >
          {analysis?.feedbackText || '자세를 잡고 내려가세요'}
        </span>
      </div>
    </div>
  );
};

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FloatingReaction } from '../types';

interface ReactionOverlayProps {
  reactions?: FloatingReaction[];
}

export const ReactionOverlay: React.FC<ReactionOverlayProps> = ({
  reactions = [],
}) => {
  if (!reactions.length) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
      <AnimatePresence>
        {reactions.map((r) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 1, y: '80%', x: `${r.x}%`, scale: 0.6 }}
            animate={{
              opacity: 0,
              y: '15%',
              x: `${r.x + (Math.sin(r.timestamp) * 15)}%`,
              scale: 1.3,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.8, ease: 'easeOut' }}
            className="absolute text-4xl filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)]"
          >
            {r.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

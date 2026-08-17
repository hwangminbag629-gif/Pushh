import React, { useState, useEffect } from 'react';
import { LobbyView } from './components/LobbyView';
import { BattleView } from './components/BattleView';
import { PracticeModal } from './components/PracticeModal';
import { PlayerProfile, GameRoom, OpponentState } from './types';

const randomNum = Math.floor(1000 + Math.random() * 9000);
const DEFAULT_PROFILE: PlayerProfile = {
  id: 'player_you_' + randomNum,
  name: `User #${randomNum}`,
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=160&auto=format&fit=crop&q=80',
  elo: 1247,
  rankTitle: 'Gold',
  rankBadgeColor: '#FBBF24',
  totalPushups: 142,
  wins: 18,
  losses: 7,
};

export default function App() {
  const [profile, setProfile] = useState<PlayerProfile>(() => {
    try {
      const saved = localStorage.getItem('pushup_user_profile');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      // ignore
    }
    return DEFAULT_PROFILE;
  });

  const [currentView, setCurrentView] = useState<'lobby' | 'battle'>('lobby');
  const [activeRoom, setActiveRoom] = useState<GameRoom | null>(null);
  const [activeOpponent, setActiveOpponent] = useState<OpponentState | null>(null);
  const [showPractice, setShowPractice] = useState(false);

  // Save profile changes to local storage
  const handleUpdateProfile = (newProfile: PlayerProfile) => {
    setProfile(newProfile);
    try {
      localStorage.setItem('pushup_user_profile', JSON.stringify(newProfile));
    } catch (e) {
      // ignore
    }
  };

  // Start Match
  const handleStartMatch = (room: GameRoom, opponent: OpponentState) => {
    setActiveRoom(room);
    setActiveOpponent(opponent);
    setCurrentView('battle');
  };

  // Exit Match
  const handleExitMatch = () => {
    setCurrentView('lobby');
    setActiveRoom(null);
    setActiveOpponent(null);
  };

  return (
    <div className="w-full min-h-screen bg-white">
      {currentView === 'lobby' && (
        <LobbyView
          myProfile={profile}
          onUpdateProfile={handleUpdateProfile}
          onStartMatch={handleStartMatch}
          onOpenPractice={() => setShowPractice(true)}
        />
      )}

      {currentView === 'battle' && activeRoom && activeOpponent && (
        <BattleView
          room={activeRoom}
          myProfile={profile}
          opponent={activeOpponent}
          onExit={handleExitMatch}
        />
      )}

      {showPractice && (
        <PracticeModal onClose={() => setShowPractice(false)} />
      )}
    </div>
  );
}

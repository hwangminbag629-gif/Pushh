import React, { useState, useEffect } from 'react';
import { 
  Flame, 
  Trophy, 
  PlusCircle, 
  LogIn, 
  Camera, 
  Copy, 
  Check, 
  Dumbbell, 
  Settings,
  Swords,
  Timer,
  RefreshCw,
  DoorOpen,
  Radio,
  Clock
} from 'lucide-react';
import { PlayerProfile, GameRoom, GameMode, OpponentState } from '../types';
import { getRankTier } from './HexAvatar';
import { supabase } from '../lib/supabase';

interface LobbyViewProps {
  myProfile: PlayerProfile;
  onUpdateProfile: (profile: PlayerProfile) => void;
  onStartMatch: (room: GameRoom, opponent: OpponentState) => void;
  onOpenPractice: () => void;
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  myProfile,
  onUpdateProfile,
  onStartMatch,
  onOpenPractice,
}) => {
  const [activeTab, setActiveTab] = useState<'rooms' | 'create' | 'join'>('rooms');
  const [roomTitle, setRoomTitle] = useState(`${myProfile.name}의 푸쉬업 방`);
  const [roomDuration, setRoomDuration] = useState<number>(60);
  const [roomMode, setRoomMode] = useState<GameMode>('ranked');
  const [joinCode, setJoinCode] = useState('');
  const [createdRoom, setCreatedRoom] = useState<GameRoom | null>(null);
  const [copied, setCopied] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState(myProfile.name);
  const [editAvatar, setEditAvatar] = useState(myProfile.avatarUrl);

  // Active public rooms list synced via Supabase Realtime
  const [activeRooms, setActiveRooms] = useState<GameRoom[]>([]);
  const [isRefreshingRooms, setIsRefreshingRooms] = useState(false);

  const rankTier = getRankTier(myProfile.elo);
  const RankIcon = rankTier.icon;

  const avatarOptions = [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=160&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=160&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=160&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=160&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=160&auto=format&fit=crop&q=80',
  ];

  // Subscribe to public rooms discovery channel
  useEffect(() => {
    const channel = supabase.channel('pushup_public_rooms_discovery', {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'room_announced' }, ({ payload }) => {
        if (!payload || !payload.id) return;
        setActiveRooms((prev) => {
          const filtered = prev.filter((r) => r.id !== payload.id);
          return [payload, ...filtered].slice(0, 15);
        });
      })
      .on('broadcast', { event: 'room_closed' }, ({ payload }) => {
        if (!payload || !payload.id) return;
        setActiveRooms((prev) => prev.filter((r) => r.id !== payload.id));
      })
      .on('broadcast', { event: 'request_room_list' }, () => {
        // If I am hosting a waiting room, broadcast it back
        if (createdRoom) {
          channel.send({
            type: 'broadcast',
            event: 'room_announced',
            payload: createdRoom,
          });
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Ask any active hosts to broadcast their room
          channel.send({
            type: 'broadcast',
            event: 'request_room_list',
            payload: {},
          });
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [createdRoom]);

  // Periodic heartbeat if hosting a room
  useEffect(() => {
    if (!createdRoom) return;

    const interval = setInterval(() => {
      const channel = supabase.channel('pushup_public_rooms_discovery');
      channel.send({
        type: 'broadcast',
        event: 'room_announced',
        payload: createdRoom,
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [createdRoom]);

  // Request refresh of active rooms
  const handleRefreshRooms = () => {
    setIsRefreshingRooms(true);
    const channel = supabase.channel('pushup_public_rooms_discovery');
    channel.send({
      type: 'broadcast',
      event: 'request_room_list',
      payload: {},
    });
    setTimeout(() => setIsRefreshingRooms(false), 800);
  };

  // Handle Room Creation with custom Title
  const handleCreateRoom = () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const finalTitle = roomTitle.trim() || `${myProfile.name}의 푸쉬업 방`;
    const newRoom: GameRoom = {
      id: `room_${code}`,
      code,
      title: finalTitle,
      hostId: myProfile.id,
      hostName: myProfile.name,
      hostAvatar: myProfile.avatarUrl,
      mode: roomMode,
      duration: roomDuration,
      status: 'waiting',
      createdAt: Date.now(),
    };
    setCreatedRoom(newRoom);

    // Announce to public discovery
    const discoveryChannel = supabase.channel('pushup_public_rooms_discovery');
    discoveryChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        discoveryChannel.send({
          type: 'broadcast',
          event: 'room_announced',
          payload: newRoom,
        });
      }
    });

    // Listen on private room channel for guest joining
    const roomChannel = supabase.channel(`room_${code}`);
    roomChannel
      .on('broadcast', { event: 'player_joined' }, ({ payload }) => {
        // A player joined! Start match immediately
        const opponentState: OpponentState = {
          id: payload.id || 'guest_player',
          name: payload.name || 'Guest',
          avatarUrl: payload.avatarUrl || 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=160&auto=format&fit=crop&q=80',
          elo: payload.elo || 1200,
          rankTitle: payload.rankTitle || 'Gold',
          score: 0,
          currentDepth: 0,
          isPushingDown: false,
          lastRepTimestamp: Date.now(),
          isBot: false,
        };

        // Notify discovery that room is closed
        discoveryChannel.send({
          type: 'broadcast',
          event: 'room_closed',
          payload: { id: newRoom.id },
        });

        onStartMatch(newRoom, opponentState);
      })
      .subscribe();
  };

  // Handle Joining a Room from the Live List or via Code
  const handleJoinSpecificRoom = (targetRoom: GameRoom) => {
    const roomChannel = supabase.channel(`room_${targetRoom.code}`);
    roomChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        roomChannel.send({
          type: 'broadcast',
          event: 'player_joined',
          payload: {
            id: myProfile.id,
            name: myProfile.name,
            avatarUrl: myProfile.avatarUrl,
            elo: myProfile.elo,
            rankTitle: myProfile.rankTitle,
          },
        });
      }
    });

    const opponentState: OpponentState = {
      id: targetRoom.hostId,
      name: targetRoom.hostName,
      avatarUrl: targetRoom.hostAvatar || 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=160&auto=format&fit=crop&q=80',
      elo: 1250,
      rankTitle: 'Gold',
      score: 0,
      currentDepth: 0,
      isPushingDown: false,
      lastRepTimestamp: Date.now(),
      isBot: false,
    };

    onStartMatch(targetRoom, opponentState);
  };

  // Handle Join by 6-digit Code
  const handleJoinByCode = () => {
    if (!joinCode.trim()) return;
    const cleanCode = joinCode.trim();
    const manualRoom: GameRoom = {
      id: `room_${cleanCode}`,
      code: cleanCode,
      title: `대결 방 #${cleanCode}`,
      hostId: 'host_player',
      hostName: '방장',
      mode: 'ranked',
      duration: 60,
      status: 'playing',
      createdAt: Date.now(),
    };
    handleJoinSpecificRoom(manualRoom);
  };

  const handleCopyCode = () => {
    if (createdRoom) {
      navigator.clipboard.writeText(createdRoom.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSaveProfile = () => {
    onUpdateProfile({
      ...myProfile,
      name: editName.trim() || myProfile.name,
      avatarUrl: editAvatar,
    });
    setIsEditingProfile(false);
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans flex flex-col">
      {/* Header */}
      <header className="w-full bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-400 flex items-center justify-center text-slate-950 shadow-md shadow-amber-500/20">
              <Dumbbell className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-1.5">
                PUSHUP CLASH <span className="text-amber-600 text-xs px-1.5 py-0.5 rounded bg-amber-50 font-bold border border-amber-200">1v1 PvP</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium">카메라 AI 푸쉬업 실시간 대결</p>
            </div>
          </div>

          {/* User Nickname / Profile */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsEditingProfile(true)}
              className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-slate-50 border border-slate-200 hover:border-slate-300 hover:bg-slate-100 transition-all text-left"
            >
              <div className="relative w-8 h-8 rounded-full overflow-hidden border border-slate-300">
                <img src={myProfile.avatarUrl} alt={myProfile.name} className="w-full h-full object-cover" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-black text-slate-900 leading-tight">{myProfile.name}</span>
                <span className="text-[10px] font-extrabold text-amber-600 flex items-center gap-1">
                  <RankIcon className="w-2.5 h-2.5" />
                  {myProfile.elo} ELO
                </span>
              </div>
              <Settings className="w-3.5 h-3.5 text-slate-400 ml-1" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-6">
        {/* Banner Hero */}
        <div className="relative w-full rounded-3xl bg-gradient-to-br from-slate-900 via-slate-850 to-slate-950 text-white p-6 sm:p-7 overflow-hidden shadow-xl">
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-400/30 text-amber-300 text-xs font-black tracking-wide mb-2.5">
                <Flame className="w-3.5 h-3.5 fill-amber-400" />
                실시간 1:1 푸쉬업 배틀
              </div>
              <h2 className="text-2xl font-black tracking-tight mb-1">
                실제 친구와 카메라로 푸쉬업 대결!
              </h2>
              <p className="text-xs text-slate-300 max-w-md leading-relaxed">
                방을 생성하거나 서버에 열려있는 방에 즉시 입장하여 실시간 카메라 푸쉬업 대결을 시작하세요.
              </p>
            </div>

            <button
              onClick={onOpenPractice}
              className="self-start sm:self-center px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs border border-white/20 active:scale-95 transition-all flex items-center gap-2 backdrop-blur-md shrink-0"
            >
              <Camera className="w-4 h-4 text-emerald-400" />
              카메라 인식 테스트
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <button
            onClick={() => setActiveTab('rooms')}
            className={`px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shrink-0 ${
              activeTab === 'rooms'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Radio className="w-4 h-4 text-amber-400" />
            실시간 방 목록 ({activeRooms.length})
          </button>

          <button
            onClick={() => setActiveTab('create')}
            className={`px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shrink-0 ${
              activeTab === 'create'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <PlusCircle className="w-4 h-4 text-amber-400" />
            방 생성하기
          </button>

          <button
            onClick={() => setActiveTab('join')}
            className={`px-4 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shrink-0 ${
              activeTab === 'join'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <LogIn className="w-4 h-4 text-amber-400" />
            코드로 참가
          </button>
        </div>

        {/* TAB 1: Real-time Live Rooms List */}
        {activeTab === 'rooms' && (
          <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  현재 서버에 열려있는 방
                </h3>
                <p className="text-xs text-slate-500">입장 버튼을 누르면 상대방과 즉시 대결이 시작됩니다.</p>
              </div>

              <button
                onClick={handleRefreshRooms}
                disabled={isRefreshingRooms}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingRooms ? 'animate-spin text-amber-600' : ''}`} />
                새로고침
              </button>
            </div>

            {/* Room List */}
            {activeRooms.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-2">
                {activeRooms.map((room) => (
                  <div
                    key={room.id}
                    className="p-4 rounded-2xl border border-slate-200 hover:border-amber-400 bg-white hover:shadow-md transition-all flex items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 font-black text-xs shrink-0">
                        <Swords className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-black text-slate-900 truncate">
                          {room.title || `방 #${room.code}`}
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                          <span className="font-semibold text-slate-700">{room.hostName}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {room.duration}초
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleJoinSpecificRoom(room)}
                      className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shrink-0 flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                    >
                      <DoorOpen className="w-3.5 h-3.5 text-amber-400" />
                      입장하기
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 px-4 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                  <Radio className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-800 mb-1">대기 중인 방이 없습니다</h4>
                <p className="text-xs text-slate-500 mb-4">직접 방을 만들고 친구를 초대해보세요!</p>
                <button
                  onClick={() => setActiveTab('create')}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                >
                  <PlusCircle className="w-3.5 h-3.5 text-amber-400" />
                  새 방 만들기
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Create Game Room */}
        {activeTab === 'create' && (
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
            <h3 className="text-lg font-black text-slate-900 mb-1">게임 방 생성</h3>
            <p className="text-xs text-slate-500 mb-6">방 이름과 대결 규칙을 설정하여 방을 생성합니다.</p>

            {/* Room Name Input */}
            <div className="mb-5">
              <label className="block text-xs font-bold text-slate-700 uppercase mb-2">
                방 이름 (Room Name)
              </label>
              <input
                type="text"
                value={roomTitle}
                onChange={(e) => setRoomTitle(e.target.value)}
                placeholder="예: 푸쉬업 60초 진검승부!"
                maxLength={25}
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-300 font-bold text-sm text-slate-900 focus:outline-none focus:border-slate-900 focus:bg-white transition-all"
              />
            </div>

            {/* Match Duration Selection */}
            <div className="mb-5">
              <label className="block text-xs font-bold text-slate-700 uppercase mb-2 flex items-center gap-1.5">
                <Timer className="w-3.5 h-3.5 text-amber-500" />
                대결 시간
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { sec: 30, label: '30초 (스프린트)', desc: '폭발적 스피드' },
                  { sec: 60, label: '60초 (정규전)', desc: '공식 랭크 기준' },
                  { sec: 90, label: '90초 (지구력전)', desc: '한계 돌파' },
                ].map((item) => (
                  <button
                    key={item.sec}
                    type="button"
                    onClick={() => setRoomDuration(item.sec)}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      roomDuration === item.sec
                        ? 'border-amber-500 bg-amber-50/60 ring-2 ring-amber-500/20'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <span className="block text-sm font-black text-slate-900">{item.label}</span>
                    <span className="block text-[11px] text-slate-500 mt-0.5">{item.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Match Mode Selection */}
            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-700 uppercase mb-2 flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-amber-500" />
                대결 모드
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRoomMode('ranked')}
                  className={`p-3.5 rounded-2xl border text-left transition-all ${
                    roomMode === 'ranked'
                      ? 'border-amber-500 bg-amber-50/60 ring-2 ring-amber-500/20'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <span className="block text-sm font-black text-slate-900">🔥 랭크 대결 (Ranked)</span>
                  <span className="block text-[11px] text-slate-500 mt-0.5">승패 시 ELO 점수 변동</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRoomMode('casual')}
                  className={`p-3.5 rounded-2xl border text-left transition-all ${
                    roomMode === 'casual'
                      ? 'border-amber-500 bg-amber-50/60 ring-2 ring-amber-500/20'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <span className="block text-sm font-black text-slate-900">🎮 친선 경기 (Casual)</span>
                  <span className="block text-[11px] text-slate-500 mt-0.5">부담 없는 자유 경기</span>
                </button>
              </div>
            </div>

            {/* Create Room Button or Waiting Room Display */}
            {!createdRoom ? (
              <button
                onClick={handleCreateRoom}
                className="w-full py-4 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black text-sm tracking-wide shadow-md active:scale-98 transition-all flex items-center justify-center gap-2"
              >
                <PlusCircle className="w-4 h-4 text-amber-400" />
                방 생성하고 대기하기
              </button>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-sm font-black text-slate-900">{createdRoom.title}</h4>
                    <span className="text-xs text-slate-500">방 번호 코드 (6자리)</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold animate-pulse">
                    친구 접속 대기 중...
                  </span>
                </div>

                <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-3 mb-3">
                  <span className="text-2xl font-black tracking-widest text-slate-900">{createdRoom.code}</span>
                  <button
                    onClick={handleCopyCode}
                    className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? '복사됨!' : '코드 복사'}
                  </button>
                </div>

                <p className="text-xs text-slate-500 text-center">
                  친구가 실시간 방 목록에서 입장하거나 6자리 코드를 입력하면 즉시 게임이 시작됩니다.
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Join Room with 6-digit Code */}
        {activeTab === 'join' && (
          <div className="max-w-md mx-auto w-full bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-900 mx-auto mb-4">
              <LogIn className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-1">방 코드로 참가하기</h3>
            <p className="text-xs text-slate-500 mb-6">친구가 알려준 6자리 코드를 입력하세요.</p>

            <input
              type="text"
              maxLength={6}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="000000"
              className="w-full text-center tracking-[0.5em] text-3xl font-black text-slate-900 py-3.5 px-4 bg-slate-50 border border-slate-300 rounded-2xl focus:outline-none focus:border-slate-900 focus:bg-white transition-all mb-4"
            />

            <button
              onClick={handleJoinByCode}
              disabled={joinCode.length < 6}
              className="w-full py-4 rounded-2xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-black text-sm tracking-wide shadow-md active:scale-98 transition-all flex items-center justify-center gap-2"
            >
              <Swords className="w-4 h-4 text-amber-400" />
              대결 방 입장하기
            </button>
          </div>
        )}
      </main>

      {/* Profile Edit Modal */}
      {isEditingProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl border border-slate-200">
            <h3 className="text-lg font-black text-slate-900 mb-1">닉네임 및 프로필 변경</h3>
            <p className="text-xs text-slate-500 mb-4">대결 시 표시될 숫자 닉네임과 아바타를 변경합니다.</p>

            {/* Avatar Selector */}
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-700 mb-2">아바타 선택</label>
              <div className="flex items-center justify-center gap-2">
                {avatarOptions.map((url, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setEditAvatar(url)}
                    className={`w-10 h-10 rounded-full overflow-hidden border-2 transition-transform ${
                      editAvatar === url ? 'border-amber-500 scale-110 shadow-md' : 'border-slate-200 opacity-70'
                    }`}
                  >
                    <img src={url} alt={`Avatar ${idx}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            {/* Nickname Input */}
            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">닉네임 (숫자 또는 이름)</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={14}
                placeholder="예: User #1024"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-sm font-bold focus:outline-none focus:border-slate-900"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSaveProfile}
                className="flex-1 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs"
              >
                저장하기
              </button>
              <button
                onClick={() => setIsEditingProfile(false)}
                className="py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

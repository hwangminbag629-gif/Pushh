import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { 
  Camera, 
  Volume2, 
  VolumeX, 
  ArrowLeft, 
  RefreshCw, 
  Sparkles, 
  Eye, 
  AlertCircle,
  VideoOff,
  Flame
} from 'lucide-react';
import { HexAvatar } from './HexAvatar';
import { TugOfWarBar } from './TugOfWarBar';
import { PushupTargetDial } from './PushupTargetDial';
import { ReactionOverlay } from './ReactionOverlay';
import { MatchEndModal } from './MatchEndModal';
import { soundEffects } from '../lib/audio';
import { 
  getPoseDetector, 
  PushupTracker, 
  drawPoseSkeleton, 
  calculateAngle,
  mapPoseKeypoints 
} from '../lib/poseDetector';
import { supabase } from '../lib/supabase';
import { 
  PlayerProfile, 
  OpponentState, 
  GameRoom, 
  PushupAnalysis, 
  FloatingReaction,
  PushupKeypoints 
} from '../types';

interface BattleViewProps {
  room: GameRoom;
  myProfile: PlayerProfile;
  opponent: OpponentState;
  onExit: () => void;
}

export const BattleView: React.FC<BattleViewProps> = ({
  room,
  myProfile,
  opponent: initialOpponent,
  onExit,
}) => {
  const [opponent, setOpponent] = useState<OpponentState>(initialOpponent);
  const [myScore, setMyScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(room.duration || 60);
  const [countdown, setCountdown] = useState<number | null>(3);
  const [gameStarted, setGameStarted] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const [soundMuted, setSoundMuted] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [analysis, setAnalysis] = useState<PushupAnalysis | null>(null);
  const [floatingSubtitle, setFloatingSubtitle] = useState('I thought bro would lose 😭');
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);

  // Refs for video & canvas
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const trackerRef = useRef<PushupTracker>(new PushupTracker());
  const animationFrameId = useRef<number | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const botIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const prevMyScore = useRef(0);
  const prevOpponentScore = useRef(0);

  // WebRTC ICE Servers configuration
  const RTC_CONFIG: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ],
  };

  // Sound toggle
  const toggleSound = () => {
    soundEffects.enabled = !soundEffects.enabled;
    setSoundMuted(!soundEffects.enabled);
  };

  // Trigger floating reaction
  const triggerReaction = useCallback((emoji: string, sender: 'you' | 'opponent' = 'you') => {
    const newReaction: FloatingReaction = {
      id: Math.random().toString(36).substring(2, 9),
      emoji,
      sender,
      x: 15 + Math.random() * 70,
      timestamp: Date.now(),
    };
    setReactions((prev) => [...prev.slice(-15), newReaction]);
    soundEffects.playPop();

    // Broadcast to Supabase
    if (channelRef.current && sender === 'you') {
      channelRef.current.send({
        type: 'broadcast',
        event: 'reaction',
        payload: { emoji, sender: myProfile.id },
      });
    }
  }, [myProfile.id]);

  // Send message
  const handleSendMessage = (text: string) => {
    setFloatingSubtitle(text);
    triggerReaction('💬');
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'chat',
        payload: { text, sender: myProfile.name },
      });
    }
  };

  // Manual rep trigger for desktop testing or fallback
  const handleManualRep = () => {
    if (!gameStarted || isGameOver) return;
    const newCount = trackerRef.current.manualIncrementRep();
    setMyScore(newCount);
    soundEffects.playRepChime();
    triggerReaction('💪');

    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'score_update',
        payload: { score: newCount, depth: 0, state: 'UP' },
      });
    }
  };

  // Helper to initialize or get RTCPeerConnection
  const setupPeerConnection = useCallback((stream: MediaStream) => {
    if (peerConnectionRef.current) return peerConnectionRef.current;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnectionRef.current = pc;

    // Add local tracks to send to opponent
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    // When remote track arrives, attach to opponent's video element
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
          remoteVideoRef.current.play().catch(() => {});
        }
        setHasRemoteVideo(true);
      }
    };

    // Send ICE candidate to opponent via Supabase broadcast
    pc.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'webrtc_candidate',
          payload: { candidate: event.candidate, sender: myProfile.id },
        });
      }
    };

    return pc;
  }, [myProfile.id]);

  // Setup Supabase Realtime Channel and WebRTC signaling
  useEffect(() => {
    const channel = supabase.channel(`room_${room.code}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'score_update' }, ({ payload }) => {
        setOpponent((prev) => ({
          ...prev,
          score: payload.score,
          currentDepth: payload.depth,
          isPushingDown: payload.state === 'DOWN',
          lastRepTimestamp: Date.now(),
        }));
      })
      .on('broadcast', { event: 'reaction' }, ({ payload }) => {
        triggerReaction(payload.emoji, 'opponent');
      })
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        setFloatingSubtitle(payload.text);
      })
      .on('broadcast', { event: 'webrtc_ready' }, async () => {
        // Opponent is ready for WebRTC; if we are the host (or initiated), create offer
        if (localStreamRef.current && room.hostId === myProfile.id) {
          const pc = setupPeerConnection(localStreamRef.current);
          const offer = await pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: false });
          await pc.setLocalDescription(offer);
          channel.send({
            type: 'broadcast',
            event: 'webrtc_offer',
            payload: { sdp: offer, sender: myProfile.id },
          });
        }
      })
      .on('broadcast', { event: 'webrtc_offer' }, async ({ payload }) => {
        if (!payload.sdp || payload.sender === myProfile.id) return;
        if (localStreamRef.current) {
          const pc = setupPeerConnection(localStreamRef.current);
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          channel.send({
            type: 'broadcast',
            event: 'webrtc_answer',
            payload: { sdp: answer, sender: myProfile.id },
          });
        }
      })
      .on('broadcast', { event: 'webrtc_answer' }, async ({ payload }) => {
        if (!payload.sdp || payload.sender === myProfile.id) return;
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        }
      })
      .on('broadcast', { event: 'webrtc_candidate' }, async ({ payload }) => {
        if (!payload.candidate || payload.sender === myProfile.id) return;
        try {
          if (peerConnectionRef.current) {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
          }
        } catch {
          // ignore potential candidate race conditions
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Notify that we joined and camera stream is ready for P2P video
          channel.send({
            type: 'broadcast',
            event: 'webrtc_ready',
            payload: { sender: myProfile.id },
          });
        }
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
    };
  }, [room.code, room.hostId, myProfile.id, setupPeerConnection, triggerReaction]);

  // Bot Simulation if opponent is Bot (like Pedro 3924 ELO from screenshot)
  useEffect(() => {
    if (!opponent.isBot || !gameStarted || isGameOver) return;

    // Pedro pushup pace simulator: ~1 rep every 1.8 - 2.8 seconds
    const interval = setInterval(() => {
      setOpponent((prev) => {
        const nextScore = prev.score + 1;
        // Randomly send an emoji or emote occasionally
        if (Math.random() > 0.65) {
          const botEmojis = ['🔥', '💪', '😂', '😮', '❤️'];
          const randomEmoji = botEmojis[Math.floor(Math.random() * botEmojis.length)];
          triggerReaction(randomEmoji, 'opponent');
        }
        return {
          ...prev,
          score: nextScore,
          lastRepTimestamp: Date.now(),
        };
      });
    }, 2200 + Math.random() * 800);

    botIntervalRef.current = interval;

    return () => {
      clearInterval(interval);
    };
  }, [opponent.isBot, gameStarted, isGameOver, triggerReaction]);

  // Check lead changes for sound effects
  useEffect(() => {
    if (myScore !== prevMyScore.current) {
      if (myScore > opponent.score && prevMyScore.current <= opponent.score) {
        soundEffects.playLeadChangeSound();
      }
      prevMyScore.current = myScore;
    }
  }, [myScore, opponent.score]);

  useEffect(() => {
    if (opponent.score !== prevOpponentScore.current) {
      if (opponent.score > myScore && prevOpponentScore.current <= myScore) {
        soundEffects.playLeadChangeSound();
      }
      prevOpponentScore.current = opponent.score;
    }
  }, [opponent.score, myScore]);

  // Countdown timer at match start
  useEffect(() => {
    if (countdown === null) return;

    if (countdown > 0) {
      soundEffects.playCountdownBeep(false);
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      soundEffects.playCountdownBeep(true);
      setCountdown(null);
      setGameStarted(true);
    }
  }, [countdown]);

  // Match Game Clock Timer
  useEffect(() => {
    if (!gameStarted || isGameOver) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsGameOver(true);
          return 0;
        }
        if (prev <= 6) {
          soundEffects.playCountdownBeep(prev === 1);
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameStarted, isGameOver]);

  // Camera & AI Pose Tracking Initialization
  useEffect(() => {
    let stream: MediaStream | null = null;
    let isMounted = true;

    async function initCameraAndPose() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });

        if (!isMounted) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }

        stream = mediaStream;
        localStreamRef.current = mediaStream;
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          await videoRef.current.play();
        }

        // Initialize MoveNet pose detector
        const detector = await getPoseDetector();

        // Main pose detection animation loop
        const detectFrame = async () => {
          if (!isMounted || !videoRef.current || !canvasRef.current) return;

          const video = videoRef.current;
          const canvas = canvasRef.current;

          if (video.readyState >= 2 && canvas) {
            // Keep canvas resolution synced to video feed
            if (video.videoWidth > 0 && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
            }

            const ctx = canvas.getContext('2d');
            if (ctx) {
              const width = canvas.width;
              const height = canvas.height;

              let keypointsMap: PushupKeypoints = {};

              if (detector) {
                try {
                  // Do not flip internally because canvas & video are already mirrored via CSS -scale-x-100
                  const poses = await detector.estimatePoses(video, {
                    maxPoses: 1,
                    flipHorizontal: false,
                  });

                  if (poses && poses.length > 0 && poses[0].keypoints) {
                    keypointsMap = mapPoseKeypoints(poses[0].keypoints);
                  }
                } catch (e) {
                  // Fallback frame processing
                }
              }

              // Analyze pushup with tracker
              const result = trackerRef.current.analyzePose(keypointsMap, width, height);
              setAnalysis(result.analysis);

              if (result.newRepCompleted && gameStarted && !isGameOver) {
                setMyScore(result.analysis.repCount);
                soundEffects.playRepChime();

                // Send update to opponent
                if (channelRef.current) {
                  channelRef.current.send({
                    type: 'broadcast',
                    event: 'score_update',
                    payload: {
                      score: result.analysis.repCount,
                      depth: result.analysis.depthPercentage,
                      state: result.analysis.state,
                    },
                  });
                }
              }

              // Draw pose skeleton overlay
              if (showSkeleton) {
                drawPoseSkeleton(ctx, keypointsMap, width, height, result.analysis);
              } else {
                ctx.clearRect(0, 0, width, height);
              }
            }
          }

          animationFrameId.current = requestAnimationFrame(detectFrame);
        };

        detectFrame();
      } catch (err: unknown) {
        console.error('Camera access error:', err);
        const errMsg = err instanceof Error ? err.message : '카메라 접근 실패';
        setCameraError('카메라를 찾을 수 없거나 권한이 거부되었습니다. 아래 버튼을 탭하여 수동으로 대결할 수 있습니다.');
      }
    }

    initCameraAndPose();

    return () => {
      isMounted = false;
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      if (botIntervalRef.current) {
        clearInterval(botIntervalRef.current);
      }
    };
  }, [gameStarted, isGameOver, showSkeleton]);

  // Format seconds as mm:ss
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleRematch = () => {
    setIsGameOver(false);
    setTimeLeft(room.duration || 60);
    setMyScore(0);
    setOpponent((prev) => ({ ...prev, score: 0 }));
    trackerRef.current.reset();
    setCountdown(3);
    setGameStarted(false);
  };

  return (
    <div className="relative w-full h-[100dvh] bg-slate-950 flex flex-col justify-between overflow-hidden select-none font-sans">
      {/* Top Header Match HUD (Matching Reference Image) */}
      <div className="relative z-30 w-full bg-slate-950/90 backdrop-blur-md pt-2 pb-1.5 px-3 border-b border-slate-800/80 shadow-2xl">
        {/* Match Type Banner (e.g. RANKED MATCH) */}
        <div className="flex items-center justify-between px-2 mb-1">
          <button
            onClick={onExit}
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Exit match"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <span className="text-xs sm:text-sm font-black tracking-widest text-amber-400 uppercase drop-shadow-[0_0_8px_rgba(251,191,36,0.6)] flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 fill-amber-400" />
            RANKED MATCH
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSkeleton(!showSkeleton)}
              className={`p-1 rounded-full text-xs transition-colors ${
                showSkeleton ? 'text-amber-400 bg-amber-400/10' : 'text-slate-500'
              }`}
              title="Toggle AI Skeleton"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              onClick={toggleSound}
              className="p-1 rounded-full text-slate-400 hover:text-white transition-colors"
              title="Toggle Sound"
            >
              {soundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Players Versus Row */}
        <div className="w-full flex items-center justify-between max-w-lg mx-auto">
          {/* Left Player (You) */}
          <HexAvatar
            name="You"
            avatarUrl={myProfile.avatarUrl}
            elo={myProfile.elo}
            rankTitle={myProfile.rankTitle}
            side="left"
            highlight={myScore > opponent.score}
          />

          {/* Center TIME Header */}
          <div className="flex flex-col items-center justify-center px-2">
            <span className="text-[10px] sm:text-xs font-bold text-slate-400 tracking-wider uppercase">
              TIME
            </span>
            <span className="text-2xl sm:text-3xl font-black text-white tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              {formatTime(timeLeft)}
            </span>
          </div>

          {/* Right Player (Pedro / Opponent) */}
          <HexAvatar
            name={opponent.name}
            avatarUrl={opponent.avatarUrl}
            elo={opponent.elo}
            rankTitle={opponent.rankTitle}
            side="right"
            highlight={opponent.score > myScore}
          />
        </div>

        {/* Tug of War Momentum Bar with Big Neon Scores */}
        <div className="max-w-lg mx-auto mt-0.5">
          <TugOfWarBar
            myScore={myScore}
            opponentScore={opponent.score}
            myDepth={analysis?.depthPercentage || 0}
            opponentDepth={opponent.currentDepth || 0}
          />
        </div>
      </div>

      {/* Main Camera / AI Pose Tracking Center Viewport */}
      <div className="relative flex-1 w-full bg-slate-900 overflow-hidden flex items-center justify-center">
        {/* Video feed (Mirrored) */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 w-full h-full object-cover -scale-x-100"
        />

        {/* AI Pose Skeleton Canvas Overlay */}
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="absolute inset-0 w-full h-full object-cover z-10 pointer-events-none -scale-x-100"
        />

        {/* Top-Right: Opponent's Realtime Video Window (대결 상대방 영상) */}
        <div className="absolute top-3 right-3 z-25 w-36 h-48 sm:w-44 sm:h-56 rounded-2xl overflow-hidden border-2 border-slate-700/90 shadow-2xl bg-slate-950 flex flex-col">
          {/* Opponent Remote Video Feed */}
          <div className="relative w-full h-full bg-slate-900 flex items-center justify-center overflow-hidden">
            <video
              ref={remoteVideoRef}
              playsInline
              autoPlay
              className={`absolute inset-0 w-full h-full object-cover -scale-x-100 ${
                hasRemoteVideo ? 'opacity-100' : 'opacity-0'
              }`}
            />

            {/* Placeholder / Connecting State if remote stream is pending */}
            {!hasRemoteVideo && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-2 bg-gradient-to-b from-slate-900 to-slate-950 text-center">
                <div className="relative w-12 h-12 rounded-full overflow-hidden border-2 border-amber-400 mb-2 shadow-lg">
                  <img
                    src={opponent.avatarUrl}
                    alt={opponent.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-slate-950/20" />
                </div>
                <span className="text-[11px] font-black text-white truncate max-w-full px-1">
                  {opponent.name}
                </span>
                <span className="text-[9px] font-bold text-amber-400/90 flex items-center gap-1 mt-0.5 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  카메라 대기 중...
                </span>
              </div>
            )}

            {/* Top Badge: LIVE & Opponent Score */}
            <div className="absolute top-1.5 inset-x-1.5 flex items-center justify-between pointer-events-none z-10">
              <span className="px-1.5 py-0.5 rounded-md bg-rose-600/90 text-white text-[9px] font-black tracking-wider flex items-center gap-1 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                LIVE
              </span>
              <span className="px-2 py-0.5 rounded-md bg-slate-950/80 backdrop-blur-xs text-amber-400 border border-amber-400/40 text-[10px] font-black shadow-xs">
                🔥 {opponent.score}회
              </span>
            </div>

            {/* Bottom Overlay: Opponent Name */}
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-950/90 via-slate-950/50 to-transparent p-1.5 pt-4 pointer-events-none z-10 flex items-center justify-between">
              <span className="text-[11px] font-black text-white truncate drop-shadow-md">
                {opponent.name}
              </span>
              <span className="text-[9px] font-extrabold text-amber-300">
                {opponent.elo} ELO
              </span>
            </div>
          </div>
        </div>

        {/* Dark Vignette Overlay for Contrast */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-slate-950/40 pointer-events-none z-10" />

        {/* Camera Permission / Fallback Notice if no camera */}
        {cameraError && (
          <div className="absolute top-4 inset-x-4 max-w-sm mx-auto bg-slate-900/90 border border-amber-500/50 rounded-2xl p-3 text-amber-200 text-xs flex items-center gap-2.5 z-30 shadow-xl backdrop-blur-md">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
            <p className="leading-tight">{cameraError}</p>
          </div>
        )}

        {/* Floating Emojis Overlay */}
        <ReactionOverlay reactions={reactions} />

        {/* Center Countdown Overlay (3, 2, 1, GO!) */}
        {countdown !== null && (
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-40">
            <motion.div
              key={countdown}
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.6, opacity: 0 }}
              className="flex flex-col items-center"
            >
              <span className="text-8xl sm:text-9xl font-black text-amber-400 drop-shadow-[0_0_30px_rgba(251,191,36,0.9)]">
                {countdown === 0 ? 'GO!' : countdown}
              </span>
              <span className="mt-2 text-lg font-bold text-white uppercase tracking-widest">
                카메라를 마주보고 푸쉬업을 준비하세요!
              </span>
            </motion.div>
          </div>
        )}

        {/* Bottom Circular Pushup Target Rep Counter (Exact design from screenshot) */}
        <div className="absolute bottom-16 sm:bottom-18 inset-x-0 flex justify-center z-30">
          <PushupTargetDial
            repCount={myScore}
            analysis={analysis}
            onManualTap={handleManualRep}
          />
        </div>
      </div>

      {/* Match End Victory/Defeat Modal */}
      {isGameOver && (
        <MatchEndModal
          myScore={myScore}
          opponentScore={opponent.score}
          myProfile={myProfile}
          opponent={opponent}
          onRematch={handleRematch}
          onExit={onExit}
        />
      )}
    </div>
  );
};

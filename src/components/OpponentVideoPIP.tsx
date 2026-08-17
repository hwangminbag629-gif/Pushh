import React, { useRef, useEffect } from 'react';
import { Wifi, Video, ShieldCheck } from 'lucide-react';
import { OpponentState } from '../types';

interface OpponentVideoPIPProps {
  opponent: OpponentState;
  remoteStream: MediaStream | null;
  remoteSnapshot?: string | null;
}

export const OpponentVideoPIP: React.FC<OpponentVideoPIPProps> = ({
  opponent,
  remoteStream,
  remoteSnapshot,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Attach remote WebRTC stream if available
  useEffect(() => {
    if (videoRef.current) {
      if (remoteStream) {
        videoRef.current.srcObject = remoteStream;
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.srcObject = null;
      }
    }
  }, [remoteStream]);

  // When no remote WebRTC stream and no remote snapshot, render animated live camera feed
  useEffect(() => {
    if (remoteStream || remoteSnapshot) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let time = 0;

    const render = () => {
      time += 0.04;
      const width = canvas.width;
      const height = canvas.height;

      // 1. Gym / Room background gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#0f172a');
      bgGrad.addColorStop(0.5, '#1e293b');
      bgGrad.addColorStop(1, '#090d16');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Studio floor & ambient lighting
      ctx.fillStyle = 'rgba(250, 204, 21, 0.08)';
      ctx.beginPath();
      ctx.ellipse(width / 2, height * 0.35, width * 0.6, height * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Floor perspective lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height * 0.68);
      ctx.lineTo(width, height * 0.68);
      ctx.moveTo(0, height * 0.88);
      ctx.lineTo(width, height * 0.88);
      ctx.stroke();

      // 2. Calculate Pushup Motion based on opponent state & periodic rhythm
      const cycle = (Math.sin(time * 2.8) + 1) / 2; // 0 (up) to 1 (down)
      const pushFactor = opponent.isPushingDown ? 0.85 : cycle;

      const headX = width * 0.30;
      const shoulderX = width * 0.40;
      const elbowX = width * 0.43 + pushFactor * 18;
      const wristX = width * 0.44;
      const hipX = width * 0.64;
      const feetX = width * 0.88;

      // Y positions shift with pushup depth
      const baseY = height * 0.68;
      const dropY = pushFactor * 28;

      const headY = baseY - 46 + dropY;
      const shoulderY = baseY - 36 + dropY;
      const elbowY = baseY - 12 + dropY * 0.4;
      const wristY = baseY + 2;
      const hipY = baseY - 28 + dropY * 0.7;
      const feetY = baseY + 2;

      // 3. Draw Body Silhouette / Avatar
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 10;

      // Torso / Body Line
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(shoulderX, shoulderY);
      ctx.lineTo(hipX, hipY);
      ctx.stroke();

      // Legs Line
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(hipX, hipY);
      ctx.lineTo(feetX, feetY);
      ctx.stroke();

      // Arm Line (Shoulder -> Elbow -> Wrist)
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(shoulderX, shoulderY);
      ctx.lineTo(elbowX, elbowY);
      ctx.lineTo(wristX, wristY);
      ctx.stroke();

      // Head
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(headX, headY, 14, 0, Math.PI * 2);
      ctx.fill();

      // 4. Draw AI Joint Skeleton Dots (FaceTime AI tracking look)
      const joints = [
        { x: headX, y: headY },
        { x: shoulderX, y: shoulderY },
        { x: elbowX, y: elbowY },
        { x: wristX, y: wristY },
        { x: hipX, y: hipY },
        { x: feetX, y: feetY },
      ];

      ctx.shadowBlur = 0;
      joints.forEach((j) => {
        // Outer dark ring
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(j.x, j.y, 6, 0, Math.PI * 2);
        ctx.fill();

        // Inner bright yellow dot
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(j.x, j.y, 4, 0, Math.PI * 2);
        ctx.fill();
      });

      // 5. Depth indicator bar
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(10, height - 20, width - 20, 8);
      ctx.fillStyle = pushFactor > 0.7 ? '#22c55e' : '#f59e0b';
      ctx.fillRect(10, height - 20, (width - 20) * pushFactor, 8);

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [remoteStream, remoteSnapshot, opponent.isPushingDown]);

  return (
    <div
      id="opponent-pip-window"
      className="absolute top-3 right-3 z-35 w-36 h-48 sm:w-48 sm:h-64 rounded-3xl overflow-hidden border-2 border-slate-700/80 shadow-[0_12px_36px_rgba(0,0,0,0.85)] bg-slate-950 flex flex-col ring-2 ring-black/40"
    >
      {/* Video / Animated Camera Stream Container */}
      <div className="relative w-full h-full bg-slate-950 flex items-center justify-center overflow-hidden">
        {/* Real Peer WebRTC Video Feed */}
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          className={`absolute inset-0 w-full h-full object-cover -scale-x-100 transition-opacity duration-300 ${
            remoteStream ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        />

        {/* Realtime Snapshot Feed (Fallback when WebRTC NAT is blocked) */}
        {!remoteStream && remoteSnapshot && (
          <img
            src={remoteSnapshot}
            alt="Opponent Camera"
            className="absolute inset-0 w-full h-full object-cover -scale-x-100"
          />
        )}

        {/* Live Animated Camera Feed Canvas (active pushup live stream) */}
        {!remoteStream && !remoteSnapshot && (
          <canvas
            ref={canvasRef}
            width={240}
            height={320}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Top FaceTime Call Bar */}
        <div className="absolute top-2 inset-x-2 flex items-center justify-between pointer-events-none z-20">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-950/85 backdrop-blur-md border border-white/10 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-black text-white tracking-wider flex items-center gap-1">
              <Video className="w-2.5 h-2.5 text-emerald-400" />
              LIVE
            </span>
          </div>

          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/90 text-slate-950 text-[11px] font-black shadow-md">
            🔥 {opponent.score}
          </div>
        </div>

        {/* Bottom Opponent Identity Bar */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent p-2 pt-6 pointer-events-none z-20 flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-5 h-5 rounded-full overflow-hidden border border-white/40 shrink-0">
              <img
                src={opponent.avatarUrl}
                alt={opponent.name}
                className="w-full h-full object-cover"
              />
            </div>
            <span className="text-xs font-black text-white truncate max-w-[85px] drop-shadow-md">
              {opponent.name}
            </span>
          </div>

          <span className="text-[9px] font-extrabold text-amber-400 bg-black/40 px-1.5 py-0.5 rounded-md border border-white/10 flex items-center gap-1">
            <Wifi className="w-2.5 h-2.5 text-emerald-400" />
            HD
          </span>
        </div>
      </div>
    </div>
  );
};

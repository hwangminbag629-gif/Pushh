import React, { useEffect, useRef, useState } from 'react';
import { X, Camera, RefreshCw, CheckCircle2, AlertCircle, Dumbbell } from 'lucide-react';
import { 
  getPoseDetector, 
  PushupTracker, 
  drawPoseSkeleton,
  mapPoseKeypoints 
} from '../lib/poseDetector';
import { soundEffects } from '../lib/audio';
import { PushupAnalysis, PushupKeypoints } from '../types';

interface PracticeModalProps {
  onClose: () => void;
}

export const PracticeModal: React.FC<PracticeModalProps> = ({ onClose }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const trackerRef = useRef<PushupTracker>(new PushupTracker());
  const [repCount, setRepCount] = useState(0);
  const [analysis, setAnalysis] = useState<PushupAnalysis | null>(null);
  const [cameraStatus, setCameraStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const animationFrameId = useRef<number | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let isMounted = true;

    async function init() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });

        if (!isMounted) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }

        stream = mediaStream;
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          await videoRef.current.play();
        }

        setCameraStatus('ready');
        const detector = await getPoseDetector();

        const loop = async () => {
          if (!isMounted || !videoRef.current || !canvasRef.current) return;
          const video = videoRef.current;
          const canvas = canvasRef.current;

          if (video.readyState >= 2 && canvas) {
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
                  const poses = await detector.estimatePoses(video, {
                    maxPoses: 1,
                    flipHorizontal: false,
                  });
                  if (poses && poses.length > 0 && poses[0].keypoints) {
                    keypointsMap = mapPoseKeypoints(poses[0].keypoints);
                  }
                } catch (e) {
                  // ignore
                }
              }

              const result = trackerRef.current.analyzePose(keypointsMap, width, height);
              setAnalysis(result.analysis);

              if (result.newRepCompleted) {
                setRepCount(result.analysis.repCount);
                soundEffects.playRepChime();
              }

              drawPoseSkeleton(ctx, keypointsMap, width, height, result.analysis);
            }
          }
          animationFrameId.current = requestAnimationFrame(loop);
        };

        loop();
      } catch (e) {
        setCameraStatus('error');
      }
    }

    init();

    return () => {
      isMounted = false;
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleResetCount = () => {
    trackerRef.current.reset();
    setRepCount(0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">카메라 자세 연습 및 캘리브레이션</h3>
              <p className="text-xs text-slate-500">실시간 스켈레톤과 푸쉬업 각도를 테스트하세요.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video & Canvas Frame */}
        <div className="relative w-full aspect-4/3 bg-slate-950 flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-cover -scale-x-100"
          />
          <canvas
            ref={canvasRef}
            width={640}
            height={480}
            className="absolute inset-0 w-full h-full object-cover -scale-x-100 pointer-events-none"
          />

          {cameraStatus === 'loading' && (
            <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-white gap-2">
              <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-bold">카메라 및 AI 모델 로딩 중...</span>
            </div>
          )}

          {cameraStatus === 'error' && (
            <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-amber-300 p-6 text-center gap-2">
              <AlertCircle className="w-8 h-8 text-amber-400" />
              <span className="text-sm font-bold">카메라 권한을 허용해주세요</span>
              <p className="text-xs text-slate-400">브라우저 주소창 왼쪽의 카메라 권한을 확인하세요.</p>
            </div>
          )}

          {/* Top Live Depth & Angle Badges */}
          {analysis && (
            <div className="absolute top-3 inset-x-3 flex items-center justify-between pointer-events-none">
              <div className="px-3 py-1 rounded-full bg-slate-950/80 backdrop-blur-md border border-slate-700 text-white text-xs font-bold flex items-center gap-2">
                <span>팔꿈치 각도:</span>
                <span className="text-amber-400 font-black">{analysis.elbowAngle}°</span>
              </div>

              <div className="px-3 py-1 rounded-full bg-slate-950/80 backdrop-blur-md border border-slate-700 text-white text-xs font-bold flex items-center gap-2">
                <span>깊이:</span>
                <span className="text-emerald-400 font-black">{analysis.depthPercentage}%</span>
              </div>
            </div>
          )}

          {/* Bottom Live Feedback */}
          <div className="absolute bottom-3 inset-x-3 flex items-center justify-between pointer-events-none">
            <div className="px-3 py-1.5 rounded-full bg-amber-400 text-slate-950 text-xs font-black shadow-lg">
              {analysis?.feedbackText || '자세를 잡으세요'}
            </div>

            <div className="px-4 py-1.5 rounded-full bg-slate-950/90 text-white text-sm font-black border border-slate-700">
              연습 횟수: <span className="text-amber-400 text-lg">{repCount}</span>
            </div>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={handleResetCount}
            className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            카운트 초기화
          </button>

          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors"
          >
            확인 및 닫기
          </button>
        </div>
      </div>
    </div>
  );
};

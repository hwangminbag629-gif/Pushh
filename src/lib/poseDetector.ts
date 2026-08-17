import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import * as poseDetection from '@tensorflow-models/pose-detection';
import { PushupAnalysis, PushupKeypoints } from '../types';

let detectorInstance: poseDetection.PoseDetector | null = null;
let isInitializing = false;

export async function getPoseDetector(): Promise<poseDetection.PoseDetector | null> {
  if (detectorInstance) return detectorInstance;
  if (isInitializing) {
    // Wait for ongoing init
    let attempts = 0;
    while (isInitializing && attempts < 35) {
      await new Promise((r) => setTimeout(r, 100));
      attempts++;
      if (detectorInstance) return detectorInstance;
    }
  }

  try {
    isInitializing = true;
    try {
      await tf.setBackend('webgl');
    } catch {
      await tf.setBackend('cpu');
    }
    await tf.ready();

    const model = poseDetection.SupportedModels.MoveNet;
    const detectorConfig = {
      modelType: 'SinglePose.Lightning',
      enableSmoothing: true,
      minPoseScore: 0.1,
    };

    detectorInstance = await poseDetection.createDetector(model, detectorConfig as any);
    return detectorInstance;
  } catch (error) {
    console.warn('MoveNet initialization fallback to heuristic tracker:', error);
    return null;
  } finally {
    isInitializing = false;
  }
}

// Map MoveNet snake_case names and index fallback to camelCase PushupKeypoints
const KEYPOINT_MAP: Record<string, keyof PushupKeypoints> = {
  nose: 'nose',
  left_shoulder: 'leftShoulder',
  right_shoulder: 'rightShoulder',
  left_elbow: 'leftElbow',
  right_elbow: 'rightElbow',
  left_wrist: 'leftWrist',
  right_wrist: 'rightWrist',
  left_hip: 'leftHip',
  right_hip: 'rightHip',
  leftShoulder: 'leftShoulder',
  rightShoulder: 'rightShoulder',
  leftElbow: 'leftElbow',
  rightElbow: 'rightElbow',
  leftWrist: 'leftWrist',
  rightWrist: 'rightWrist',
  leftHip: 'leftHip',
  rightHip: 'rightHip',
};

const INDEX_MAP: Record<number, keyof PushupKeypoints> = {
  0: 'nose',
  5: 'leftShoulder',
  6: 'rightShoulder',
  7: 'leftElbow',
  8: 'rightElbow',
  9: 'leftWrist',
  10: 'rightWrist',
  11: 'leftHip',
  12: 'rightHip',
};

export function mapPoseKeypoints(rawKeypoints: any[]): PushupKeypoints {
  const result: PushupKeypoints = {};
  if (!rawKeypoints || !Array.isArray(rawKeypoints)) return result;

  rawKeypoints.forEach((kp, idx) => {
    let key: keyof PushupKeypoints | undefined;
    if (kp.name && KEYPOINT_MAP[kp.name]) {
      key = KEYPOINT_MAP[kp.name];
    } else if (INDEX_MAP[idx]) {
      key = INDEX_MAP[idx];
    }

    if (key) {
      result[key] = {
        x: kp.x,
        y: kp.y,
        score: kp.score ?? 0.5,
      };
    }
  });

  return result;
}

// Calculate angle between three 2D points (B is vertex)
export function calculateAngle(
  A: { x: number; y: number },
  B: { x: number; y: number },
  C: { x: number; y: number }
): number {
  const radians =
    Math.atan2(C.y - B.y, C.x - B.x) - Math.atan2(A.y - B.y, A.x - B.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) {
    angle = 360.0 - angle;
  }
  return angle;
}

export class PushupTracker {
  private state: 'UP' | 'GOING_DOWN' | 'DOWN' | 'PUSHING_UP' = 'UP';
  private repCount: number = 0;
  private minAngleSeenInRep: number = 180;
  private maxDepthSeenInRep: number = 0;
  private baselineShoulderY: number | null = null;
  private baselineWristY: number | null = null;
  private consecutiveDownFrames: number = 0;
  private consecutiveUpFrames: number = 0;

  // Smoothing
  private smoothedAngle: number = 160;
  private smoothedDepth: number = 0;

  public reset() {
    this.state = 'UP';
    this.repCount = 0;
    this.minAngleSeenInRep = 180;
    this.maxDepthSeenInRep = 0;
    this.baselineShoulderY = null;
    this.smoothedAngle = 160;
    this.smoothedDepth = 0;
    this.consecutiveDownFrames = 0;
    this.consecutiveUpFrames = 0;
  }

  public getRepCount(): number {
    return this.repCount;
  }

  public setRepCount(count: number) {
    this.repCount = count;
  }

  public manualIncrementRep(): number {
    this.repCount += 1;
    return this.repCount;
  }

  public analyzePose(
    keypoints: PushupKeypoints,
    videoWidth: number,
    videoHeight: number
  ): { analysis: PushupAnalysis; newRepCompleted: boolean } {
    let newRepCompleted = false;

    // Detect using keypoints: head (nose), shoulders, elbows, wrists, hips
    const leftShoulder = keypoints.leftShoulder;
    const rightShoulder = keypoints.rightShoulder;
    const leftElbow = keypoints.leftElbow;
    const rightElbow = keypoints.rightElbow;
    const leftWrist = keypoints.leftWrist;
    const rightWrist = keypoints.rightWrist;
    const nose = keypoints.nose;

    let leftAngle = 160;
    let rightAngle = 160;
    let hasLeftArm = false;
    let hasRightArm = false;

    if (leftShoulder && leftElbow && leftWrist && (leftShoulder.score ?? 0) > 0.15 && (leftElbow.score ?? 0) > 0.15 && (leftWrist.score ?? 0) > 0.15) {
      leftAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
      hasLeftArm = true;
    }

    if (rightShoulder && rightElbow && rightWrist && (rightShoulder.score ?? 0) > 0.15 && (rightElbow.score ?? 0) > 0.15 && (rightWrist.score ?? 0) > 0.15) {
      rightAngle = calculateAngle(rightShoulder, rightElbow, rightWrist);
      hasRightArm = true;
    }

    let armAngle = 160;
    if (hasLeftArm && hasRightArm) {
      armAngle = Math.min(leftAngle, rightAngle);
    } else if (hasLeftArm) {
      armAngle = leftAngle;
    } else if (hasRightArm) {
      armAngle = rightAngle;
    }

    // Vertical Head & Shoulder Descent Tracking
    let headOrShoulderY = 0;
    let validPointsCount = 0;

    if (nose && (nose.score ?? 0) > 0.15) {
      headOrShoulderY += nose.y;
      validPointsCount++;
    }
    if (leftShoulder && (leftShoulder.score ?? 0) > 0.15) {
      headOrShoulderY += leftShoulder.y;
      validPointsCount++;
    }
    if (rightShoulder && (rightShoulder.score ?? 0) > 0.15) {
      headOrShoulderY += rightShoulder.y;
      validPointsCount++;
    }

    let rawDepth = 0;
    if (validPointsCount > 0) {
      const avgY = headOrShoulderY / validPointsCount;
      if (this.baselineShoulderY === null) {
        this.baselineShoulderY = avgY;
      } else {
        // Adapt baseline when up
        if (this.state === 'UP' && avgY < this.baselineShoulderY) {
          this.baselineShoulderY = this.baselineShoulderY * 0.85 + avgY * 0.15;
        }
        const deltaY = avgY - this.baselineShoulderY;
        const maxExpectedDrop = videoHeight * 0.18; // approx 18% of frame height
        rawDepth = Math.max(0, Math.min(100, (deltaY / Math.max(20, maxExpectedDrop)) * 100));
      }
    }

    // Angle-based depth calculation (165 deg = 0%, 90 deg = 100%)
    const angleDepth = Math.max(0, Math.min(100, ((160 - armAngle) / (160 - 90)) * 100));
    
    // Combined depth calculation
    let calculatedDepth = 0;
    if (hasLeftArm || hasRightArm) {
      calculatedDepth = angleDepth * 0.6 + rawDepth * 0.4;
    } else {
      calculatedDepth = rawDepth;
      armAngle = 165 - (rawDepth / 100) * 80;
    }

    // Exponential smoothing
    this.smoothedAngle = this.smoothedAngle * 0.55 + armAngle * 0.45;
    this.smoothedDepth = this.smoothedDepth * 0.55 + calculatedDepth * 0.45;

    const angle = this.smoothedAngle;
    const depth = this.smoothedDepth;

    let feedback = '준비 완료! 푸쉬업을 시작하세요';

    // State machine for Pushup Rep
    // Thresholds: DOWN when angle <= 105° or depth >= 60%
    // UP when angle >= 138° and depth <= 35%
    const isDownThreshold = angle <= 105 || depth >= 58;
    const isUpThreshold = angle >= 136 && depth <= 35;

    if (this.state === 'UP') {
      feedback = '몸을 내리세요! (Go Down)';
      if (depth > 25 || angle < 145) {
        this.state = 'GOING_DOWN';
        this.minAngleSeenInRep = angle;
        this.maxDepthSeenInRep = depth;
      }
    } else if (this.state === 'GOING_DOWN') {
      this.minAngleSeenInRep = Math.min(this.minAngleSeenInRep, angle);
      this.maxDepthSeenInRep = Math.max(this.maxDepthSeenInRep, depth);

      if (isDownThreshold) {
        this.consecutiveDownFrames++;
        if (this.consecutiveDownFrames >= 1) {
          this.state = 'DOWN';
          feedback = '더 아래로! 굿! 밀어올리세요! 🔥';
          this.consecutiveDownFrames = 0;
        }
      } else {
        feedback = `더 깊게 내려가세요! (${Math.round(depth)}%)`;
      }
    } else if (this.state === 'DOWN') {
      this.minAngleSeenInRep = Math.min(this.minAngleSeenInRep, angle);
      this.maxDepthSeenInRep = Math.max(this.maxDepthSeenInRep, depth);
      feedback = '밀어 올리세요! (Push Up!) 💪';

      if (depth < 50 || angle > 115) {
        this.state = 'PUSHING_UP';
      }
    } else if (this.state === 'PUSHING_UP') {
      if (isUpThreshold) {
        this.consecutiveUpFrames++;
        if (this.consecutiveUpFrames >= 1) {
          // Rep successfully completed!
          this.repCount += 1;
          newRepCompleted = true;
          this.state = 'UP';
          feedback = '완벽한 1회! 계속 가세요! 🚀';
          this.consecutiveUpFrames = 0;
          this.minAngleSeenInRep = 180;
          this.maxDepthSeenInRep = 0;
        }
      } else {
        feedback = '팔을 끝까지 쭉 펴세요!';
      }
    }

    const isGoodForm = this.minAngleSeenInRep <= 105 || depth >= 60;

    return {
      analysis: {
        state: this.state,
        depthPercentage: Math.round(depth),
        elbowAngle: Math.round(angle),
        isGoodForm,
        feedbackText: feedback,
        repCount: this.repCount,
      },
      newRepCompleted,
    };
  }
}

// Canvas Drawing Helper to match the reference screenshot
export function drawPoseSkeleton(
  ctx: CanvasRenderingContext2D,
  keypoints: PushupKeypoints,
  width: number,
  height: number,
  analysis: PushupAnalysis | null
) {
  ctx.clearRect(0, 0, width, height);

  // Define skeleton pairs to draw matching reference image
  // (yellow glowing dots and bold white connecting lines)
  const lines: Array<[keyof PushupKeypoints, keyof PushupKeypoints]> = [
    ['nose', 'leftShoulder'],
    ['nose', 'rightShoulder'],
    ['leftShoulder', 'rightShoulder'],
    ['leftShoulder', 'leftElbow'],
    ['leftElbow', 'leftWrist'],
    ['rightShoulder', 'rightElbow'],
    ['rightElbow', 'rightWrist'],
    ['leftShoulder', 'leftHip'],
    ['rightShoulder', 'rightHip'],
    ['leftHip', 'rightHip'],
  ];

  ctx.lineWidth = 5;
  ctx.strokeStyle = '#FFFFFF';
  ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
  ctx.shadowBlur = 8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Draw connecting bones
  for (const [p1Name, p2Name] of lines) {
    const p1 = keypoints[p1Name];
    const p2 = keypoints[p2Name];

    if (p1 && p2 && (p1.score ?? 1) > 0.08 && (p2.score ?? 1) > 0.08) {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }

  // Draw joint dots (Yellow circle with dark border)
  const joints: Array<keyof PushupKeypoints> = [
    'nose',
    'leftShoulder',
    'rightShoulder',
    'leftElbow',
    'rightElbow',
    'leftWrist',
    'rightWrist',
    'leftHip',
    'rightHip',
  ];

  for (const jName of joints) {
    const pt = keypoints[jName];
    if (pt && (pt.score ?? 1) > 0.08) {
      ctx.shadowBlur = 0;
      
      // Outer black stroke
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 11, 0, 2 * Math.PI);
      ctx.fillStyle = '#000000';
      ctx.fill();

      // Inner vibrant yellow dot
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 8, 0, 2 * Math.PI);
      ctx.fillStyle = '#FACC15'; // Bright vivid yellow
      ctx.fill();

      // Center bright core
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3, 0, 2 * Math.PI);
      ctx.fillStyle = '#FEF08A';
      ctx.fill();
    }
  }

  // Draw chest center target guide if shoulders exist
  if (
    keypoints.leftShoulder &&
    keypoints.rightShoulder &&
    (keypoints.leftShoulder.score ?? 1) > 0.1 &&
    (keypoints.rightShoulder.score ?? 1) > 0.1
  ) {
    const midX = (keypoints.leftShoulder.x + keypoints.rightShoulder.x) / 2;
    const midY = (keypoints.leftShoulder.y + keypoints.rightShoulder.y) / 2 + 25;

    ctx.save();
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = analysis?.state === 'DOWN' ? '#22C55E' : 'rgba(250, 204, 21, 0.85)';
    ctx.beginPath();
    ctx.arc(midX, midY, 20, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }
}

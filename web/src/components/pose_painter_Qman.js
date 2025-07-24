import { avgPosition, distBetween, extendPosition } from "../point_util.js";
import * as Items from "./items.js";

let initialized = false;
async function init(imageLoader) {
  if (initialized) return;
  initialized = true;
  await Items.init(imageLoader);
}

export { init, Items };

// ✅ 缓存 Q版人物素材
let qAssets = null;
async function loadQAssets() {
  if (qAssets) return qAssets;

  const load = (name) =>
    new Promise((res, rej) => {
      const img = new Image();
      img.src = process.env.PUBLIC_URL + `/assets/qcharacter/${name}.png`;
      img.onload = () => {
        console.log(`✅ loaded ${name}.png`);
        res(img);
      };
      img.onerror = () => {
        console.error(`❌ failed to load ${name}.png`);
        rej(new Error(`failed to load ${name}.png`));
      };
    });

  qAssets = {};
  try {
    qAssets.head = await load("head");
    qAssets.body = await load("body");
    qAssets.upper_arm = await load("upper_arm");
    qAssets.forearm = await load("forearm");
    qAssets.thigh = await load("thigh");
    qAssets.shin = await load("shin");
  } catch (e) {
    console.error("⚠️ Some PNG failed, will use fallback:", e);
  }
  return qAssets;
}

// ✅ 角度/距离计算
function getAngle(a, b) {
  return Math.atan2(b.position.y - a.position.y, b.position.x - a.position.x);
}
function getDistance(a, b) {
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ✅ 通用绘制 limb（加 fallback）
function drawLimb(ctx, img, a, b, thickness = 30, toDrawPoint) {
  const A = toDrawPoint(a.position);
  const B = toDrawPoint(b.position);
  const angle = Math.atan2(B.y - A.y, B.x - A.x);
  const length = getDistance({ position: A }, { position: B });

  ctx.save();
  ctx.translate(A.x, A.y);
  ctx.rotate(angle);

  if (img instanceof HTMLImageElement) {
    ctx.drawImage(img, 0, -thickness / 2, length, thickness);
  } else {
    // ✅ fallback 彩条
    ctx.fillStyle = "rgba(0,200,255,0.5)";
    ctx.fillRect(0, -thickness / 2, length, thickness);
  }
  ctx.restore();
}

// ✅ 安全绘制（跳过无效关键点）
function safeDrawLimb(ctx, img, a, b, thickness, toDrawPoint) {
  if (!a || !b || !a.position || !b.position) {
    console.warn("⚠️ limb skipped: missing keypoints", a, b);
    return;
  }
  drawLimb(ctx, img, a, b, thickness, toDrawPoint);
}

// ✅ 用 MoveNet 关键点画 Q版人物
let lastPoseKeypoints = null; // 用上帧补全缺失

async function paintQPose(ctx, pose, toDrawPoint) {
  if (!pose || !pose.keypoints || pose.keypoints.length === 0) {
    console.warn("⚠️ no keypoints this frame");
    return;
  }

  // 打印关键点和置信度
  console.log(
    "pose keypoints:",
    pose.keypoints.map((k) => `${k.part}:${k.score.toFixed(2)}`).join(", ")
  );

  const kp = {};
  pose.keypoints.forEach((k) => {
    // 过滤掉非常低置信度
    if (k.score > 0.05) {
      kp[k.part] = k;
    }
  });

  // ✅ 用上一帧补缺失点
  if (lastPoseKeypoints) {
    Object.keys(lastPoseKeypoints).forEach((part) => {
      if (!kp[part]) {
        kp[part] = lastPoseKeypoints[part];
      }
    });
  }
  lastPoseKeypoints = kp;

  const assets = await loadQAssets();

  // 中心点（肩膀和髋）
  let midShoulder = null;
  let midHip = null;
  if (kp.leftShoulder && kp.rightShoulder) {
    midShoulder = {
      position: {
        x: (kp.leftShoulder.position.x + kp.rightShoulder.position.x) / 2,
        y: (kp.leftShoulder.position.y + kp.rightShoulder.position.y) / 2,
      },
    };
  }
  if (kp.leftHip && kp.rightHip) {
    midHip = {
      position: {
        x: (kp.leftHip.position.x + kp.rightHip.position.x) / 2,
        y: (kp.leftHip.position.y + kp.rightHip.position.y) / 2,
      },
    };
  }

  // 躯干
  if (midShoulder && midHip) {
    safeDrawLimb(ctx, assets.body || null, midShoulder, midHip, 80, toDrawPoint);
  }

  // 左右大腿/小腿
  safeDrawLimb(ctx, assets.thigh || null, kp.leftHip, kp.leftKnee, 40, toDrawPoint);
  safeDrawLimb(ctx, assets.thigh || null, kp.rightHip, kp.rightKnee, 40, toDrawPoint);
  safeDrawLimb(ctx, assets.shin || null, kp.leftKnee, kp.leftAnkle, 35, toDrawPoint);
  safeDrawLimb(ctx, assets.shin || null, kp.rightKnee, kp.rightAnkle, 35, toDrawPoint);

  // 左右上臂/前臂
  safeDrawLimb(ctx, assets.upper_arm || null, kp.leftShoulder, kp.leftElbow, 30, toDrawPoint);
  safeDrawLimb(ctx, assets.upper_arm || null, kp.rightShoulder, kp.rightElbow, 30, toDrawPoint);
  safeDrawLimb(ctx, assets.forearm || null, kp.leftElbow, kp.leftWrist, 25, toDrawPoint);
  safeDrawLimb(ctx, assets.forearm || null, kp.rightElbow, kp.rightWrist, 25, toDrawPoint);

  // 头部（用鼻子或肩膀中心）
  let headRef = kp.nose || midShoulder;
  if (headRef) {
    const H = toDrawPoint(headRef.position);
    if (assets.head instanceof HTMLImageElement) {
      ctx.drawImage(assets.head, H.x - 60, H.y - 100, 120, 120);
    } else {
      ctx.fillStyle = "orange";
      ctx.beginPath();
      ctx.arc(H.x, H.y, 40, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ✅ 绘制整个画面：背景 + 多人 Q版人物
export async function paintFrame(ctx, frame, backgroundOpacity = 1, debugView = false) {
  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;
  let drawWidth = canvasWidth;
  let drawHeight = canvasHeight;
  const videoWidth = frame.videoWidth;
  const videoHeight = frame.videoHeight;
  let xOffset = 0;
  let yOffset = 0;
  const videoWidthInDrawCoords = (videoWidth / videoHeight) * drawHeight;
  const videoHeightInDrawCoords = (videoHeight / videoWidth) * drawWidth;

  if (drawWidth > videoWidthInDrawCoords) {
    xOffset = Math.floor((drawWidth - videoWidthInDrawCoords) / 2);
    drawWidth = videoWidthInDrawCoords;
  } else if (drawHeight > videoHeightInDrawCoords) {
    yOffset = Math.floor((drawHeight - videoHeightInDrawCoords) / 2);
    drawHeight = videoHeightInDrawCoords;
  }

  function toDrawPoint(position) {
    return {
      x: xOffset + (position.x * drawWidth) / videoWidth,
      y: yOffset + (position.y * drawHeight) / videoHeight,
    };
  }

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = `rgba(255,255,255,${backgroundOpacity})`;
  if (frame.dropped) ctx.fillStyle = "gray";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // ✅ 遍历每个人的姿势，画 Q版人物
  if (frame.poses && frame.poses.length > 0) {
    for (const pose of frame.poses) {
      await paintQPose(ctx, pose, toDrawPoint);
    }
  }

  // ✅ 如果有额外物品
  if (frame.items) {
    frame.items.forEach((item) => drawItem(ctx, item, canvasWidth, canvasHeight));
  }
}

// ✅ 保留物品绘制逻辑
function drawIconImage(ctx, canvasWidth, canvasHeight, iconImage) {
  const padding = canvasWidth * 0.01;
  const signWidth = Math.min(canvasWidth, canvasHeight) - padding * 2;
  ctx.drawImage(
    iconImage,
    (canvasWidth - signWidth) / 2,
    (canvasHeight - signWidth) / 2,
    signWidth,
    signWidth
  );
}
function drawItem(ctx, item, canvasWidth, canvasHeight) {
  switch (item.type) {
    case "stopsign":
    case "allowsign":
      const iconImage = Items.getImage(item.type);
      drawIconImage(ctx, canvasWidth, canvasHeight, iconImage);
    default:
    // noop
  }
}

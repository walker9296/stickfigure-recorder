// MoveNet → PoseNet 的关节名称映射
const nameMap = {
  nose:           "nose",
  left_eye:       "leftEye",
  right_eye:      "rightEye",
  left_ear:       "leftEar",
  right_ear:      "rightEar",
  left_shoulder:  "leftShoulder",
  right_shoulder: "rightShoulder",
  left_elbow:     "leftElbow",
  right_elbow:    "rightElbow",
  left_wrist:     "leftWrist",
  right_wrist:    "rightWrist",
  left_hip:       "leftHip",
  right_hip:      "rightHip",
  left_knee:      "leftKnee",
  right_knee:     "rightKnee",
  left_ankle:     "leftAnkle",
  right_ankle:    "rightAnkle"
};

// 将 MoveNet keypoints 转为 PoseNet 风格并映射 part 名称
export function adaptKeypoints(mkps) {
  return mkps.map(kp => ({
    part: nameMap[kp.name] || kp.name,      // name → part，找不到就原样保留
    position: { x: kp.x, y: kp.y },
    score: kp.score
  }));
}

export function adaptPose(mp) {
  const score = mp.score ??
    mp.keypoints.reduce((sum, k) => sum + k.score, 0) / mp.keypoints.length;
  return { score, keypoints: adaptKeypoints(mp.keypoints) };
}

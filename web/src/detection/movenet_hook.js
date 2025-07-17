import { useEffect, useState, useRef } from "react";
import * as poseDetection from "@tensorflow-models/pose-detection";
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";

export const moveNetConfig = {
  modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
};

export default function useMoveNet() {
  const [detector, setDetector] = useState(null);
  const inited = useRef(false);

  useEffect(() => {
    if (inited.current) return;
    inited.current = true;
    (async () => {
      await tf.setBackend("webgl");
      await tf.ready();
      const d = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        moveNetConfig
      );
      setDetector(d);
      console.log("✅ MoveNet loaded");
    })();
  }, []);

  return detector;
}

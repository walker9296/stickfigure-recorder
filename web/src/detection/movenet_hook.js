import { useEffect, useState, useRef } from "react";
import * as poseDetection from "@tensorflow-models/pose-detection";
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";

/**
 * 根据用户选择动态加载 MoveNet 模型
 * @param {"single" | "multi"} poseMode 单人/多人
 * @param {"lightning" | "thunder"} modelPrecision 模型精度/速度
 */
export default function useMoveNet(poseMode = "single", modelPrecision = "lightning") {
  const [detector, setDetector] = useState(null);
  const loadedConfigRef = useRef({ mode: null, precision: null });

  useEffect(() => {
    (async () => {
      // 如果模式没变，就不重新加载，避免重复初始化
      if (
        loadedConfigRef.current.mode === poseMode &&
        loadedConfigRef.current.precision === modelPrecision &&
        detector
      ) {
        return;
      }

      console.log("🔄 正在加载 MoveNet 模型:", poseMode, modelPrecision);

      loadedConfigRef.current = { mode: poseMode, precision: modelPrecision };

      await tf.setBackend("webgl");
      await tf.ready();

      // ✅ 组合模型类型
      let modelType;
      if (poseMode === "single") {
        modelType =
          modelPrecision === "lightning"
            ? poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING
            : poseDetection.movenet.modelType.SINGLEPOSE_THUNDER;
      } else {
        modelType =
          modelPrecision === "lightning"
            ? poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING
            : poseDetection.movenet.modelType.MULTIPOSE_THUNDER;
      }

      const d = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        { modelType }
      );

      console.log("✅ MoveNet 模型加载完成:", modelType);
      setDetector(d);
    })();
  }, [poseMode, modelPrecision]);

  return detector;
}

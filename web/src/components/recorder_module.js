import {
  useRef,
  useState,
  useEffect,
} from "react";
import {
  Button, Checkbox, FormControlLabel, FormControl, FormLabel, Slider,
  Radio, RadioGroup, Typography
} from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import PoseCanvas from "../detection/pose_canvas.js";
import useAnimationFrame from "../common/animation_frame_hook.js";
import CameraVideo from "../detection/camera_reader.js";
import UploadedVideo from "./uploaded_video.js";
import useMoveNet from "../detection/movenet_hook.js";
import PoseSmoother from "../detection/smoother.js";
import Loader from "react-loader-spinner";
import { normalizeTime } from "../detection/recording_editor.js";
import { useTranslation } from "react-i18next";
import ItemSelectorPanel from "./item_selector.js";
import common from "stickfigurecommon";
import { adaptPose } from "../detection/adapt";

const DEFAULT_FRAMERATE = 30;
const useStyles = makeStyles((theme) => ({
  root: {},
  canvasContainer: {
    marginTop: "8px",
    marginBottom: "8px",
    padding: "8px",
    display: "inline-block",
  },
  canvasParent: {
    position: "relative",
    display: "inline-block",
  },
  videoCanvas: {
    width: "80%",
    height: "80%",
  },
  canvas: {
    position: "absolute",
    top: "0",
    left: "0",
    width: "80%",
  },
  canvasWhenDebug: {
    position: "absolute",
    top: "0px",
    left: "200px",
    width: "80%",
  },
  debugCanvas: {
    position: "absolute",
    top: "0px",
    left: "0px",
    width: "80%",
  },
  loader: {
    display: "flex",
    alignItems: "center",
  },
  loaderSpinner: {
    margin: "4px",
  },
  formControl: {
    marginTop: "8px",
    borderTop: "solid #dddddd 1px",
    paddingTop: "8px",
  },
}));

function distBetweenSmootherAndPose(poseSmoother, pose) {
  let sumDist = 0;
  let n = 0;
  pose.keypoints
    .filter((feature) => feature.score > 0.5)
    .forEach((feature) => {
      let featureSmoother = poseSmoother.smoother(feature);
      if (featureSmoother.num() === 0) {
        return;
      }
      const smoothed = featureSmoother.smoothed();
      const dist = common.PointUtil.distBetween(
        feature.position,
        smoothed
      );
      sumDist += dist;
      n++;
    });
  if (n === 0) {
    return undefined;
  }
  return sumDist / n;
}

function performSmoothing(poses, poseSmoothersRef, smoothingWindow) {
  const poseSmootherPairs = [];
  poses.forEach((pose, poseIndex) => {
    poseSmoothersRef.current.forEach((smoother, smootherIndex) => {
      const dist = distBetweenSmootherAndPose(smoother, pose);
      poseSmootherPairs.push({
        poseIndex,
        smootherIndex,
        dist,
      });
    });
  });
  poseSmootherPairs.sort((i, j) => i.dist - j.dist);

  const usedPoses = {};
  const usedSmoothers = {};
  poseSmootherPairs.forEach(({ poseIndex, smootherIndex }) => {
    if (usedPoses[poseIndex]) return;
    if (usedSmoothers[smootherIndex]) return;
    poseSmoothersRef.current[smootherIndex].smooth(poses[poseIndex]);
    poses[poseIndex].smoother =
      poseSmoothersRef.current[smootherIndex].name;
    usedPoses[poseIndex] = true;
    usedSmoothers[smootherIndex] = true;
  });

  poseSmoothersRef.current = poseSmoothersRef.current.filter(
    (s, idx) => usedSmoothers[idx]
  );

  poses
    .filter((pose, poseIndex) => !usedPoses[poseIndex])
    .forEach((pose) => {
      const smoother = new PoseSmoother(smoothingWindow);
      smoother.name = `smoother_${poseSmoothersRef.current.length}`;
      poseSmoothersRef.current.push(smoother);
      smoother.smooth(pose);
    });
}

async function singlePoseDetection(detector, video) {
  const poses = await detector.estimatePoses(video, {
    maxPoses: 1,
    flipHorizontal: false,
  });
  return poses.length > 0 ? [poses[0]] : [];
}

async function multiPoseDetection(detector, video) {
  return detector.estimatePoses(video, {
    maxPoses: 6,
    flipHorizontal: false,
  });
}

function useRecording(
  detector,
  videoElement,
  isRecording,
  smoothingWindow,
  allowMultiplePoses,
  selectedItems,
  isUploadedVideo,
  stopRecord,
  uploadedVideoFps
) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState({
    frames: [],
  });

  const loadingMessage =
    isRecording && (!detector || !videoElement)
      ? t("Waiting for") +
        [
          !detector && t("MoveNet"),
          !videoElement && t("video"),
        ]
          .filter((x) => x)
          .join(", ")
      : undefined;

  const smoothersRef = useRef([]);
  useAnimationFrame(
    async (timeSinceLastFrameMs, timeSinceStartMs, isDead) => {
      if (
        !videoElement ||
        videoElement.videoWidth === 0 ||
        videoElement.videoHeight === 0
      ) {
        return;
      }
      videoElement.width = videoElement.videoWidth;
      videoElement.height = videoElement.videoHeight;

      const frame = {};
      if (!detector) {
        frame.poses = [];
      } else {
        const raw = allowMultiplePoses
          ? await multiPoseDetection(detector, videoElement)
          : await singlePoseDetection(detector, videoElement);
        frame.poses = raw.map(adaptPose);
      }

      performSmoothing(frame.poses, smoothersRef, smoothingWindow);

      frame.videoWidth = videoElement.videoWidth;
      frame.videoHeight = videoElement.videoHeight;
      frame.t = timeSinceStartMs;
      frame.items = selectedItems;

      if (isDead()) return;
      if (timeSinceStartMs === 0) return;

      setRecording((prevRecording) => ({
        frames: [
          ...prevRecording.frames,
          {
            ...frame,
            frameIndex: prevRecording.frames.length,
          },
        ],
      }));

      if (isUploadedVideo) {
        const nextTime =
          videoElement.currentTime + 1 / uploadedVideoFps;
        if (nextTime < videoElement.duration) {
          await new Promise((res) => {
            videoElement.onseeked = res;
            videoElement.currentTime = nextTime;
          });
        } else {
          stopRecord(recording);
          return;
        }
      }
    },
    isRecording && detector && videoElement,
    isUploadedVideo ? 1 : DEFAULT_FRAMERATE,
    isUploadedVideo,
    [videoElement, selectedItems, isUploadedVideo, detector]
  );
  return [recording, loadingMessage];
}

function RecorderModule({ recordingCallback }) {
  const classes = useStyles();
  const { t } = useTranslation();

  const [isRecording, setIsRecording] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [smoothingWindow, setSmoothingWindow] = useState(4);
  const [backCamera, setBackCamera] = useState(false);
  const [videoUrl, setVideoUrl] = useState();
  const [isUploadedVideo, setIsUploadedVideo] = useState(false);
  const [videoElement, setVideoElement] = useState();
  const [uploadedVideoFps, setUploadedVideoFps] = useState(DEFAULT_FRAMERATE);
  const recordingRef = useRef({ frames: [] });

  // ✅ 新增：模型参数选择
  const [poseMode, setPoseMode] = useState("single"); // "single" or "multi"
  const [modelPrecision, setModelPrecision] = useState("lightning"); // "lightning" or "thunder"

  // ✅ 根据 UI 选择加载不同 MoveNet 模型
  const detector = useMoveNet(poseMode, modelPrecision);

  const stopRecord = () => {
    setIsRecording(false);
    if (recordingRef.current.frames.length === 0) return;

    let tweakedRecording = JSON.parse(JSON.stringify(recordingRef.current));
    tweakedRecording.firstFrame = 0;
    tweakedRecording.lastFrame = tweakedRecording.frames.length - 1;
    normalizeTime(tweakedRecording);
    tweakedRecording.framerate = isUploadedVideo ? uploadedVideoFps : DEFAULT_FRAMERATE;
    tweakedRecording.exportWidth = recordingRef.current.frames[0].videoWidth;
    tweakedRecording.exportHeight = recordingRef.current.frames[0].videoHeight;
    recordingCallback(tweakedRecording);
  };

  const [recording, loadingMessage] = useRecording(
    detector,
    videoElement,
    isRecording,
    smoothingWindow,
    poseMode === "multi",
    selectedItems,
    isUploadedVideo,
    stopRecord,
    uploadedVideoFps
  );

  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  const [debugView, setDebugView] = useState(false);

  const startRecord = () => {
    setIsRecording(true);
    if (isUploadedVideo && videoElement) {
      videoElement.pause();
    }
  };

  if (!detector) {
    return (
      <div className={classes.loader}>
        <Loader
          className={classes.loaderSpinner}
          type="Oval"
          color="#888888"
          height={48}
          width={48}
        ></Loader>
        {t("Loading MoveNet")}
      </div>
    );
  }

  return (
    <div className={classes.root}>
      <div>
        {!isRecording && (
          <div>
            <div>
              <div className={classes.recordButtonContainer}>
                <Button
                  disabled={!detector}
                  onClick={startRecord}
                  variant="contained"
                  color="primary"
                >
                  {t("Record!")}
                </Button>
                <input
                  accept="video/mp4,video/x-m4v,video/*"
                  style={{ display: "none" }}
                  id="raised-button-file"
                  multiple
                  type="file"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      const url = URL.createObjectURL(file);
                      setVideoUrl(url);
                      setIsUploadedVideo(true);
                      startRecord();
                    }
                  }}
                />
                &nbsp;&nbsp;&nbsp;&nbsp;
                <label htmlFor="raised-button-file">
                  <Button
                    variant="contained"
                    color="primary"
                    component="span"
                  >
                    {t("Upload")}
                  </Button>
                </label>
              </div>

              {/* ✅ 新增模型选择 UI */}
              <div className={classes.formControl}>
                <FormLabel>{t("Detection mode")}</FormLabel>
                <RadioGroup
                  row
                  value={poseMode}
                  onChange={(e) => setPoseMode(e.target.value)}
                >
                  <FormControlLabel
                    value="single"
                    control={<Radio />}
                    label={t("Single person")}
                  />
                  <FormControlLabel
                    value="multi"
                    control={<Radio />}
                    label={t("Multiple people")}
                  />
                </RadioGroup>

                <FormLabel>{t("Model type")}</FormLabel>
                <RadioGroup
                  row
                  value={modelPrecision}
                  onChange={(e) => setModelPrecision(e.target.value)}
                >
                  <FormControlLabel
                    value="lightning"
                    control={<Radio />}
                    label={t("Lightning (fast)")}
                  />
                  <FormControlLabel
                    value="thunder"
                    control={<Radio />}
                    label={t("Thunder (accurate)")}
                  />
                </RadioGroup>
              </div>

              <div className={classes.formControl}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={backCamera}
                      onChange={(event) =>
                        setBackCamera(event.target.checked)
                      }
                    />
                  }
                  label={t("Use the back camera")}
                />
              </div>
              <div className={classes.formControl}>
                <FormControl component="fieldset">
                  <FormLabel component="legend">
                    {t("Smoothing window")}
                  </FormLabel>
                  <Slider
                    value={smoothingWindow}
                    onChange={(e, newValue) => setSmoothingWindow(newValue)}
                    valueLabelDisplay="auto"
                    min={1}
                    max={DEFAULT_FRAMERATE * 2}
                  />
                </FormControl>
              </div>
            </div>
          </div>
        )}

        {isRecording && recording.frames.length > 0 && (
          <Button onClick={stopRecord} variant="contained" color="primary">
            {t("Stop")}
          </Button>
        )}
      </div>

      {isRecording && (
        <div className={classes.canvasContainer}>
          <div>
            <FormControlLabel
              control={
                <Checkbox
                  checked={debugView}
                  onChange={(event) =>
                    setDebugView(event.target.checked)
                  }
                  name="chkDebugView"
                  color="primary"
                />
              }
              label={t("Debug view")}
            />
          </div>
          <div className={classes.canvasParent}>
            {loadingMessage && (
              <div className={classes.loader}>
                <Loader
                  className={classes.loaderSpinner}
                  type="Oval"
                  color="#888888"
                  height={48}
                  width={48}
                ></Loader>
                {loadingMessage}
              </div>
            )}

            {isRecording && !videoUrl && (
              <CameraVideo
                className={classes.videoCanvas}
                readyCallback={setVideoElement}
                backCamera={backCamera}
              />
            )}
            {isRecording && videoUrl && (
              <UploadedVideo
                className={classes.videoCanvas}
                readyCallback={(videoElement, fps) => {
                  setVideoElement(videoElement);
                  setUploadedVideoFps(fps);
                }}
                videoUrl={videoUrl}
                onEnded={stopRecord}
              />
            )}

            <PoseCanvas
              className={debugView ? classes.debugCanvas : classes.canvas}
              frame={
                recording &&
                recording.frames.length &&
                recording.frames[recording.frames.length - 1]
              }
              backgroundOpacity={debugView ? 0 : 0.5}
              debugView={debugView}
            />
          </div>
        </div>
      )}
      <ItemSelectorPanel
        selectedItems={selectedItems}
        selectedItemsCallback={setSelectedItems}
      />
    </div>
  );
}
export default RecorderModule;

import {
    useRef,
    useEffect,
} from "react";

function UploadedVideo({ className, readyCallback, videoUrl, onEnded }) {
    const videoRef = useRef();

    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.onloadedmetadata = () => {
                readyCallback(videoRef.current, 30); // Assuming 30 FPS for uploaded videos
            };
        }
    }, [readyCallback]);

    return <video ref={videoRef} src={videoUrl} playsInline className={className} onEnded={onEnded} />;
}

export default UploadedVideo;
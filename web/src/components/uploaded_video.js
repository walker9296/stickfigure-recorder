import {
    useRef,
    useEffect,
} from "react";

function UploadedVideo({ className, readyCallback, videoUrl, onEnded }) {
    const videoRef = useRef();

    useEffect(() => {
        if (videoRef.current) {
            readyCallback(videoRef.current);
        }
    }, [readyCallback]);

    return <video ref={videoRef} src={videoUrl} autoPlay playsInline className={className} onEnded={onEnded} />;
}

export default UploadedVideo;
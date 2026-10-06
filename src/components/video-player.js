"use client";

import { useRef, useState } from "react";
import { Maximize, Pause, Play, Volume2, VolumeX } from "lucide-react";

const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 2];

function formatTime(value) {
  if (!Number.isFinite(value)) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export default function VideoPlayer({ src, autoPlay = false, onEnded, className = "" }) {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  async function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      try {
        await video.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    } else {
      video.pause();
      setPlaying(false);
    }
  }

  function changeVolume(value) {
    const nextVolume = Number(value);
    setVolume(nextVolume);
    setMuted(nextVolume === 0);
    if (videoRef.current) {
      videoRef.current.volume = nextVolume;
      videoRef.current.muted = nextVolume === 0;
    }
  }

  function toggleMute() {
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (!nextMuted && volume === 0) {
      setVolume(1);
      if (videoRef.current) videoRef.current.volume = 1;
    }
    if (videoRef.current) videoRef.current.muted = nextMuted;
  }

  function changeRate(value) {
    const nextRate = Number(value);
    setPlaybackRate(nextRate);
    if (videoRef.current) videoRef.current.playbackRate = nextRate;
  }

  function seek(value) {
    const nextTime = Number(value);
    setCurrentTime(nextTime);
    if (videoRef.current) videoRef.current.currentTime = nextTime;
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void playerRef.current?.requestFullscreen?.();
  }

  return <div className={`custom-video-player ${className}`} ref={playerRef}>
    <video
      ref={videoRef}
      className="custom-video-player-media"
      src={src}
      autoPlay={autoPlay}
      playsInline
      preload="metadata"
      onClick={() => void togglePlayback()}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
      onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
      onDurationChange={(event) => setDuration(event.currentTarget.duration)}
      onEnded={() => { setPlaying(false); onEnded?.(); }}
    />
    <div className="video-player-controls" onClick={(event) => event.stopPropagation()}>
      <input className="video-player-seek" type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} onChange={(event) => seek(event.target.value)} aria-label="Seek video" />
      <div className="video-player-control-row">
        <button type="button" aria-label={playing ? "Pause video" : "Play video"} onClick={() => void togglePlayback()}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
        <span className="video-player-time">{formatTime(currentTime)} / {formatTime(duration)}</span>
        <button type="button" aria-label={muted ? "Unmute video" : "Mute video"} onClick={toggleMute}>{muted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>
        <input className="video-player-volume" type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} onChange={(event) => changeVolume(event.target.value)} aria-label="Volume" />
        <label className="video-player-rate-label"><span className="sr-only">Playback speed</span><select aria-label="Playback speed" value={playbackRate} onChange={(event) => changeRate(event.target.value)}>{playbackRates.map((rate) => <option key={rate} value={rate}>{rate}x</option>)}</select></label>
        <button type="button" aria-label="Enter fullscreen" onClick={toggleFullscreen}><Maximize size={16} /></button>
      </div>
    </div>
  </div>;
}
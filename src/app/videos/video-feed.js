"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Clapperboard, Play } from "lucide-react";
import VideoPlayer from "@/components/video-player";

export default function VideoFeed({ videos }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [autoPlayNext, setAutoPlayNext] = useState(false);
  const activeVideo = videos[activeIndex];

  function selectVideo(index) {
    setActiveIndex(index);
    setAutoPlayNext(true);
  }

  function advanceVideo() {
    if (videos.length > 1) {
      setAutoPlayNext(true);
      setActiveIndex((index) => (index + 1) % videos.length);
    } else {
      setAutoPlayNext(false);
    }
  }

  return <main className="videos-page">
    <div className="videos-content">
      <header className="videos-heading"><div><span className="eyebrow">TRIBE VIDEO</span><h1>Videos</h1><p>A watch queue from posts you can see.</p></div><span className="videos-total"><Clapperboard size={17} />{videos.length}</span></header>
      {activeVideo ? <div className="videos-layout">
        <section className="video-watch">
          <VideoPlayer key={activeVideo.id} src={activeVideo.mediaUrl} autoPlay={autoPlayNext} preload="metadata" onEnded={advanceVideo} />
          <div className="video-watch-copy">
            <span className="eyebrow">{activeIndex + 1} OF {videos.length}</span>
            {activeVideo.text && <p>{activeVideo.text}</p>}
            <Link href={`/profile/${encodeURIComponent(activeVideo.username || activeVideo.profileId)}`}>{activeVideo.name}</Link>
            <time>{activeVideo.createdAt}</time>
          </div>
          <div className="video-watch-actions">
            <button type="button" onClick={() => selectVideo((activeIndex - 1 + videos.length) % videos.length)} disabled={videos.length < 2}><ArrowUp size={15} />Previous</button>
            <button type="button" onClick={() => selectVideo((activeIndex + 1) % videos.length)} disabled={videos.length < 2}>Next<ArrowDown size={15} /></button>
          </div>
        </section>
        <aside className="video-queue" aria-label="Video queue">
          <h2>Up next <span>{videos.length}</span></h2>
          <div className="video-queue-list">{videos.map((video, index) => <button className={`video-queue-item ${index === activeIndex ? "selected" : ""}`} key={video.id} type="button" onClick={() => selectVideo(index)} aria-current={index === activeIndex ? "true" : undefined}>
            <span className="video-queue-play"><Play size={15} fill="currentColor" /></span>
            <span className="video-queue-copy"><strong>{video.name}</strong><small>{video.text || "Video post"}</small><time>{video.createdAt}</time></span>
          </button>)}</div>
        </aside>
      </div> : <section className="videos-empty surface"><Clapperboard size={25} /><h2>No videos to play yet</h2><p>Videos shared in posts you can access will appear here.</p><Link href="/">Back to the feed</Link></section>}
    </div>
  </main>;
}
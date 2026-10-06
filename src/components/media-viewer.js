"use client";

import { useEffect } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import VideoPlayer from "@/components/video-player";

export default function MediaViewer({ src, type, onClose }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return <div className="media-viewer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="media-viewer" role="dialog" aria-modal="true" aria-label={type === "video" ? "Video preview" : "Photo preview"}>
      <button className="media-viewer-close" type="button" onClick={onClose} aria-label="Close preview"><X size={21} /></button>
      {type === "video"
        ? <VideoPlayer src={src} className="media-viewer-video" />
        : <div className="media-viewer-image-frame"><Image src={src} alt="Expanded post photo" fill sizes="100vw" unoptimized /></div>}
    </section>
  </div>;
}
"use client";

import { useEffect } from "react";
import Image from "next/image";
import { Download, X } from "lucide-react";
import VideoPlayer from "@/components/video-player";
import { getMediaDownload } from "@/lib/media-download";

export default function MediaViewer({ src, type, onClose }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return <div className="media-viewer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section
      className="media-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={type === "video" ? "Video preview" : "Photo preview"}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget || !event.target.closest(".media-viewer-content")) {
          onClose();
        }
      }}
    >
      {type !== "video" && (() => {
        const download = getMediaDownload(src, "photo");
        return <a className="media-viewer-download" href={download.href} download={download.filename} onMouseDown={(event) => event.stopPropagation()} aria-label="Save photo" title="Save photo"><Download size={19} /></a>;
      })()}
      <button className="media-viewer-close" type="button" onMouseDown={(event) => event.stopPropagation()} onClick={onClose} aria-label="Close preview"><X size={21} /></button>
      {type === "video"
        ? <div className="media-viewer-content"><VideoPlayer src={src} preload="metadata" className="media-viewer-video" /></div>
        : <div className="media-viewer-content media-viewer-image-frame"><Image className="media-viewer-image" src={src} alt="Expanded post photo" width={1600} height={1200} unoptimized /></div>}
    </section>
  </div>;
}
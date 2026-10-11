export function getMediaDownload(src, mediaType) {
  const fallbackExtension = mediaType === "video" ? "mp4" : "jpg";
  let extension = fallbackExtension;
  let href = src;

  try {
    const url = new URL(src, "https://media-download.invalid");
    extension = url.pathname.match(/\.([a-z0-9]{1,8})$/i)?.[1]?.toLowerCase() || fallbackExtension;

    if (url.protocol === "http:" || url.protocol === "https:") {
      const downloadUrl = new URL(src);
      downloadUrl.searchParams.set("download", `tribe-${mediaType}.${extension}`);
      href = downloadUrl.toString();
    }
  } catch {
    extension = fallbackExtension;
  }

  return {
    href,
    filename: `tribe-${mediaType}.${extension}`,
  };
}
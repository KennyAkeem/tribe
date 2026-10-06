export default function manifest() {
  return {
    name: "Tribe",
    short_name: "Tribe",
    description: "Tribe is where your people, your posts, and your social circle stay close.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f8f5",
    theme_color: "#336a55",
    lang: "en",
    orientation: "portrait-primary",
    id: "/",
    icons: [
      {
        src: "/app-icon.jpeg",
        sizes: "192x192",
        type: "image/jpeg",
        purpose: "any",
      },
      {
        src: "/app-icon.jpeg",
        sizes: "512x512",
        type: "image/jpeg",
        purpose: "maskable any",
      },
    ],
  };
}

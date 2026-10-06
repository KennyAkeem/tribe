import "./globals.css";
import "./settings-themes.css";
import "@fontsource-variable/manrope";
import "@fontsource/dm-serif-display/400.css";
import { AppearanceProvider } from "@/components/appearance-provider";
import ConfettiPreloader from "@/components/confetti-preloader";
import InstallPrompt from "@/components/install-prompt";
import SiteNavigation from "./site-navigation";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: "Tribe — Your people, your place",
  description: "A little corner of the internet that feels like yours.",
  applicationName: "Tribe",
  keywords: [
    "social app",
    "community",
    "friendship",
    "mobile social network",
    "Tribe",
  ],
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
      { url: "/app-icon.jpeg", sizes: "192x192", type: "image/jpeg" },
    ],
    shortcut: "/favicon.ico",
    apple: "/app-icon.jpeg",
  },
  openGraph: {
    title: "Tribe — Your people, your place",
    description: "A little corner of the internet that feels like yours.",
    url: siteUrl,
    siteName: "Tribe",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tribe — Your people, your place",
    description: "A little corner of the internet that feels like yours.",
    creator: "@tribeapp",
  },
  alternates: {
    canonical: "/",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Tribe",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport = {
  themeColor: "#336a55",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" data-color-mode="light" data-ui-theme="glass" data-density="comfortable" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: `(()=>{try{const s=JSON.parse(localStorage.getItem("tribe-appearance")||"{}");const m=["light","dark","system"].includes(s.colorMode)?s.colorMode:"light";const t=["glass","clay","skeuomorphic","neumorphic"].includes(s.uiStyle)?s.uiStyle:"glass";document.documentElement.dataset.colorMode=m==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):m;document.documentElement.dataset.modeChoice=m;document.documentElement.dataset.uiTheme=t;document.documentElement.dataset.density=s.compact?"compact":"comfortable";document.documentElement.dataset.reduceMotion=s.reduceMotion?"true":"false"}catch{}})();` }} />
        <AppearanceProvider>
          <ConfettiPreloader />
          <InstallPrompt />
          <SiteNavigation />
          {children}
        </AppearanceProvider>
      </body>
    </html>
  );
}

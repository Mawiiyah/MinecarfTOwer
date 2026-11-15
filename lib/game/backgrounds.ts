export type BackgroundKind =
  | "purple_night"
  | "landscape_3d"
  | "classic_night"
  | "pixel_art"
  | "custom";

export interface BackgroundOption {
  id: BackgroundKind;
  name: string;
  tagline: string;
  type: "image" | "3d" | "procedural";
  url?: string;
  thumbnail?: string;
  badge?: string;
}

export const BACKGROUND_OPTIONS: BackgroundOption[] = [
  {
    id: "purple_night",
    name: "💜 Neon Purple Aurora",
    tagline: "Magical purple night, glowing shoreline & aurora",
    type: "image",
    url: "/backgrounds/purple_night.jpg",
    thumbnail: "/backgrounds/purple_night.jpg",
    badge: "Bago",
  },
  {
    id: "landscape_3d",
    name: "🏝️ 3D Island World",
    tagline: "Interactive 3D low-poly landscape, ocean & clouds",
    type: "3d",
  },
  {
    id: "classic_night",
    name: "🌙 Classic Night",
    tagline: "Dark Minecraft mountain ridge & night sky",
    type: "image",
    url: "/background.png",
    thumbnail: "/background.png",
  },
  {
    id: "pixel_art",
    name: "✨ Pixel Art Sky",
    tagline: "2D animated sky with drifting clouds & horizon",
    type: "procedural",
  },
  {
    id: "custom",
    name: "🖼️ Custom Upload",
    tagline: "Gamitin ang sarili mong larawan mula sa computer",
    type: "image",
  },
];

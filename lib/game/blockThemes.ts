import type { BlockType } from "./types";

export type BlockTheme =
  | "auto"
  | "astronaut"
  | "kuromi"
  | "classic"
  | "aqua"
  | "random_mix";

export interface BlockSetOption {
  id: BlockTheme;
  name: string;
  tagline: string;
  badge?: string;
  blocks: BlockType[];
}

export const BLOCK_THEMES: BlockSetOption[] = [
  {
    id: "auto",
    name: "🎭 Auto (Match Character)",
    tagline: "Kusang tutugma sa napiling character (Astronaut, Kuromi, etc.)",
    badge: "Recommended",
    blocks: ["space_suit", "kuromi_regular", "diamond", "aqua"],
  },
  {
    id: "astronaut",
    name: "🧑‍🚀 Astronaut Space Set",
    tagline: "5 Sci-Fi Space blocks: Space Suit, Hull, Meteor, Crate, Telemetry",
    badge: "Bago",
    blocks: ["space_suit", "shuttle_hull", "meteor_ore", "cargo_crate", "control_panel"],
  },
  {
    id: "kuromi",
    name: "🖤 Kuromi Gothic Set",
    tagline: "5 Dark jester skull blocks & punk ores",
    blocks: ["kuromi_regular", "dark_jester", "lucky_skull_box", "punk_ore", "spiked_castle"],
  },
  {
    id: "classic",
    name: "⛏️ Classic Minecraft Set",
    tagline: "Traditional Diamond, Gold, Grass, Stone, & Dirt",
    blocks: ["diamond", "gold", "grass", "stone", "dirt"],
  },
  {
    id: "aqua",
    name: "💎 Aqua Neon Set",
    tagline: "Clean, high-tech aqua crystal blocks",
    blocks: ["aqua"],
  },
  {
    id: "random_mix",
    name: "🎲 All Mixed (Random Lahat)",
    tagline: "Pinaghalong space, gothic, at classic blocks sa bawat patak",
    blocks: ["space_suit", "kuromi_regular", "meteor_ore", "diamond", "gold", "control_panel"],
  },
];

export interface IndividualBlockOption {
  type: BlockType;
  name: string;
  category: "astronaut" | "kuromi" | "classic";
  imageUrl?: string;
}

export const INDIVIDUAL_BLOCKS: IndividualBlockOption[] = [
  // Astronaut
  { type: "space_suit", name: "Space Suit (Visor)", category: "astronaut", imageUrl: "/blocks/space_suit.png" },
  { type: "shuttle_hull", name: "Shuttle Hull", category: "astronaut", imageUrl: "/blocks/shuttle_hull.png" },
  { type: "meteor_ore", name: "Meteor Ore", category: "astronaut", imageUrl: "/blocks/meteor_ore.png" },
  { type: "cargo_crate", name: "Cargo Crate", category: "astronaut", imageUrl: "/blocks/cargo_crate.png" },
  { type: "control_panel", name: "Control Panel", category: "astronaut", imageUrl: "/blocks/control_panel.png" },

  // Kuromi
  { type: "kuromi_regular", name: "Kuromi Regular", category: "kuromi", imageUrl: "/blocks/kuromi_regular.png" },
  { type: "dark_jester", name: "Dark Jester", category: "kuromi", imageUrl: "/blocks/dark_jester.png" },
  { type: "lucky_skull_box", name: "Lucky Skull Box", category: "kuromi", imageUrl: "/blocks/lucky_skull_box.png" },
  { type: "punk_ore", name: "Punk Ore", category: "kuromi", imageUrl: "/blocks/punk_ore.png" },
  { type: "spiked_castle", name: "Spiked Castle", category: "kuromi", imageUrl: "/blocks/spiked_castle.png" },

  // Classic & Aqua
  { type: "diamond", name: "Diamond Block", category: "classic" },
  { type: "gold", name: "Gold Block", category: "classic" },
  { type: "aqua", name: "Aqua Crystal", category: "classic" },
  { type: "grass", name: "Grass Block", category: "classic" },
  { type: "stone", name: "Stone Block", category: "classic" },
];

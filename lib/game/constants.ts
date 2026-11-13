// Logical canvas size (9:16). The canvas is CSS-scaled to fit any window.
export const W = 1080;
export const H = 1920;

// Grid
// A big tower: 15 x 20 = 300 blocks of 100px. It is wider AND taller than the
// screen, so the camera follows the builder sideways and up (see SCROLL_*).
// At rest its left edge sits a third of the way in, leaving scenery on the left;
// the rest runs off the right edge, like a tower filmed up close.
export const COLS = 15;
export const ROWS = 20;
export const CELL = 100;
export const BOX_W = COLS * CELL; // 1500
export const BOX_H = ROWS * CELL; // 2000
export const BORDER = 16; // frame thickness
export const BOX_X = 340;
/** Box floor sits at game y 1880, so its top starts far above the screen. */
export const BOX_Y = 1880 - BOX_H; // -120

// Camera: screen x = game x + scrollX, screen y = game y + scroll.
/** Screen y the builder's feet are kept at once the tower is tall enough. */
export const SCROLL_ANCHOR = 860;
export const MAX_SCROLL = SCROLL_ANCHOR - BOX_Y; // the full tower's top sits at the anchor
/** Screen x the builder is kept near while the tower runs off-screen. */
export const SCROLL_X_ANCHOR = W * 0.72;
/** Most the camera pans right (negative scrollX), so the tower's right wall just reaches the screen edge. */
export const MIN_SCROLL_X = Math.min(0, W - (BOX_X + BOX_W + BORDER)); // -776

// TNT
export const TNT_SIZE = Math.round(CELL * 0.875); // 70
export const FUSE_SECONDS = 2.5;
export const BLAST_RADIUS = CELL * 2;
export const GRAVITY = 2600;
export const MAX_ACTIVE_TNT = 120;
export const MAX_QUEUE = 500;
export const SPAWN_STAGGER = 0.14; // later TNT of a big gift falls into earlier craters

// Effects
export const MAX_PARTICLES = 2200;
export const WIN_DURATION = 5;

// HUD layout (screen space)
export const LEADERBOARD_Y = H - 250;

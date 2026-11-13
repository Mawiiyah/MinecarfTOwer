# TNT Box — TikTok LIVE interactive game

A 1080×1920 (9:16) Minecraft-inspired 3-D "TNT Box" overlay (Three.js / WebGL). Viewers send gifts to drop TNT into the box. The streamer's builder starts at the top of the box. Every column they walk into gets a block that drops to the bottom, so the box fills from the bottom up, and the builder can only stand on blocks they built. If the box stays **100% full** for the whole timer, the streamer wins the round.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
# or for streaming:
npm run build && npm start
```

## Hook it up to TikTok LIVE

1. Install and open **TikFinity** and connect it to your LIVE.
2. In TikFinity, enable the **WebSocket API** (default `ws://localhost:21213`).
3. In OBS / TikTok LIVE Studio add a **Browser Source** → `http://localhost:3000`, size **1080 × 1920**.
4. The badge in the top-left shows `Connected` / `Disconnected`; the hook reconnects automatically (1s → 10s backoff).

## Controls

- **← → / A D** — walk. Each column you walk into gets a block (it drops to the bottom of that column). You can climb one block; a taller column is a wall.
- **↑ / W / Space** — jump (you can steer left/right in the air, but no blocks are placed mid-air).
- **↓ / S** — build a block under yourself (pillar up). Only works once you have landed.
- The builder only moves when you steer it. To let it walk by itself after 3 s without input (heading for the lowest column), turn on *Builder walks by itself when idle* in the drawer.
- **H** — toggle the streamer control drawer (closed by default so it stays off-stream). In OBS, right-click the source → *Interact* to press H. A hidden button in the top-right corner also appears on hover.
- **Esc** — close the drawer.
- Test buttons send fake TikFinity messages through the real parser.
- Settings (timer, builder walk speed, volume, toggles, WebSocket URL) are saved in `localStorage`.

## Rules

| Gift value (coins per gift) | TNT per gift |
| --- | --- |
| 1–5 | 1 |
| 6–29 | 5 |
| 30+ | 20 |

- Streak (combo) gifts drop TNT live as the combo grows; each extra gift in the combo adds its TNT (e.g. Rose ×10 = 10 TNT).
- Blocks always stack from the bottom of a column. When TNT blows a hole, the blocks above drop down to fill it, so the gaps are always at the top.
- The builder can only stand on blocks they built. If their column is blown away completely, they place a block under themselves when they land.
- On autopilot the builder walks one column every *Builder Walk Speed* seconds, always heading for the lowest column.
- A TNT blast that catches the builder throws them into the air and stuns them for ~1.4 s.
- Each **like** drops 1 block into a random column (TikTok batches likes, so one event can add several).
- TNT explodes 2.5 s after spawning, destroying blocks within ~1.75 cells and chain-reacting nearby TNT.
- The timer only counts down while the box is full. Optional: reset it whenever a block is destroyed.

## Structure

```
app/                 layout, page, global styles
components/
  GameShell.tsx      wires engine + TikFinity hook + settings + panel
  TntBoxGame.tsx     mounts the canvas and connection badge
  ControlPanel.tsx   streamer drawer (tests, sliders, log)
  ConnectionBadge.tsx
hooks/useTikFinity.ts  WebSocket client, parsing, reconnect
lib/game/
  engine.ts          simulation + 2-D HUD (own rAF loop)
  scene3d.ts         Three.js renderer: box, blocks, TNT, builder, debris, blasts
  backdrop.ts        painted 2-D night scenery behind the 3-D scene
  textures.ts        procedural 16×16 pixel textures (also used as 3-D block faces)
  audio.ts           Web Audio synthesised SFX
  avatars.ts         profile picture cache
  giftRules.ts       coins → TNT mapping
  constants.ts, types.ts
```

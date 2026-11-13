"use client";

import { useEffect, useRef } from "react";
import type { TntBoxEngine } from "@/lib/game/engine";
import type { ConnectionStatus } from "@/hooks/useTikFinity";
import ConnectionBadge from "./ConnectionBadge";

interface Props {
  engine: TntBoxEngine;
  status: ConnectionStatus;
  showBadge: boolean;
}

/**
 * Mounts the game canvases full-window. The engine sizes the canvas to the window
 * and keeps the 1080x1920 play area centred, with scenery filling the rest.
 * In OBS / TikTok LIVE Studio, size the browser source 1080x1920 for just the play area.
 */
export default function TntBoxGame({ engine, status, showBadge }: Props) {
  const bgRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const bg = bgRef.current;
    const gl = glRef.current;
    const hud = hudRef.current;
    if (!bg || !gl || !hud) return;
    engine.attach(bg, gl, hud);
    return () => engine.detach();
  }, [engine]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {/* Scenery (2-D) → box, blocks, TNT and builder (3-D, WebGL) → HUD (2-D). */}
      <canvas ref={bgRef} className="absolute inset-0 h-full w-full" />
      <canvas ref={glRef} className="absolute inset-0 h-full w-full" />
      <canvas ref={hudRef} className="absolute inset-0 h-full w-full" />
      {/* Same box as the play area, so the badge stays on the game, not the window edge. */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 aspect-[9/16] h-[min(100%,177.78vw)] -translate-x-1/2 -translate-y-1/2">
        {showBadge && <ConnectionBadge status={status} className="absolute bottom-[1%] left-[2.5%]" />}
      </div>
    </div>
  );
}

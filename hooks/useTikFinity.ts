"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { tntForCoins } from "@/lib/game/giftRules";
import type { GiftDrop, Viewer } from "@/lib/game/types";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface BridgeState {
  username: string;
  status: "idle" | "connecting" | "live" | "waiting";
  message: string;
}

export interface LikeEvent {
  viewer: Viewer;
  likeCount: number;
}

export interface ChatEvent {
  viewer: Viewer;
  comment: string;
}

interface Options {
  url: string;
  onGift?: (g: GiftDrop) => void;
  onLike?: (l: LikeEvent) => void;
  onChat?: (c: ChatEvent) => void;
  onFollow?: (viewer: Viewer) => void;
  onShare?: (viewer: Viewer) => void;
}

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null;

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function viewerFrom(d: Json): Viewer {
  const nickname = String(d.nickname || d.uniqueId || "viewer");
  const id = String(d.userId ?? d.uniqueId ?? nickname);
  const avatar = d.profilePictureUrl;
  return { id, nickname, avatarUrl: typeof avatar === "string" && avatar ? avatar : undefined };
}

/**
 * Connects to the TikFinity desktop app's local WebSocket API and turns its
 * events into game actions. Reconnects automatically with exponential backoff.
 *
 * TikFinity message shape: { "event": "gift" | "like" | "chat" | ..., "data": { ... } }
 */
export function useTikFinity({ url, onGift, onLike, onChat, onFollow, onShare }: Options) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const [bridge, setBridge] = useState<BridgeState | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Keep latest handlers without re-opening the socket when they change.
  const handlers = useRef({ onGift, onLike, onChat, onFollow, onShare });
  useEffect(() => {
    handlers.current = { onGift, onLike, onChat, onFollow, onShare };
  }, [onGift, onLike, onChat, onFollow, onShare]);

  // Streakable gifts (giftType 1) send repeated events with a growing repeatCount.
  // We track the last count per user+gift and only act on the delta, so TNT
  // drops live during a combo without double counting.
  const streaks = useRef(new Map<string, number>());

  const handleMessage = useCallback((raw: unknown) => {
    if (!isObj(raw)) return;
    const event = String(raw.event ?? raw.type ?? "").toLowerCase();
    const data = isObj(raw.data) ? raw.data : raw;

    if (event === "bridge") {
      setBridge({
        username: String(data.username ?? ""),
        status: String(data.status ?? "idle") as BridgeState["status"],
        message: String(data.message ?? ""),
      });
      return;
    }

    if (event === "gift") {
      const viewer = viewerFrom(data);
      const giftName = String(data.giftName || "Gift");
      const diamondCount = Math.max(0, num(data.diamondCount));
      const repeatCount = Math.max(1, Math.floor(num(data.repeatCount, 1)));
      const streakable = num(data.giftType) === 1;

      let delta = repeatCount;
      if (streakable) {
        const key = `${viewer.id}:${String(data.giftId ?? giftName)}`;
        const prev = streaks.current.get(key) ?? 0;
        delta = repeatCount > prev ? repeatCount - prev : repeatCount < prev ? repeatCount : 0;
        if (data.repeatEnd) streaks.current.delete(key);
        else {
          if (streaks.current.size > 500) streaks.current.clear();
          streaks.current.set(key, repeatCount);
        }
      }
      if (delta <= 0) return;

      handlers.current.onGift?.({
        viewer,
        giftName,
        count: delta,
        coins: diamondCount * delta,
        tnt: tntForCoins(diamondCount) * delta,
        giftImageUrl: typeof data.giftPictureUrl === "string" && data.giftPictureUrl ? data.giftPictureUrl : undefined,
      });
    } else if (event === "like") {
      handlers.current.onLike?.({
        viewer: viewerFrom(data),
        likeCount: Math.max(1, Math.floor(num(data.likeCount, 1))),
      });
    } else if (event === "chat") {
      handlers.current.onChat?.({ viewer: viewerFrom(data), comment: String(data.comment ?? "") });
    } else if (event === "follow") {
      handlers.current.onFollow?.(viewerFrom(data));
    } else if (event === "share") {
      handlers.current.onShare?.(viewerFrom(data));
    }
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let disposed = false;

    const schedule = () => {
      if (disposed) return;
      const delay = Math.min(1000 * 2 ** attempt, 10_000);
      attempt++;
      timer = setTimeout(connect, delay);
    };

    const connect = () => {
      if (disposed) return;
      setStatus("connecting");
      try {
        ws = new WebSocket(url);
        wsRef.current = ws;
      } catch {
        setStatus("disconnected");
        schedule();
        return;
      }
      ws.onopen = () => {
        attempt = 0;
        setStatus("connected");
      };
      ws.onmessage = (e) => {
        try {
          handleMessage(JSON.parse(String(e.data)));
        } catch {
          /* ignore non-JSON frames */
        }
      };
      ws.onclose = () => {
        setStatus("disconnected");
        schedule();
      };
      ws.onerror = () => ws?.close();
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(timer);
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
      }
    };
  }, [url, reconnectNonce, handleMessage]);

  const reconnect = useCallback(() => setReconnectNonce((n) => n + 1), []);

  /** Feed a fake TikFinity message through the exact same parser (used by test buttons). */
  const inject = handleMessage;

  /** Ask the local bridge to (re)connect to a TikTok username. False if the bridge is unreachable. */
  const setUsername = useCallback((username: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return false;
    ws.send(JSON.stringify({ event: "setUsername", data: { username } }));
    return true;
  }, []);

  return { status, reconnect, inject, bridge, setUsername };
}

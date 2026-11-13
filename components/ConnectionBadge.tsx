"use client";

import type { ConnectionStatus } from "@/hooks/useTikFinity";

const STYLES: Record<ConnectionStatus, { label: string; dot: string; ring: string }> = {
  connected: { label: "Connected", dot: "bg-green-400", ring: "border-green-400/60 text-green-300" },
  connecting: { label: "Connecting…", dot: "bg-yellow-400 animate-pulse", ring: "border-yellow-400/60 text-yellow-200" },
  disconnected: { label: "Disconnected", dot: "bg-red-500", ring: "border-red-500/60 text-red-300" },
};

export default function ConnectionBadge({ status, className = "" }: { status: ConnectionStatus; className?: string }) {
  const s = STYLES[status];
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border bg-black/70 px-3 py-1 text-xs font-semibold ${s.ring} ${className}`}
      title="TikFinity WebSocket status"
    >
      <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
      TikFinity: {s.label}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  BLOCK_THEMES,
  INDIVIDUAL_BLOCKS,
  type BlockSetOption,
  type BlockTheme,
} from "@/lib/game/blockThemes";
import type { BlockType } from "@/lib/game/types";

interface Props {
  theme: BlockTheme;
  specificBlock?: BlockType | null;
  onChangeTheme: (theme: BlockTheme) => void;
  onSelectSpecificBlock: (block: BlockType | null) => void;
}

export default function BlockPicker({
  theme,
  specificBlock,
  onChangeTheme,
  onSelectSpecificBlock,
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"sets" | "single">("sets");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const currentTheme = BLOCK_THEMES.find((t) => t.id === theme) || BLOCK_THEMES[0];
  const currentSpecific = INDIVIDUAL_BLOCKS.find((b) => b.type === specificBlock);

  const buttonLabel = specificBlock
    ? `🧱 ${currentSpecific?.name || specificBlock}`
    : `🧱 ${currentTheme.name.split(" ")[1] || currentTheme.name}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-white/20 bg-black/70 px-4 py-2 text-sm font-bold text-white shadow-lg backdrop-blur transition hover:bg-black/85 active:scale-95"
      >
        <span className="text-base leading-none">🧱</span>
        <span>{buttonLabel.replace("🧱 ", "")}</span>
        <span className="text-xs text-zinc-400">▲ Blocks</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Pumili ng Blocks"
            className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/95 p-5 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h2 className="text-lg font-extrabold text-white">Pumili ng Gagamiting Blocks</h2>
                <p className="text-xs text-zinc-400">Piliin ang theme set o mag-lock ng 1 partikular na block</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded px-2 py-1 text-zinc-400 hover:bg-white/10"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Mode Switch Tabs */}
            <div className="mb-4 flex rounded-lg bg-zinc-900 p-1">
              <button
                type="button"
                onClick={() => setActiveTab("sets")}
                className={`flex-1 rounded-md py-1.5 text-xs font-bold transition ${
                  activeTab === "sets" ? "bg-zinc-800 text-white shadow" : "text-zinc-400 hover:text-white"
                }`}
              >
                📦 Block Sets (Themes)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("single")}
                className={`flex-1 rounded-md py-1.5 text-xs font-bold transition ${
                  activeTab === "single" ? "bg-zinc-800 text-white shadow" : "text-zinc-400 hover:text-white"
                }`}
              >
                🎯 1 Specific Block (Single Lock)
              </button>
            </div>

            {/* TAB 1: BLOCK SETS */}
            {activeTab === "sets" && (
              <div className="space-y-2.5">
                {BLOCK_THEMES.map((opt) => {
                  const active = !specificBlock && opt.id === theme;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        onSelectSpecificBlock(null);
                        onChangeTheme(opt.id);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition active:scale-98 ${
                        active
                          ? "border-emerald-500 bg-emerald-950/40 ring-2 ring-emerald-500/80"
                          : "border-white/10 bg-zinc-900/80 hover:border-white/25 hover:bg-zinc-800"
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-extrabold text-white">{opt.name}</span>
                          {opt.badge && (
                            <span className="rounded-full bg-emerald-600/80 px-2 py-0.5 text-[10px] font-bold text-white">
                              {opt.badge}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-zinc-400">{opt.tagline}</div>
                      </div>
                      {active && (
                        <span className="rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-bold text-white shadow">
                          ✓ Gamit
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* TAB 2: INDIVIDUAL / SINGLE BLOCK LOCK */}
            {activeTab === "single" && (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs text-zinc-400">
                    Gusto mo ba ng iisang block lang sa buong tower? Pumili sa ibaba:
                  </p>
                  {specificBlock && (
                    <button
                      type="button"
                      onClick={() => onSelectSpecificBlock(null)}
                      className="rounded bg-zinc-800 px-2.5 py-1 text-xs font-bold text-amber-300 hover:bg-zinc-700"
                    >
                      ✕ Alisin ang lock
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {INDIVIDUAL_BLOCKS.map((b) => {
                    const active = specificBlock === b.type;
                    return (
                      <button
                        key={b.type}
                        type="button"
                        onClick={() => {
                          onSelectSpecificBlock(b.type);
                          setOpen(false);
                        }}
                        className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition active:scale-95 ${
                          active
                            ? "border-amber-400 bg-amber-950/40 ring-2 ring-amber-400"
                            : "border-white/10 bg-zinc-900/80 hover:border-white/20 hover:bg-zinc-800"
                        }`}
                      >
                        {b.imageUrl ? (
                          <img
                            src={b.imageUrl}
                            alt={b.name}
                            className="h-14 w-14 rounded-lg object-contain shadow"
                          />
                        ) : (
                          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-zinc-800 text-2xl font-bold shadow">
                            🧱
                          </div>
                        )}
                        <span className="text-xs font-bold text-white">{b.name}</span>
                        {active && (
                          <span className="text-[10px] font-bold text-amber-400">✓ Locked</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { CHARACTER_NAMES, type CharacterKind } from "@/lib/game/characters";

const BLURBS: Record<CharacterKind, string> = {
  hero: "Spiky hair & gold-trim coat",
  penguin: "Bonnet & scarf",
  knight: "Plumed helmet & sword",
  ninja: "Red headband",
  astronaut: "Gold visor & backpack",
  builder: "Hard hat & overalls",
};

const KINDS = Object.keys(CHARACTER_NAMES) as CharacterKind[];

/**
 * On-screen "Character" button (bottom-right) that opens a picker. Clicking a
 * card switches the character immediately. Esc or clicking outside closes it.
 */
export default function CharacterPicker({
  value,
  onChange,
}: {
  value: CharacterKind;
  onChange: (k: CharacterKind) => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const [emoji, ...rest] = CHARACTER_NAMES[value].split(" ");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="fixed bottom-3 right-3 z-40 flex items-center gap-2 rounded-full border border-white/20 bg-black/70 px-4 py-2 text-sm font-bold text-white shadow-lg backdrop-blur transition hover:bg-black/85 active:scale-95"
      >
        <span className="text-lg leading-none">{emoji}</span>
        <span>{rest.join(" ")}</span>
        <span className="text-xs text-zinc-400">▲ Change</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Choose a character"
            className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950/95 p-4 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-extrabold">Choose your character</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded px-2 py-1 text-zinc-400 hover:bg-white/10"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {KINDS.map((k) => {
                const [e, ...name] = CHARACTER_NAMES[k].split(" ");
                const active = k === value;
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      onChange(k);
                      setOpen(false);
                    }}
                    className={`flex flex-col items-center gap-1 rounded-xl px-2 py-3 text-center transition active:scale-95 ${
                      active ? "bg-green-600 ring-2 ring-green-300" : "bg-zinc-800 hover:bg-zinc-700"
                    }`}
                  >
                    <span className="text-4xl leading-none">{e}</span>
                    <span className="text-sm font-bold">{name.join(" ")}</span>
                    <span className="text-[11px] text-zinc-300">{active ? "✓ Selected" : BLURBS[k]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

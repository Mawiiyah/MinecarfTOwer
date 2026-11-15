"use client";

import { useEffect, useRef, useState } from "react";
import { BACKGROUND_OPTIONS, type BackgroundKind } from "@/lib/game/backgrounds";

interface Props {
  value: BackgroundKind;
  customUrl?: string;
  onChange: (bg: BackgroundKind, customUrl?: string) => void;
}

export default function BackgroundPicker({ value, customUrl, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [urlInput, setUrlInput] = useState(customUrl || "");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const currentOption = BACKGROUND_OPTIONS.find((b) => b.id === value) || BACKGROUND_OPTIONS[0];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setUrlInput(result);
      onChange("custom", result);
      setOpen(false);
    };
    reader.readAsDataURL(file);
  };

  const handleApplyUrl = () => {
    if (!urlInput.trim()) return;
    onChange("custom", urlInput.trim());
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-white/20 bg-black/70 px-4 py-2 text-sm font-bold text-white shadow-lg backdrop-blur transition hover:bg-black/85 active:scale-95"
      >
        <span className="text-base leading-none">{currentOption.name.split(" ")[0]}</span>
        <span>{currentOption.name.split(" ").slice(1).join(" ")}</span>
        <span className="text-xs text-zinc-400">▲ Background</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Pumili ng Background"
            className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/95 p-5 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h2 className="text-lg font-extrabold text-white">Pumili ng Background</h2>
                <p className="text-xs text-zinc-400">Piliin ang gusto mong senaryo o mag-upload ng sarili mong larawan</p>
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

            {/* Background cards */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {BACKGROUND_OPTIONS.map((opt) => {
                const active = opt.id === value;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      if (opt.id === "custom" && !customUrl) {
                        fileInputRef.current?.click();
                      } else {
                        onChange(opt.id);
                        setOpen(false);
                      }
                    }}
                    className={`group relative flex flex-col overflow-hidden rounded-xl border text-left transition active:scale-95 ${
                      active
                        ? "border-purple-400 bg-purple-950/40 ring-2 ring-purple-500/80"
                        : "border-white/10 bg-zinc-900/80 hover:border-white/25 hover:bg-zinc-800"
                    }`}
                  >
                    {/* Thumbnail / Header Preview */}
                    <div className="relative h-24 w-full overflow-hidden bg-zinc-800">
                      {opt.thumbnail ? (
                        <img
                          src={opt.thumbnail}
                          alt={opt.name}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                        />
                      ) : opt.id === "custom" && customUrl ? (
                        <img
                          src={customUrl}
                          alt="Custom background"
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-900/60 to-purple-950/80">
                          <span className="text-3xl">{opt.name.split(" ")[0]}</span>
                        </div>
                      )}

                      {/* Badge if available */}
                      {opt.badge && (
                        <span className="absolute right-2 top-2 rounded-full bg-purple-600 px-2 py-0.5 text-[10px] font-extrabold tracking-wider uppercase text-white shadow">
                          {opt.badge}
                        </span>
                      )}

                      {active && (
                        <span className="absolute left-2 top-2 rounded-full bg-green-500/90 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                          ✓ Aktibo
                        </span>
                      )}
                    </div>

                    <div className="p-3">
                      <div className="text-sm font-bold text-white">{opt.name}</div>
                      <div className="mt-0.5 text-xs text-zinc-400">{opt.tagline}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Custom Background Upload / URL Section */}
            <div className="mt-4 rounded-xl border border-white/10 bg-zinc-900/60 p-3.5">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-300">
                🖼️ Sariling Background (Custom Image)
              </h3>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 rounded-lg border border-purple-500/40 bg-purple-600/30 px-3 py-2 text-xs font-bold text-purple-200 transition hover:bg-purple-600/50"
                >
                  📁 Mag-upload ng Larawan mula sa PC
                </button>
              </div>

              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  placeholder="o i-paste ang Image URL (https://...)"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="flex-1 rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:border-purple-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleApplyUrl}
                  disabled={!urlInput.trim()}
                  className="rounded-lg bg-zinc-700 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-zinc-600 disabled:opacity-40"
                >
                  Gamitin
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

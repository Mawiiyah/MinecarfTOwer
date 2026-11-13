interface Entry {
  img: HTMLImageElement;
  ok: boolean;
}

/**
 * Lazily loads viewer profile pictures. Images are drawn without CORS, which
 * taints the canvas — harmless here because we never read pixels back.
 */
export class AvatarCache {
  private map = new Map<string, Entry>();

  get(url?: string): HTMLImageElement | null {
    if (!url || typeof Image === "undefined") return null;
    let entry = this.map.get(url);
    if (!entry) {
      if (this.map.size > 400) this.map.clear();
      const img = new Image();
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      const e: Entry = { img, ok: false };
      img.onload = () => {
        e.ok = true;
      };
      img.src = url;
      this.map.set(url, e);
      entry = e;
    }
    return entry.ok ? entry.img : null;
  }
}

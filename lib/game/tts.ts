"use client";

export interface TtsOptions {
  enabled: boolean;
  volume: number;
  rate: number;
  pitch: number;
  includeName: boolean;
  voiceURI: string;
}

export class ChatTtsEngine {
  private queue: string[] = [];
  private isSpeaking = false;
  private voices: SpeechSynthesisVoice[] = [];

  constructor() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      this.loadVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => this.loadVoices();
      }
    }
  }

  private loadVoices() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    this.voices = window.speechSynthesis.getVoices();
  }

  getVoices(): SpeechSynthesisVoice[] {
    if (!this.voices.length && typeof window !== "undefined" && "speechSynthesis" in window) {
      this.voices = window.speechSynthesis.getVoices();
    }
    return this.voices;
  }

  private cleanText(raw: string): string {
    return raw
      .replace(/https?:\/\/\S+/gi, "") // remove URLs
      .replace(/([!?.~])\1+/g, "$1") // collapse repeated punctuation
      .replace(/(.)\1{3,}/g, "$1$1") // collapse spammy letters (e.g. goooool -> gool)
      .trim();
  }

  speak(text: string, options: TtsOptions, author?: string) {
    if (!options.enabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (options.volume <= 0) return;

    const cleaned = this.cleanText(text);
    if (!cleaned) return;
    if (cleaned.startsWith("!") || cleaned.startsWith("/")) return; // skip bot commands

    // Cap at 120 chars so comments don't take forever to read
    const body = cleaned.length > 120 ? cleaned.slice(0, 116) + "..." : cleaned;

    let fullSpeech = body;
    if (options.includeName && author) {
      const cleanAuthor = author.replace(/[@#_]/g, " ").trim();
      fullSpeech = `${cleanAuthor} says: ${body}`;
    }

    // Keep queue short (max 4) so old comments don't lag behind live gameplay
    if (this.queue.length >= 4) {
      this.queue.shift();
    }
    this.queue.push(fullSpeech);

    this.processQueue(options);
  }

  private processQueue(options: TtsOptions) {
    if (this.isSpeaking || !this.queue.length) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const synth = window.speechSynthesis;
    const textToSpeak = this.queue.shift();
    if (!textToSpeak) return;

    this.isSpeaking = true;
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.volume = Math.max(0, Math.min(1, options.volume));
    utterance.rate = Math.max(0.6, Math.min(1.8, options.rate));
    utterance.pitch = Math.max(0.5, Math.min(1.6, options.pitch));

    // Choose voice
    const available = this.getVoices();
    if (options.voiceURI) {
      const found = available.find((v) => v.voiceURI === options.voiceURI);
      if (found) utterance.voice = found;
    }

    // If no specific voice matched, prioritize natural Tagalog/Filipino or English voices
    if (!utterance.voice && available.length > 0) {
      const preferred = available.find(
        (v) =>
          v.lang.startsWith("fil") ||
          v.lang.startsWith("tl") ||
          (v.lang.startsWith("en") && (v.name.includes("Natural") || v.name.includes("Google"))),
      );
      if (preferred) utterance.voice = preferred;
    }

    utterance.onend = () => {
      this.isSpeaking = false;
      // Slight 180ms breathing pause before the next comment
      setTimeout(() => this.processQueue(options), 180);
    };

    utterance.onerror = () => {
      this.isSpeaking = false;
      this.processQueue(options);
    };

    // Unlock Chrome TTS state if paused
    if (synth.paused) synth.resume();
    synth.speak(utterance);
  }

  stop() {
    this.queue = [];
    this.isSpeaking = false;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }
}

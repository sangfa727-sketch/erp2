/**
 * useTTS — Sprint E1c (Gate 2 hybrid architecture)
 *
 * Reusable hook for text-to-speech playback via /api/ai/tts.
 * Single audio channel: playing a new message stops the previous.
 *
 * Usage:
 *   const { speak, isLoading, playingId, error } = useTTS();
 *   <button onClick={() => speak("မင်္ဂလာပါ", "msg-42")}>🔊</button>
 *
 * Also usable for Gate 3 voice reports.
 */
"use client";

import { useCallback, useRef, useState } from "react";

type VoiceName = "Kore" | "Charon";

interface UseTTSOptions {
  voice?: VoiceName;
}

interface UseTTSReturn {
  speak: (text: string, id?: string) => Promise<void>;
  stop: () => void;
  isLoading: boolean;
  playingId: string | null;
  error: string | null;
}

export function useTTS(options: UseTTSOptions = {}): UseTTSReturn {
  const { voice = "Kore" } = options;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    cleanup();
    setPlayingId(null);
    setIsLoading(false);
  }, [cleanup]);

  const speak = useCallback(
    async (text: string, id: string = "default") => {
      // Toggle: clicking the same active button stops playback.
      if (playingId === id) {
        stop();
        return;
      }

      // Cancel any in-flight fetch or playing audio.
      stop();

      const trimmed = text?.trim();
      if (!trimmed) return;

      setError(null);
      setIsLoading(true);
      setPlayingId(id);

      const abortController = new AbortController();
      abortRef.current = abortController;

      try {
        const resp = await fetch("/api/ai/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed, voice }),
          signal: abortController.signal,
        });

        if (!resp.ok) {
          const body = await resp.text().catch(() => "");
          throw new Error(`TTS ${resp.status}: ${body.slice(0, 120)}`);
        }

        const blob = await resp.blob();
        if (abortController.signal.aborted) return;

        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;

        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onended = () => {
          cleanup();
          setPlayingId((prev) => (prev === id ? null : prev));
        };

        audio.onerror = () => {
          cleanup();
          setError("Playback failed");
          setPlayingId((prev) => (prev === id ? null : prev));
        };

        setIsLoading(false);
        await audio.play();
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setError(err?.message || "TTS error");
        setPlayingId(null);
        setIsLoading(false);
        cleanup();
      } finally {
        if (abortRef.current === abortController) {
          abortRef.current = null;
        }
      }
    },
    [voice, playingId, stop, cleanup]
  );

  return { speak, stop, isLoading, playingId, error };
}

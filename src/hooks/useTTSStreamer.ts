// /opt/erp1/src/hooks/useTTSStreamer.ts
// Sprint E2e -- Chunked parallel TTS for Voice Mode
// =============================================================================
// Purpose: Reduce time-to-first-audio for long agent responses while
// preserving full content playback.
//
// Background: Gemini batch TTS latency scales linearly (~86ms/char).
//   240 chars = 21s to first byte -- painful for voice-first UX.
// This hook splits text on sentence terminators, fires ALL fetches in
// parallel, and plays results sequentially in order as they arrive.
//
// Result: First audio at ~3s (shortest chunk fetch), full playback
// continuous with small ~50-100ms gaps between chunks.
//
// API compatibility: drop-in replacement for useTTS (same return shape).
// Chat Mode useTTS.ts remains untouched -- only Voice Mode swaps.
//
// Chunk failure handling: retry once, then skip (partial playback OK).
// Total abort on user stop() call OR component unmount.
// =============================================================================
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type VoiceName = 'Kore' | 'Charon';

interface UseTTSStreamerOptions {
  voice?: VoiceName;
}

interface UseTTSStreamerReturn {
  speak: (text: string, id?: string) => Promise<void>;
  stop: () => void;
  isLoading: boolean;
  playingId: string | null;
  error: string | null;
}

// Chunking parameters
const CHUNK_MIN_CHARS = 15; // merge shorter chunks with next
const CHUNK_MAX_CHARS = 100; // split longer chunks at any whitespace

// =============================================================================
// splitSentences -- text -> chunks on Burmese danda + . ! ? \n
// =============================================================================
export function splitSentences(text: string): string[] {
  const t = text.trim();
  if (!t) return [];

  // Split on any terminator, keeping terminator with preceding chunk.
  // Terminators: Burmese danda \u104B, period, exclamation, question, newline.
  // Regex uses lookbehind-alternative: split by matching terminator + capture.
  const rawChunks: string[] = [];
  let buf = '';
  for (const ch of t) {
    buf += ch;
    if (ch === '\u104B' || ch === '.' || ch === '!' || ch === '?' || ch === '\n') {
      if (buf.trim()) rawChunks.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim()) rawChunks.push(buf.trim());

  // Merge chunks < CHUNK_MIN_CHARS with next (avoid tiny fetches)
  const merged: string[] = [];
  let carry = '';
  for (const c of rawChunks) {
    const combined = carry ? carry + ' ' + c : c;
    if (combined.length < CHUNK_MIN_CHARS) {
      carry = combined;
    } else {
      merged.push(combined);
      carry = '';
    }
  }
  if (carry) {
    // Trailing tiny chunk: append to last if exists, otherwise keep alone
    if (merged.length > 0) merged[merged.length - 1] += ' ' + carry;
    else merged.push(carry);
  }

  // Split chunks > CHUNK_MAX_CHARS at nearest whitespace
  const final: string[] = [];
  for (const c of merged) {
    if (c.length <= CHUNK_MAX_CHARS) {
      final.push(c);
      continue;
    }
    let remaining = c;
    while (remaining.length > CHUNK_MAX_CHARS) {
      // Find last whitespace within CHUNK_MAX_CHARS window
      let cutAt = remaining.lastIndexOf(' ', CHUNK_MAX_CHARS);
      if (cutAt < CHUNK_MIN_CHARS) cutAt = CHUNK_MAX_CHARS; // fallback: hard cut
      final.push(remaining.slice(0, cutAt).trim());
      remaining = remaining.slice(cutAt).trim();
    }
    if (remaining) final.push(remaining);
  }

  return final.filter((c) => c.length > 0);
}

// =============================================================================
// fetchChunkBlob -- POST /api/ai/tts with retry-once on failure
// =============================================================================
async function fetchChunkBlob(
  text: string,
  voice: VoiceName,
  signal: AbortSignal,
): Promise<Blob | null> {
  const doFetch = async () => {
    const resp = await fetch('/api/ai/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice }),
      signal,
    });
    if (!resp.ok) throw new Error(`TTS ${resp.status}`);
    return resp.blob();
  };

  try {
    return await doFetch();
  } catch (e) {
    if (signal.aborted) return null; // user cancelled -- no retry
    console.warn('[TTSStreamer] chunk fetch failed, retrying once:', e);
    try {
      return await doFetch();
    } catch (e2) {
      if (signal.aborted) return null;
      console.error('[TTSStreamer] chunk fetch failed after retry:', e2);
      return null; // skip this chunk -- partial playback continues
    }
  }
}

// =============================================================================
// useTTSStreamer -- main hook
// =============================================================================
export function useTTSStreamer(
  options: UseTTSStreamerOptions = {},
): UseTTSStreamerReturn {
  const { voice = 'Kore' } = options;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const activeIdRef = useRef<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    for (const url of objectUrlsRef.current) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }
    objectUrlsRef.current = [];
  }, []);

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    cleanup();
    activeIdRef.current = null;
    setPlayingId(null);
    setIsLoading(false);
  }, [cleanup]);

  const playBlob = useCallback((blob: Blob): Promise<void> => {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      objectUrlsRef.current.push(url);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        try {
          URL.revokeObjectURL(url);
          objectUrlsRef.current = objectUrlsRef.current.filter((u) => u !== url);
        } catch {
          // ignore
        }
        resolve();
      };
      audio.onerror = () => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
        reject(new Error('audio playback failed'));
      };
      audio.play().catch(reject);
    });
  }, []);

  const speak = useCallback(
    async (text: string, id: string = 'default') => {
      // Toggle: same ID currently playing = stop
      if (activeIdRef.current === id) {
        stop();
        return;
      }

      // Cancel any prior playback + fetches
      stop();

      const trimmed = text?.trim();
      if (!trimmed) return;

      const chunks = splitSentences(trimmed);
      if (chunks.length === 0) return;

      setError(null);
      setIsLoading(true);
      activeIdRef.current = id;
      setPlayingId(id);

      const abortController = new AbortController();
      abortRef.current = abortController;

      // Fire ALL fetches in parallel immediately
      const fetchPromises = chunks.map((chunk) =>
        fetchChunkBlob(chunk, voice, abortController.signal),
      );

      // Play in order as they resolve
      try {
        for (let i = 0; i < fetchPromises.length; i++) {
          if (abortController.signal.aborted) return;
          const blob = await fetchPromises[i];
          if (abortController.signal.aborted) return;
          if (activeIdRef.current !== id) return; // superseded
          if (!blob) continue; // skipped chunk (retry failed) -- log stayed in console
          if (i === 0) setIsLoading(false); // first audio ready
          try {
            await playBlob(blob);
          } catch (playErr) {
            console.warn('[TTSStreamer] playback error, continuing:', playErr);
            // Continue to next chunk even if this one failed to play
          }
        }
      } catch (e) {
        if (!abortController.signal.aborted) {
          console.error('[TTSStreamer] streaming failed:', e);
          setError('playback failed');
        }
      } finally {
        if (activeIdRef.current === id) {
          activeIdRef.current = null;
          setPlayingId(null);
          setIsLoading(false);
        }
      }
    },
    [voice, stop, playBlob],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { speak, stop, isLoading, playingId, error };
}

// /opt/erp1/src/hooks/useVoiceRecording.ts
// Sprint E2c -- Voice recording hook for Voice Mode
// =============================================================================
// Promise-based recorder: startRecording() returns Promise<Blob | null>.
// Resolves with audio blob when:
//   - VAD auto-stops (silence > SILENCE_DURATION_MS after speech onset)
//   - User calls stopRecording() manually
//   - MAX_RECORDING_MS elapsed
// Resolves with null when:
//   - Speech-onset window elapsed with no speech detected
//   - MediaRecorder or getUserMedia error
//   - Hook unmounts mid-recording
//
// Constants match ChatBubble.tsx recording behavior exactly.
// Independent MediaRecorder + AudioContext -- does not share state with
// ChatBubble's own STT flow, so Chat Mode STT remains unaffected.
// =============================================================================
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Constants (from ChatBubble.tsx lines 60-70, kept in lockstep)
const SILENCE_THRESHOLD = 18;
const SILENCE_DURATION_MS = 2500;
const MIN_RECORDING_MS = 700;
const MAX_RECORDING_MS = 30000;
const SPEECH_ONSET_THRESHOLD = 28;
const SPEECH_ONSET_WINDOW_MS = 3000;
const NOISE_FLOOR_FRAMES = 8;

export type VoiceRecordingError =
  | 'mic_denied'
  | 'no_speech'
  | 'recorder_unsupported'
  | 'recorder_error';

export interface UseVoiceRecordingResult {
  isRecording: boolean;
  audioLevel: number; // 0..1
  error: VoiceRecordingError | null;
  startRecording: () => Promise<Blob | null>;
  stopRecording: () => void;
  reset: () => void;
}

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      // ignore
    }
  }
  return '';
}

export function useVoiceRecording(): UseVoiceRecordingResult {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<VoiceRecordingError | null>(null);

  // Recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const silenceStartRef = useRef<number>(0);
  const recordingStartRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const resolveRef = useRef<((b: Blob | null) => void) | null>(null);
  const speechDetectedRef = useRef<boolean>(false);
  const consecutiveSpeechFramesRef = useRef<number>(0);
  const mimeTypeRef = useRef<string>('audio/webm');

  const cleanup = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    mediaRecorderRef.current = null;
    silenceStartRef.current = 0;
    recordingStartRef.current = 0;
    speechDetectedRef.current = false;
    consecutiveSpeechFramesRef.current = 0;
    setAudioLevel(0);
    setIsRecording(false);
  }, []);

  const finishWithBlob = useCallback(
    (blob: Blob | null) => {
      const resolver = resolveRef.current;
      resolveRef.current = null;
      cleanup();
      if (resolver) resolver(blob);
    },
    [cleanup]
  );

  const runVadLoop = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const buf = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buf);
    // Deviation from 128 (silence midpoint) = amplitude
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i] - 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    setAudioLevel(Math.min(1, rms / 60));

    const now = Date.now();
    const elapsed = now - recordingStartRef.current;

    // Silence-only VAD (no pre-emptive speech-onset detection).
    // Client heuristic for 'no speech' caused false positives for
    // soft-spoken users. Now record any audio; STT decides if speech
    // is present. Empty transcript shown at VoiceModeChat layer.
    if (rms < SILENCE_THRESHOLD) {
      if (silenceStartRef.current === 0) {
        silenceStartRef.current = now;
      } else if (
        elapsed >= MIN_RECORDING_MS &&
        now - silenceStartRef.current >= SILENCE_DURATION_MS
      ) {
        // Auto-stop: silence duration reached
        try {
          mediaRecorderRef.current?.stop();
        } catch {
          // ignore
        }
        return;
      }
    } else {
      silenceStartRef.current = 0;
      speechDetectedRef.current = true;
    }

    // Max recording safeguard
    if (elapsed >= MAX_RECORDING_MS) {
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        // ignore
      }
      return;
    }

    rafRef.current = requestAnimationFrame(runVadLoop);
  }, [finishWithBlob]);

  const startRecording = useCallback(async (): Promise<Blob | null> => {
    if (isRecording) return null;
    setError(null);

    const mime = pickMimeType();
    if (mime === null) {
      setError('recorder_unsupported');
      return null;
    }
    mimeTypeRef.current = mime;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      console.error('[useVoiceRecording] getUserMedia failed:', e);
      setError('mic_denied');
      return null;
    }

    return new Promise<Blob | null>((resolve) => {
      resolveRef.current = resolve;

      try {
        mediaStreamRef.current = stream;

        // Audio analyser for VAD
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        // MediaRecorder
        const options: MediaRecorderOptions = mime ? { mimeType: mime } : {};
        const rec = new MediaRecorder(stream, options);
        mediaRecorderRef.current = rec;
        audioChunksRef.current = [];

        rec.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };
        rec.onstop = () => {
          const blob = new Blob(audioChunksRef.current, {
            type: mimeTypeRef.current || 'audio/webm',
          });
          audioChunksRef.current = [];
          // Always send captured audio; STT decides if speech present.
          // Empty blob (rare) resolves null; VoiceMode handles gracefully.
          finishWithBlob(blob.size > 0 ? blob : null);
        };
        rec.onerror = (e) => {
          console.error('[useVoiceRecording] MediaRecorder error:', e);
          setError('recorder_error');
          try {
            rec.stop();
          } catch {
            // ignore
          }
          finishWithBlob(null);
        };

        recordingStartRef.current = Date.now();
        speechDetectedRef.current = false;
        consecutiveSpeechFramesRef.current = 0;
        silenceStartRef.current = 0;

        rec.start(100); // 100ms timeslice
        setIsRecording(true);
        rafRef.current = requestAnimationFrame(runVadLoop);
      } catch (e) {
        console.error('[useVoiceRecording] setup failed:', e);
        setError('recorder_error');
        finishWithBlob(null);
      }
    });
  }, [isRecording, runVadLoop, finishWithBlob]);

  const stopRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    if (rec.state === 'recording') {
      try {
        rec.stop();
      } catch (e) {
        console.error('[useVoiceRecording] stop failed:', e);
      }
    }
  }, []);

  const reset = useCallback(() => {
    setError(null);
  }, []);

  // Unmount cleanup: abort any in-flight recording, resolve pending promise
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === 'recording') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      finishWithBlob(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isRecording,
    audioLevel,
    error,
    startRecording,
    stopRecording,
    reset,
  };
}

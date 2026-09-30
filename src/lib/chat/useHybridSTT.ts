// /opt/erp1/src/lib/chat/useHybridSTT.ts
// Hybrid Speech-to-Text hook
// Fast mode: Browser Web Speech API (instant, free, ~70% Burmese accuracy)
// Accurate mode: MediaRecorder + Whisper API (~90%+ Burmese accuracy)

import { useCallback, useEffect, useRef, useState } from 'react';

type Mode = 'fast' | 'accurate';
type Lang = 'my' | 'en' | 'th';

interface UseHybridSTTOptions {
  mode: Mode;
  language: Lang;
  onFinalTranscript: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
  onError?: (err: string) => void;
  // Apply fuzzy matching on final text (uses existing vocab system)
  onProcessText?: (text: string) => string;
}

const LANG_BCP47: Record<Lang, string> = {
  my: 'my-MM',
  en: 'en-US',
  th: 'th-TH',
};

export function useHybridSTT({
  mode,
  language,
  onFinalTranscript,
  onInterimTranscript,
  onError,
  onProcessText,
}: UseHybridSTTOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [interimText, setInterimText] = useState('');

  // Refs for both modes
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  // Guard against auto-restart loop in fast mode
  const shouldKeepListeningRef = useRef(false);

  // ---------- Fast Mode (Browser STT) ----------
  const startFastMode = useCallback(() => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SR) {
      onError?.('Browser STT not supported. Use Chrome or Edge.');
      return;
    }

    const recognition = new SR();
    recognition.lang = LANG_BCP47[language];
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setInterimText('');
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      if (interim) {
        setInterimText(interim);
        onInterimTranscript?.(interim);
      }
      if (final) {
        const processed = onProcessText ? onProcessText(final.trim()) : final.trim();
        onFinalTranscript(processed);
        setInterimText('');
      }
    };

    recognition.onerror = (event: any) => {
      const err = event.error || 'unknown';
      // "no-speech" and "aborted" are normal — don't surface as error
      if (err !== 'no-speech' && err !== 'aborted') {
        onError?.(`STT error: ${err}`);
      }
    };

    recognition.onend = () => {
      // Auto-restart ONLY if user still wants to listen
      if (shouldKeepListeningRef.current) {
        try {
          recognition.start();
        } catch (e) {
          setIsListening(false);
        }
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    shouldKeepListeningRef.current = true;
    try {
      recognition.start();
    } catch (e) {
      onError?.('Failed to start speech recognition');
    }
  }, [language, onFinalTranscript, onInterimTranscript, onError, onProcessText]);

  const stopFastMode = useCallback(() => {
    shouldKeepListeningRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimText('');
  }, []);

  // ---------- Accurate Mode (MediaRecorder + Whisper) ----------
  const startAccurateMode = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Use opus for best compression; Whisper accepts webm/opus
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];

        // Release mic immediately
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        if (blob.size < 1000) {
          // Too short — ignore
          setIsProcessing(false);
          return;
        }

        setIsProcessing(true);
        try {
          const form = new FormData();
          form.append('audio', blob, 'recording.webm');
          form.append('language', language);

          const res = await fetch('/api/stt', {
            method: 'POST',
            body: form,
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            onError?.(errData.error || 'Transcription failed');
            return;
          }

          const data = await res.json();
          const text = (data.text || '').trim();
          if (text) {
            const processed = onProcessText ? onProcessText(text) : text;
            onFinalTranscript(processed);
          }
        } catch (e: any) {
          onError?.(e?.message || 'Network error during transcription');
        } finally {
          setIsProcessing(false);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsListening(true);
    } catch (e: any) {
      onError?.(e?.message || 'Microphone access denied');
      setIsListening(false);
    }
  }, [language, onFinalTranscript, onError, onProcessText]);

  const stopAccurateMode = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    setIsListening(false);
  }, []);

  // ---------- Public API ----------
  const start = useCallback(() => {
    if (isListening || isProcessing) return;
    if (mode === 'fast') startFastMode();
    else startAccurateMode();
  }, [mode, isListening, isProcessing, startFastMode, startAccurateMode]);

  const stop = useCallback(() => {
    if (mode === 'fast') stopFastMode();
    else stopAccurateMode();
  }, [mode, stopFastMode, stopAccurateMode]);

  const toggle = useCallback(() => {
    if (isListening) stop();
    else start();
  }, [isListening, start, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldKeepListeningRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Stop listening when mode changes
  useEffect(() => {
    if (isListening) {
      stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, language]);

  return {
    isListening,
    isProcessing,
    interimText,
    start,
    stop,
    toggle,
  };
}

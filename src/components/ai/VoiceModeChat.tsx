// /opt/erp1/src/components/ai/VoiceModeChat.tsx
// Sprint E2d + E2f -- Voice Mode with TTS auto-play + voice confirm
// =============================================================================
// FLOW (fully voice-driven conversation loop):
//   mic click (idle)
//     -> status='listening' + startRecording (VAD auto-stop at 2s silence)
//     -> transcript ready
//     -> status='thinking'
//     -> IF pendingConfirm AND YES_WORDS.test AND payload is SAFE (whitelist):
//          -> executeConfirm(...) -> status='idle'
//        ELSE IF pendingConfirm AND NO_WORDS.test:
//          -> cancelConfirm(...) -> status='idle'
//        ELSE IF pendingConfirm AND payload is DESTRUCTIVE:
//          -> show hint 'use Chat Mode tap-confirm' + sendMessage(transcript)
//        ELSE:
//          -> sendMessage(transcript)
//     -> observer: isSending true->false + last assistant has content
//        -> status='speaking' + useTTS.speak(strippedText)
//     -> TTS ends (playingId non-null -> null transition):
//        -> IF new pendingConfirm exists (agent asked confirmation):
//             -> status='listening' + auto-startRecording (voice loop continues)
//           ELSE:
//             -> status='idle' (user taps mic to continue)
//
// SAFETY (Session 5 rule):
//   Voice confirm ONLY for additive ops (record/add/create RPCs).
//   Destructive ops (delete/update/edit/remove) require Chat Mode tap-confirm.
//
// BUG FIX from E2c:
//   stripTags strips 'CONFIRM:' to end-of-string (nested JSON payload safe).
// =============================================================================
'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ChatSession } from '@/lib/chat/sessionManager';
import { useVoiceRecording } from '@/hooks/useVoiceRecording';
import { useTTSStreamer } from '@/hooks/useTTSStreamer';

type Lang = 'my' | 'en' | 'th';
export type VoiceStatus = 'idle' | 'listening' | 'thinking' | 'speaking';

// Match ChatBubble.tsx line 317-318 exactly for parity
const YES_WORDS =
  /^\s*(ဟုတ်(ကဲ့|ပါ)?|အတည်ပြု|အိုကေ|yes|ok(ay)?|confirm|y|ใช่|ตกลง)[\s။\.!]*$/i;
const NO_WORDS =
  /^\s*(မဟုတ်(ပါ|ဘူး|သေး)?|မလို|ပယ်ဖျက်|no|cancel|n|ไม่|ยกเลิก)[\s။\.!]*$/i;

// Additive-only ops safe for voice confirm.
// Anything else (delete/update/edit) requires Chat Mode tap-confirm.
const SAFE_TOOL_PATTERN = /^rpc_(record|add|create|save|insert)_/i;

// Mirrors ChatBubble.tsx internal ParsedConfirm (not exported).
// Shape must remain in sync with parseConfirmBlock() output.
interface ParsedConfirm {
  tool: string;
  args: Record<string, unknown>;
}

interface PendingConfirm {
  messageId: string;
  payload: ParsedConfirm;
}

interface VoiceModeChatProps {
  onExit: () => void;
  lang: Lang;
  session: ChatSession;
  sendMessage: (text: string) => Promise<void>;
  isSending: boolean;
  errorMsg: string | null;
  pendingConfirm: PendingConfirm | null;
  executeConfirm: (
    messageId: string,
    payload: ParsedConfirm,
  ) => Promise<void>;
  cancelConfirm: (messageId: string) => void;
}

const HEADER_OFFSET = 64;
const TRANSCRIBE_ENDPOINT = '/api/voice/gemini-transcribe';

// =============================================================================
// Labels
// =============================================================================
const STATUS_LABEL: Record<Lang, Record<VoiceStatus, string>> = {
  my: {
    idle: 'အသင့်',
    listening: 'နားထောင်နေသည်',
    thinking: 'တွေးနေသည်',
    speaking: 'ပြောနေသည်',
  },
  en: {
    idle: 'Ready',
    listening: 'Listening',
    thinking: 'Thinking',
    speaking: 'Speaking',
  },
  th: {
    idle: 'พร้อม',
    listening: 'กำลังฟัง',
    thinking: 'กำลังคิด',
    speaking: 'กำลังพูด',
  },
};

const STATUS_COLOR: Record<VoiceStatus, string> = {
  idle: '#9ca3af',
  listening: '#ec4899',
  thinking: '#8b5cf6',
  speaking: '#6366f1',
};

interface LabelSet {
  back: string;
  hint: string;
  tapToStart: string;
  tapToStop: string;
  youSaid: string;
  aiResponse: string;
  emptyPrompt: string;
  micDenied: string;
  noSpeech: string;
  transcribeFail: string;
  recorderUnsupported: string;
  destructiveWarning: string;
  awaitingConfirm: string;
}

const LABELS: Record<Lang, LabelSet> = {
  my: {
    back: '← Mode ပြန်ရွေး',
    hint: 'အသံဖြင့် ERP ကို ဆက်သွယ်ပါ။ Mic နှိပ်ပြီး ပြောပါ။',
    tapToStart: 'စတင်ရန်နှိပ်ပါ',
    tapToStop: 'ရပ်ရန်နှိပ်ပါ',
    youSaid: 'သင်ပြောသည်',
    aiResponse: 'AI တုံ့ပြန်ချက်',
    emptyPrompt: 'Mic ကိုနှိပ်ပြီး စတင်ပါ',
    micDenied: 'Mic ခွင့်ပြုချက် လိုအပ်ပါသည်',
    noSpeech: 'အသံ မကြားရပါ။ ပြန်ကြိုးစားပါ။',
    transcribeFail: 'အသံပြောင်းရာတွင် ပြဿနာရှိသည်',
    recorderUnsupported: 'Browser က audio recording ကို မထောက်ပံ့ပါ',
    destructiveWarning:
      'ဖျက်/ပြင်ခြင်း အတွက် Chat Mode ကနေ button နှိပ်ပေးပါ။',
    awaitingConfirm: 'ဟုတ် / မဟုတ် ဖြေပါ',
  },
  en: {
    back: '← Back',
    hint: 'Speak to interact with ERP. Tap the mic to begin.',
    tapToStart: 'Tap to start',
    tapToStop: 'Tap to stop',
    youSaid: 'You said',
    aiResponse: 'AI response',
    emptyPrompt: 'Tap the mic to begin',
    micDenied: 'Microphone permission required',
    noSpeech: 'No speech detected. Try again.',
    transcribeFail: 'Transcription failed',
    recorderUnsupported: 'Browser does not support audio recording',
    destructiveWarning: 'For delete/edit ops, use Chat Mode tap-confirm.',
    awaitingConfirm: 'Say yes or no',
  },
  th: {
    back: '← กลับ',
    hint: 'พูดเพื่อสั่งงาน ERP แตะไมค์เพื่อเริ่มต้น',
    tapToStart: 'แตะเพื่อเริ่ม',
    tapToStop: 'แตะเพื่อหยุด',
    youSaid: 'คุณพูดว่า',
    aiResponse: 'AI ตอบว่า',
    emptyPrompt: 'แตะไมค์เพื่อเริ่มต้น',
    micDenied: 'ต้องได้รับอนุญาตให้ใช้ไมโครโฟน',
    noSpeech: 'ไม่พบเสียงพูด กรุณาลองอีกครั้ง',
    transcribeFail: 'การแปลงเสียงล้มเหลว',
    recorderUnsupported: 'เบราว์เซอร์ไม่รองรับการบันทึกเสียง',
    destructiveWarning: 'สำหรับการลบ/แก้ไข ใช้ Chat Mode แตะยืนยัน',
    awaitingConfirm: 'ตอบใช่หรือไม่ใช่',
  },
};

// =============================================================================
// Helpers
// =============================================================================
function stripTags(text: string): string {
  let out = text;
  // Strip NAV blocks (single-line JSON, no nesting expected)
  out = out.replace(/NAV:\{[^}]*\}/g, '');
  // Strip everything from CONFIRM: to end-of-message.
  // Agent convention: CONFIRM: appears at message tail; body is human-readable,
  // trailing JSON payload is machine-only. Nested braces in payload safe.
  const cIdx = out.indexOf('CONFIRM:');
  if (cIdx >= 0) out = out.substring(0, cIdx);
  return out.trim();
}

function isVoiceConfirmSafe(payload: ParsedConfirm): boolean {
  return SAFE_TOOL_PATTERN.test(payload.tool);
}


// =============================================================================
// Main component
// =============================================================================
export function VoiceModeChat({
  onExit,
  lang,
  session,
  sendMessage,
  isSending,
  errorMsg,
  pendingConfirm,
  executeConfirm,
  cancelConfirm,
}: VoiceModeChatProps) {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceInfo, setVoiceInfo] = useState<string | null>(null);

  const labels = LABELS[lang];
  const {
    isRecording,
    error: recError,
    startRecording,
    stopRecording,
    reset: resetRecError,
  } = useVoiceRecording();
  const { speak, stop: stopTTS, playingId } = useTTSStreamer({ voice: 'Kore' });

  // Session-derived transcripts (unified with Chat Mode)
  const messages = session.messages;
  const lastUserMsg = [...messages]
    .reverse()
    .find((m) => m.role === 'user' && m.content && m.content.trim());
  const lastAssistantMsg = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && m.content && m.content.trim());
  const lastUserText = lastUserMsg?.content ?? '';
  const lastAiText = lastAssistantMsg ? stripTags(lastAssistantMsg.content) : '';

  // Refs for cross-effect coordination
  const waitingForAiRef = useRef(false);
  const prevIsSendingRef = useRef(isSending);
  const wasPlayingRef = useRef(false);
  const spokenMessageIdRef = useRef<string | null>(null);
  const runVoiceCaptureRef = useRef<() => void>(() => {});

  // -----------------------------------------------------------------
  // Observer 1: isSending true->false + we were waiting -> speak response
  // -----------------------------------------------------------------
  useEffect(() => {
    if (prevIsSendingRef.current && !isSending && waitingForAiRef.current) {
      waitingForAiRef.current = false;
      const last = [...messages]
        .reverse()
        .find((m) => m.role === 'assistant' && m.content);
      if (last && last.content && spokenMessageIdRef.current !== last.id) {
        const clean = stripTags(last.content);
        if (clean) {
          spokenMessageIdRef.current = last.id;
          // Full text passed to streamer -- chunks in parallel, plays
          // in order. First audio ~3s regardless of total length.
          void speak(clean, last.id);
        } else {
          setStatus('idle');
        }
      } else {
        setStatus('idle');
      }
    }
    prevIsSendingRef.current = isSending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSending]);

  // -----------------------------------------------------------------
  // Observer 2: TTS playback finished (playingId non-null -> null)
  // -> if pendingConfirm exists, auto-restart listening (voice loop)
  // -----------------------------------------------------------------
  useEffect(() => {
    if (playingId !== null && !wasPlayingRef.current) {
      // Audio actually started playing -- transition to speaking now
      wasPlayingRef.current = true;
      setStatus('speaking');
    } else if (playingId === null && wasPlayingRef.current) {
      wasPlayingRef.current = false;
      // TTS finished -- always return to idle.
      // Auto-restart REMOVED (E2d3): stale pendingConfirm + garbage
      // STT caused runaway loops (AI kept responding without user).
      // User taps mic manually to reply (predictable, no loops).
      setStatus('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playingId]);

  // -----------------------------------------------------------------
  // Recording error -> label
  // -----------------------------------------------------------------
  useEffect(() => {
    if (!recError) return;
    let msg = '';
    if (recError === 'mic_denied') msg = labels.micDenied;
    else if (recError === 'no_speech') msg = labels.noSpeech;
    else if (recError === 'recorder_unsupported')
      msg = labels.recorderUnsupported;
    else msg = labels.transcribeFail;
    setVoiceError(msg);
    setVoiceInfo(null);
    setStatus('idle');
    resetRecError();
  }, [recError, labels, resetRecError]);

  // ChatBubble errorMsg
  useEffect(() => {
    if (errorMsg && waitingForAiRef.current) {
      setVoiceError(errorMsg);
      waitingForAiRef.current = false;
      setStatus('idle');
    }
  }, [errorMsg]);

  // -----------------------------------------------------------------
  // Cleanup on unmount: stop TTS if playing (recording cleanup is in hook)
  // -----------------------------------------------------------------
  useEffect(() => {
    return () => {
      stopTTS();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------------------------------------------
  // Transcribe blob
  // -----------------------------------------------------------------
  const transcribeBlob = async (blob: Blob): Promise<string | null> => {
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'voice.webm');
      fd.append('language', lang);
      const res = await fetch(TRANSCRIBE_ENDPOINT, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const transcript = String(data?.transcript || '').trim();
      return transcript || null;
    } catch (e) {
      console.error('[VoiceMode] transcribe failed:', e);
      return null;
    }
  };

  // -----------------------------------------------------------------
  // Voice capture flow (recording -> transcribe -> dispatch)
  // -----------------------------------------------------------------
  const runVoiceCapture = async () => {
    setVoiceError(null);
    // status was set to 'listening' before invocation

    const blob = await startRecording();
    if (!blob) {
      setStatus('idle');
      setVoiceInfo(null);
      return;
    }

    setStatus('thinking');
    setVoiceInfo(null);
    const transcript = await transcribeBlob(blob);
    if (!transcript) {
      setVoiceError(labels.transcribeFail);
      setStatus('idle');
      return;
    }

    // Voice confirm dispatch
    if (pendingConfirm) {
      const isYes = YES_WORDS.test(transcript);
      const isNo = NO_WORDS.test(transcript);
      const isSafe = isVoiceConfirmSafe(pendingConfirm.payload);

      if ((isYes || isNo) && !isSafe) {
        // Destructive op -- refuse voice confirm per safety rule
        setVoiceError(labels.destructiveWarning);
        setStatus('idle');
        return;
      }
      if (isYes && isSafe) {
        executeConfirm(pendingConfirm.messageId, pendingConfirm.payload);
        setStatus('idle');
        return;
      }
      if (isNo) {
        cancelConfirm(pendingConfirm.messageId);
        setStatus('idle');
        return;
      }
      // Fall through: user said something else -> treat as new query
    }

    // Normal send
    waitingForAiRef.current = true;
    try {
      await sendMessage(transcript);
    } catch (e) {
      console.error('[VoiceMode] sendMessage failed:', e);
      waitingForAiRef.current = false;
      setVoiceError(labels.transcribeFail);
      setStatus('idle');
    }
  };

  // Keep ref current for TTS-done observer
  useEffect(() => {
    runVoiceCaptureRef.current = () => {
      void runVoiceCapture();
    };
  });

  // -----------------------------------------------------------------
  // Mic button handler
  // -----------------------------------------------------------------
  const handleMicClick = () => {
    if (status === 'thinking' || status === 'speaking') return;

    if (status === 'listening') {
      // Manual stop -> onstop resolves promise -> flow continues
      stopRecording();
      return;
    }

    // idle -> start
    setVoiceError(null);
    setVoiceInfo(null);
    setStatus('listening');
    void runVoiceCapture();
  };

  const statusText = STATUS_LABEL[lang][status];
  const statusColor = STATUS_COLOR[status];
  const isActive = status !== 'idle';

  const promptText = (() => {
    if (voiceError) return voiceError;
    if (voiceInfo && status === 'listening') return voiceInfo;
    if (status === 'idle') return labels.emptyPrompt;
    if (status === 'listening') return labels.tapToStop;
    return statusText;
  })();

  const promptColor = voiceError
    ? '#dc2626'
    : voiceInfo && status === 'listening'
      ? '#8b5cf6'
      : '#6b7280';

  return (
    <div style={containerStyle}>
      {/* Top bar */}
      <div style={topBarStyle}>
        <button
          onClick={onExit}
          style={backButtonStyle}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = '#f9fafb';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'transparent';
          }}
        >
          {labels.back}
        </button>
        <div style={statusPillStyle(statusColor)}>
          <span style={statusDotStyle(statusColor, isActive)} />
          {statusText}
        </div>
      </div>

      {/* Center */}
      <div style={centerStyle}>
        <div style={waveContainerStyle}>
          {isActive && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} style={waveBarStyle(statusColor, i)} />
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleMicClick}
          disabled={status === 'thinking' || status === 'speaking'}
          style={micButtonStyle(isActive, statusColor, status)}
          aria-label={
            status === 'listening' ? labels.tapToStop : labels.tapToStart
          }
        >
          <MicIcon />
        </button>

        <div
          style={{
            ...promptStyle,
            color: promptColor,
          }}
        >
          {promptText}
        </div>
      </div>

      {/* Transcripts */}
      <div style={transcriptStyle}>
        <div style={transcriptRowStyle}>
          <div style={transcriptLabelStyle}>{labels.youSaid}</div>
          <div style={transcriptContentStyle}>
            {lastUserText || <EmptyDash />}
          </div>
        </div>
        <div style={transcriptRowStyle}>
          <div style={transcriptLabelStyle}>{labels.aiResponse}</div>
          <div style={transcriptContentStyle}>
            {lastAiText || <EmptyDash />}
          </div>
        </div>
      </div>

      <div style={hintStyle}>{labels.hint}</div>

      {/* Suppress unused-var warning: exposed for future E2e wave animation */}
      <span style={{ display: 'none' }} data-recording={isRecording ? '1' : '0'} />
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================
function MicIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 2C10.343 2 9 3.343 9 5V11C9 12.657 10.343 14 12 14C13.657 14 15 12.657 15 11V5C15 3.343 13.657 2 12 2Z"
        fill="currentColor"
      />
      <path
        d="M5 11C5 14.866 8.134 18 12 18C15.866 18 19 14.866 19 11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 18V22"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M8 22H16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EmptyDash() {
  return <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>—</span>;
}

// =============================================================================
// Styles
// =============================================================================
const containerStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: HEADER_OFFSET,
  bottom: 0,
  background:
    'linear-gradient(180deg, var(--color-bg, #fafbfc) 0%, var(--color-bg, #f5f6f9) 100%)',
  display: 'flex',
  flexDirection: 'column',
  zIndex: 10,
  padding: '14px 16px 14px',
  gap: 12,
};

const topBarStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
};

const backButtonStyle: CSSProperties = {
  padding: '6px 12px',
  background: 'transparent',
  border: '1px solid #d1d5db',
  borderRadius: 8,
  fontSize: 12,
  color: '#374151',
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background 0.15s',
};

function statusPillStyle(color: string): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 10px',
    background: `${color}15`,
    border: `1px solid ${color}30`,
    borderRadius: 999,
    fontSize: 11,
    color,
    fontWeight: 600,
    transition: 'all 0.2s',
  };
}

function statusDotStyle(color: string, isActive: boolean): CSSProperties {
  return {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: color,
    animation: isActive ? 'cbMsgIn 1s ease-in-out infinite' : 'none',
  };
}

const centerStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 14,
};

const waveContainerStyle: CSSProperties = {
  height: 32,
  display: 'flex',
  alignItems: 'center',
};

function waveBarStyle(color: string, idx: number): CSSProperties {
  const heights = [10, 18, 26, 18, 10];
  return {
    width: 4,
    height: heights[idx],
    background: color,
    borderRadius: 2,
    opacity: 0.7,
  };
}

function micButtonStyle(
  isActive: boolean,
  color: string,
  status: VoiceStatus
): CSSProperties {
  const disabled = status === 'thinking' || status === 'speaking';
  return {
    width: 88,
    height: 88,
    borderRadius: '50%',
    border: 'none',
    background: isActive
      ? `linear-gradient(135deg, ${color} 0%, #8b5cf6 100%)`
      : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)',
    color: 'white',
    cursor: disabled ? 'wait' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: isActive
      ? `0 0 0 8px ${color}20, 0 8px 24px ${color}40`
      : '0 6px 20px rgba(139, 92, 246, 0.3)',
    transition: 'all 0.2s ease',
    padding: 0,
    fontFamily: 'inherit',
    opacity: disabled ? 0.85 : 1,
  };
}

const promptStyle: CSSProperties = {
  fontSize: 13,
  color: '#6b7280',
  textAlign: 'center',
  minHeight: 18,
  fontWeight: 500,
  padding: '0 8px',
};

const transcriptStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '10px 12px',
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 10,
};

const transcriptRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const transcriptLabelStyle: CSSProperties = {
  fontSize: 9,
  color: '#9ca3af',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
};

const transcriptContentStyle: CSSProperties = {
  fontSize: 13,
  color: '#374151',
  lineHeight: 1.4,
  minHeight: 18,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const hintStyle: CSSProperties = {
  fontSize: 10,
  color: '#9ca3af',
  textAlign: 'center',
  lineHeight: 1.4,
};

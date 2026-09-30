// /opt/erp1/src/components/ai/ChatBubble.tsx
// Stillastock AI ChatBubble v3.1 (2026-06-23)
// =============================================================================
// CHANGES from v3:
//   • NAV:{path} tag support — agent can navigate to whitelisted pages
//     (auto-execute with 600ms delay; whitelist enforced client-side)
//   • Display strips both CONFIRM and NAV tags
//   • Backward compatible: replies without NAV tag behave identically
// CHANGES from v2:
//   • Browser Web Speech API REPLACED with Gemini 2.5 Flash Native Audio
//     (~95% Burmese accuracy vs ~70% from browser STT)
//   • Voice commands during chat input:
//       - "မဟုတ်ဘူး" / "ပြန်စ" / "ဖျက်" → clear input
//       - "ပို့လိုက်" / "အတည်ပြု" → auto-send current input
//       - YES/NO words still trigger pending CONFIRM cards
//   • VAD (Voice Activity Detection) auto-stops recording on 2s silence
//   • Editable transcript: voice output goes into input box for user review
//   • Sticky language: user-selected language is sent explicitly and persists
//   • Modern UI: glassmorphism, smooth animations, wave-bar mic indicator,
//     refined typography and spacing
//   • PRESERVED: CONFIRM:{tool,args} parsing, /api/ai/execute flow, drag-to-move,
//     session persistence, language switcher, new-chat button
// =============================================================================

'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useRouter } from 'next/navigation';
import { SpeakButton } from './SpeakButton';
import { useChatMode } from '@/hooks/useChatMode';
import {
  ModeSelector,
  ModeIndicatorButton,
} from './ModeSelector';
import { VoiceModeChat } from './VoiceModeChat';
import {
  loadSession,
  saveSession,
  addMessage,
  updateLastMessage,
  clearSession,
  setBubbleOpen,
  setLanguage,
  getRecentHistory,
  type ChatSession,
  type ChatMessage,
} from '@/lib/chat/sessionManager';

type Lang = 'my' | 'en' | 'th';

const N8N_WEBHOOK = 'https://stailla.xyz/webhook/erp-chat';
const TRANSCRIBE_ENDPOINT = '/api/voice/gemini-transcribe';

// Recording behavior
const SILENCE_THRESHOLD = 18;   // 0-255 byte amplitude; below = silent
const SILENCE_DURATION_MS = 1200; // ms of continuous silence → auto-stop
const MIN_RECORDING_MS = 700;   // don't auto-stop before this (after speech)
const MAX_RECORDING_MS = 30000; // safety cap

// Speech-onset detection (anti-noise / false-trigger fix)
const SPEECH_ONSET_THRESHOLD = 28; // higher than silence — requires real speech
const SPEECH_ONSET_WINDOW_MS = 3000; // wait this long for speech to start
const NOISE_FLOOR_FRAMES = 8;     // consecutive frames above threshold = real speech

// =============================================================================
// Localization
// =============================================================================
interface Labels {
  title: string;
  placeholder: string;
  listening: string;
  processing: string;
  newChat: string;
  close: string;
  sendHint: string;
  empty: string;
  errorSend: string;
  errorMic: string;
  errorTranscribe: string;
  thinking: string;
  mic: string;
  stopRec: string;
  confirm: string;
  cancel: string;
  executing: string;
  executed: string;
  cancelled: string;
  saleSuccess: string;
  purchaseSuccess: string;
  expenseSuccess: string;
  paymentSuccess: string;
  receiveSuccess: string;
  voiceCleared: string;
  voiceSent: string;
  noAudio: string;
}

const L: Record<Lang, Labels> = {
  my: {
    title: 'AI လက်ထောက်',
    placeholder: 'စာရိုက်ပါ ဒါမှမဟုတ် မိုက်ခ်ဖိပါ...',
    listening: 'နားထောင်နေ...',
    processing: 'အသံကို စစ်နေ...',
    newChat: 'စကားဝိုင်းအသစ်',
    close: 'ပိတ်ရန်',
    sendHint: 'ပို့ရန်',
    empty: '👋 မင်္ဂလာပါ! စာဖြင့်ဖြစ်စေ၊ အသံဖြင့်ဖြစ်စေ မေးနိုင်ပါတယ်။',
    errorSend: 'မပို့နိုင်ပါ။ ထပ်ကြိုးစားပါ။',
    errorMic: 'မိုက်ခ်ဖွင့်လို့မရပါ။ Browser permission စစ်ပါ။',
    errorTranscribe: 'အသံ ပြောင်းလို့မရပါ။ ထပ်ပြောကြည့်ပါ။',
    thinking: 'စဉ်းစားနေ...',
    mic: 'အသံဖိ',
    stopRec: 'ရပ်ရန်',
    confirm: '✓ ဟုတ်ကဲ့',
    cancel: '✗ မဟုတ်ပါ',
    executing: 'မှတ်နေ...',
    executed: '✅ မှတ်ပြီးပါပြီ',
    cancelled: '❌ ဖျက်လိုက်ပါပြီ',
    saleSuccess: '✅ ရောင်းအား မှတ်ပြီး။ Receipt',
    purchaseSuccess: '✅ ဝယ်ယူမှတ်ပြီး။ PO',
    expenseSuccess: '✅ ကုန်ကျစရိတ်မှတ်ပြီး။',
    paymentSuccess: '✅ ငွေပေးချေမှု မှတ်ပြီး။',
    receiveSuccess: '✅ ပစ္စည်း လက်ခံပြီးပါပြီ။ PO',
    voiceCleared: '↺ ဖျက်လိုက်ပါပြီ',
    voiceSent: '➤ ပို့လိုက်ပါပြီ',
    noAudio: 'အသံ မရှင်းပါ၊ ပြန်ပြောကြည့်ပါ',
  },
  en: {
    title: 'AI Assistant',
    placeholder: 'Type or tap mic to speak...',
    listening: 'Listening...',
    processing: 'Processing audio...',
    newChat: 'New Chat',
    close: 'Close',
    sendHint: 'Send',
    empty: '👋 Hi! Type a message or tap the mic to speak.',
    errorSend: 'Failed to send. Try again.',
    errorMic: 'Could not open mic. Check browser permission.',
    errorTranscribe: 'Could not transcribe audio. Try again.',
    thinking: 'Thinking...',
    mic: 'Mic',
    stopRec: 'Stop',
    confirm: '✓ Yes',
    cancel: '✗ No',
    executing: 'Saving...',
    executed: '✅ Done',
    cancelled: '❌ Cancelled',
    saleSuccess: '✅ Sale recorded. Receipt',
    purchaseSuccess: '✅ Purchase recorded. PO',
    expenseSuccess: '✅ Expense recorded.',
    paymentSuccess: '✅ Payment recorded.',
    receiveSuccess: '✅ Goods received. PO',
    voiceCleared: '↺ Cleared',
    voiceSent: '➤ Sent',
    noAudio: 'No clear audio detected, please try again.',
  },
  th: {
    title: 'ผู้ช่วย AI',
    placeholder: 'พิมพ์หรือกดไมค์เพื่อพูด...',
    listening: 'กำลังฟัง...',
    processing: 'กำลังประมวลผล...',
    newChat: 'แชทใหม่',
    close: 'ปิด',
    sendHint: 'ส่ง',
    empty: '👋 สวัสดี! พิมพ์ข้อความหรือกดไมค์',
    errorSend: 'ส่งไม่สำเร็จ ลองใหม่',
    errorMic: 'เปิดไมค์ไม่ได้ ตรวจสอบสิทธิ์',
    errorTranscribe: 'แปลงเสียงไม่สำเร็จ ลองใหม่',
    thinking: 'กำลังคิด...',
    mic: 'ไมค์',
    stopRec: 'หยุด',
    confirm: '✓ ใช่',
    cancel: '✗ ไม่',
    executing: 'กำลังบันทึก...',
    executed: '✅ บันทึกแล้ว',
    cancelled: '❌ ยกเลิก',
    saleSuccess: '✅ บันทึกการขาย',
    purchaseSuccess: '✅ บันทึกการซื้อ PO',
    expenseSuccess: '✅ บันทึกค่าใช้จ่าย',
    paymentSuccess: '✅ บันทึกชำระเงิน',
    receiveSuccess: '✅ รับสินค้า PO',
    voiceCleared: '↺ ล้างแล้ว',
    voiceSent: '➤ ส่งแล้ว',
    noAudio: 'เสียงไม่ชัด ลองใหม่',
  },
};

const SYSTEM_PROMPT: Record<Lang, string> = {
  my: 'သင်သည် Stillastock POS/ERP စနစ်၏ အထောက်အကူ AI ဖြစ်သည်။ စာရေးမ တစ်ယောက်ကဲ့သို့ ယဉ်ကျေးစွာ၊ တိုတောင်းစွာ၊ သဘာဝကျစွာ မြန်မာဘာသာဖြင့် ပြန်ဖြေပါ။',
  en: 'You are the Stillastock POS/ERP assistant. Reply concisely and naturally.',
  th: 'คุณคือผู้ช่วย AI ของระบบ POS/ERP Stillastock ตอบแบบกระชับและเป็นธรรมชาติ',
};

// =============================================================================
// CONFIRM parser (unchanged from v2 — DB-write contract)
// =============================================================================
const CONFIRM_RE = /CONFIRM:\s*(\{[\s\S]*?\})\s*$/m;

interface ParsedConfirm {
  tool: string;
  args: Record<string, unknown>;
}

function parseConfirmBlock(text: string): {
  display: string;
  payload: ParsedConfirm | null;
} {
  if (!text) return { display: text, payload: null };
  const match = text.match(CONFIRM_RE);
  if (!match) return { display: text, payload: null };
  try {
    const obj = JSON.parse(match[1]);
    if (typeof obj?.tool !== 'string' || typeof obj?.args !== 'object') {
      return { display: text, payload: null };
    }
    const display = text.replace(CONFIRM_RE, '').trim();
    return { display, payload: { tool: obj.tool, args: obj.args || {} } };
  } catch {
    return { display: text, payload: null };
  }
}

function buildSuccessMessage(tool: string, result: any, t: Labels): string {
  const r = result || {};
  const amt = (v: any) => (v ? ` — ${Number(v).toLocaleString()} ကျပ်` : '');
  switch (tool) {
    case 'rpc_record_sale':
      return `${t.saleSuccess} ${r.trans_no || ''}${amt(r.total_amount || r.grand_total)}`.trim();
    case 'rpc_record_purchase':
      return `${t.purchaseSuccess} ${r.po_no || ''}${amt(r.grand_total)}`.trim();
    case 'rpc_record_expense':
      return `${t.expenseSuccess}${amt(r.amount)}`;
    case 'rpc_record_ar_payment':
    case 'rpc_record_ap_payment':
      return `${t.paymentSuccess}${amt(r.amount)}`;
    case 'rpc_receive_purchase':
      return `${t.receiveSuccess} ${r.po_no || ''}`.trim();
    default:
      return t.executed;
  }
}

// =============================================================================
// NAV parser (read-only UI navigation, auto-executes 600ms after reply arrives)
// Pattern: agent appends `NAV:{"path":"/route"}` to its reply.
// Behavior: tag stripped from display; path validated against whitelist; if
// valid AND no CONFIRM tag in same reply, router.push(path) is scheduled.
// Whitelist enforces relative paths only (no external URLs, no protocol-relative).
// =============================================================================
const NAV_RE = /NAV:\s*(\{[\s\S]*?\})\s*$/m;

const NAV_WHITELIST: RegExp[] = [
  /^\/$/,
  /^\/dashboard(\/.*)?(\?.*)?$/,
  /^\/pos(\/.*)?(\?.*)?$/,
  /^\/voice-pos(\/.*)?(\?.*)?$/,
  /^\/customers(\/.*)?(\?.*)?$/,
  /^\/suppliers(\/.*)?(\?.*)?$/,
  /^\/admin(\/.*)?(\?.*)?$/,
  /^\/inventory(\/.*)?(\?.*)?$/,
  /^\/damaged-stock(\/.*)?(\?.*)?$/,
  /^\/purchases(\/.*)?(\?.*)?$/,
  /^\/grn(\/.*)?(\?.*)?$/,
  /^\/reports(\/.*)?(\?.*)?$/,
  /^\/finance(\/.*)?(\?.*)?$/,
  /^\/employees(\/.*)?(\?.*)?$/,
  /^\/expenses(\/.*)?(\?.*)?$/,
  /^\/sales-return(\/.*)?(\?.*)?$/,
  /^\/shipments(\/.*)?(\?.*)?$/,
  /^\/settings(\/.*)?(\?.*)?$/,
  /^\/support(\/.*)?(\?.*)?$/,
];

function isPathAllowed(path: string): boolean {
  if (typeof path !== 'string' || !path.startsWith('/')) return false;
  if (path.startsWith('//')) return false; // block protocol-relative
  return NAV_WHITELIST.some(re => re.test(path));
}

function parseNavBlock(text: string): {
  display: string;
  path: string | null;
} {
  if (!text) return { display: text, path: null };
  const match = text.match(NAV_RE);
  if (!match) return { display: text, path: null };
  const cleaned = text.replace(NAV_RE, '').trim();
  try {
    const obj = JSON.parse(match[1]);
    const rawPath = typeof obj?.path === 'string' ? obj.path : null;
    if (!rawPath) {
      console.warn('[NAV] Missing path in tag:', match[1]);
      return { display: cleaned, path: null };
    }
    if (!isPathAllowed(rawPath)) {
      console.warn('[NAV] Rejected path (not in whitelist):', rawPath);
      return { display: cleaned, path: null };
    }
    return { display: cleaned, path: rawPath };
  } catch {
    console.warn('[NAV] Invalid JSON in NAV tag');
    return { display: cleaned, path: null };
  }
}

// =============================================================================
// Voice command patterns
// =============================================================================
// CONFIRM card YES/NO (only matches when card is pending)
const YES_WORDS = /^\s*(ဟုတ်(ကဲ့|ပါ)?|အတည်ပြု|အိုကေ|yes|ok(ay)?|confirm|y|ใช่|ตกลง)[\s။\.!]*$/i;
const NO_WORDS = /^\s*(မဟုတ်(ပါ|ဘူး|သေး)?|မလို|ပယ်ဖျက်|no|cancel|n|ไม่|ยกเลิก)[\s။\.!]*$/i;

// Input-box voice commands (work any time)
const CMD_CLEAR = /^\s*(မဟုတ်(ဘူး|သေး|ပါ)|ပြန်စ|ဖျက်(ပါ|လိုက်)?|မပို့နဲ့|ပြန်စပြောမယ်|clear|nevermind)[\s။\.!]*$/i;
const CMD_SEND  = /^\s*(ပို့(ပါ|လိုက်|ပေး)?|အတည်ပြု(ပေး)?|ပို့လိုက်ပါ|send( it)?)[\s။\.!]*$/i;

type Command = 'yes' | 'no' | 'clear' | 'send' | null;

function detectCommand(text: string, hasPendingConfirm: boolean): Command {
  const t = text.trim();
  if (!t) return null;
  if (hasPendingConfirm) {
    if (YES_WORDS.test(t)) return 'yes';
    if (NO_WORDS.test(t)) return 'no';
  }
  if (CMD_CLEAR.test(t)) return 'clear';
  if (CMD_SEND.test(t)) return 'send';
  return null;
}

// =============================================================================
// Component
// =============================================================================
export default function ChatBubble() {
  const router = useRouter();

  const [session, setSession] = useState<ChatSession | null>(null);
  const [mounted, setMounted] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<
    Record<string, 'pending' | 'executing' | 'done' | 'cancelled'>
  >({});

  // Recording state
  const [recState, setRecState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [audioLevel, setAudioLevel] = useState(0); // 0-1 for wave bars
  const [flashMsg, setFlashMsg] = useState<string | null>(null);

  // Lock state — hide ChatBubble when screen is PIN-locked
  const [isLocked, setIsLocked] = useState(false);

  // E2a: Chat/Voice mode (persisted in localStorage)
  const [mode, setMode] = useChatMode();

  // Drag state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  // Recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const silenceStartRef = useRef<number>(0);
  const recordingStartRef = useRef<number>(0);
  const vadFrameRef = useRef<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ───────────────── lifecycle ─────────────────
  useEffect(() => {
    const loaded = loadSession();
    setSession(loaded);
    setMounted(true);
    const w = window.innerWidth;
    const h = window.innerHeight;
    setPosition({ x: w - 80, y: h - 100 });
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session?.messages.length]);

  useEffect(() => {
    if (!flashMsg) return;
    const t = setTimeout(() => setFlashMsg(null), 1500);
    return () => clearTimeout(t);
  }, [flashMsg]);

  // Lock state sync — hide ChatBubble whenever PIN lock is active
  useEffect(() => {
    // Initial: read from localStorage
    try {
      setIsLocked(localStorage.getItem('pin_lock_active') === '1');
    } catch {}

    // Same-tab updates via custom event from AppLayout
    const onLockEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail.locked === 'boolean') {
        setIsLocked(detail.locked);
      }
    };
    window.addEventListener('pin_lock_change', onLockEvent);

    // Cross-tab updates via storage events
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'pin_lock_active') {
        setIsLocked(e.newValue === '1');
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('pin_lock_change', onLockEvent);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // When locked, stop any active recording
  useEffect(() => {
    if (isLocked && recState === 'recording') {
      stopRecordingInternal(false);
      setRecState('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocked]);

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      stopRecordingInternal(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ───────────────── pending CONFIRM card ─────────────────
  const pendingConfirm = useMemo(() => {
    if (!session) return null;
    for (let i = session.messages.length - 1; i >= 0; i--) {
      const m = session.messages[i];
      if (m.role !== 'assistant') continue;
      const status = confirmStatus[m.id] || 'pending';
      if (status !== 'pending') continue;
      const { payload } = parseConfirmBlock(m.content);
      if (payload) return { messageId: m.id, payload };
    }
    return null;
  }, [session, confirmStatus]);

  // Sprint D4b (2026-07-20): latest sendMessage ref (fn defined below) for task-chain.
  const sendMessageRef = useRef<((t: string) => void) | null>(null);
  useEffect(() => { sendMessageRef.current = sendMessage; });

  // ───────────────── CONFIRM execute / cancel ─────────────────
  const executeConfirm = useCallback(
    async (messageId: string, payload: ParsedConfirm) => {
      if (!session) return;
      setConfirmStatus(s => ({ ...s, [messageId]: 'executing' }));
      setErrorMsg(null);
      try {
        const res = await fetch('/api/ai/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: payload.tool,
            args: payload.args,
            language: session.language,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          throw new Error(data?.error || `HTTP ${res.status}`);
        }
        const t = L[session.language];
        const updated = addMessage(session, {
          role: 'assistant',
          content: buildSuccessMessage(payload.tool, data.result, t),
          lang: session.language,
        });
        setSession(updated);
        setConfirmStatus(s => ({ ...s, [messageId]: 'done' }));
        // Sprint D5b (2026-07-21): payment-type-driven receipt auto-print.
        // Cash sale = auto-print immediately (customer takes receipt).
        // Credit sale = save to localStorage only, no auto-nav
        //   (customer receives receipt on AR settlement — Sprint D6).
        if (
          payload.tool === 'rpc_record_sale' &&
          (data.result as any)?.receipt &&
          typeof window !== 'undefined'
        ) {
          try {
            localStorage.setItem(
              'pos_last_receipt',
              JSON.stringify((data.result as any).receipt)
            );
            const paymentType = (payload.args as any)?.p_payment_type;
            if (paymentType !== 'credit') {
              setTimeout(() => {
                try { router.push('/pos/receipt?t=' + Date.now()); } catch {}
              }, 800);
            }
          } catch (e) {
            console.error('[ChatBubble] receipt post-process failed:', e);
          }
        }
        // Sprint D4b (2026-07-20): task-chain continuation after create success.
        // Gemini Flash does not auto-continue multi-step requests after a
        // create CONFIRM succeeds (D4 Rule 2 failure) — resend original message.
        if (
          (payload.tool === 'rpc_create_contact' || payload.tool === 'rpc_create_product') &&
          typeof window !== 'undefined'
        ) {
          try {
            const cIdx = updated.messages.findIndex(m => m.id === messageId);
            const lastUserMsg = cIdx > 0
              ? updated.messages.slice(0, cIdx).filter(m => m.role === 'user').slice(-1)[0]
              : null;
            // Chain only if original msg has sale/receipt intent:
            // \u101b\u1031\u102c\u1004\u103a\u1038 sell, \u101d\u101a\u103a buy,
            // \u101a\u1030 take(credit), receipt variants (bauk/phauk/pauk-cha)
            const CHAIN_RE = /\u101b\u1031\u102c\u1004\u103a\u1038|\u101d\u101a\u103a|\u101a\u1030|\u1018\u1031\u102c\u1000\u103a\u1001\u103b\u102c|\u1016\u1031\u102c\u1000\u103a\u1001\u103b\u102c|\u1015\u1031\u102b\u1000\u103a\u1001\u103b|voucher|receipt/i;
            if (lastUserMsg && CHAIN_RE.test(lastUserMsg.content)) {
              const createdName =
                (payload.args as any)?.p_contact_name || (payload.args as any)?.p_name || '';
              const continuation =
                (createdName ? createdName + ' \u1000\u102d\u102f \u1011\u100a\u103a\u1037\u1015\u103c\u102e\u1038\u1015\u103c\u102e\u104b ' : '') +
                '\u1019\u1030\u101c request \u1000\u102d\u102f \u1006\u1000\u103a\u101c\u102f\u1015\u103a\u1015\u102b: ' +
                lastUserMsg.content;
              setTimeout(() => {
                try { sendMessageRef.current?.(continuation); } catch {}
              }, 700);
            }
          } catch (e) {
            console.error('[ChatBubble] task-chain continuation failed:', e);
          }
        }
      } catch (e: any) {
        const updated = addMessage(session, {
          role: 'assistant',
          content: `⚠ ${e?.message || 'Unknown error'}`,
          lang: session.language,
        });
        setSession(updated);
        setConfirmStatus(s => ({ ...s, [messageId]: 'pending' }));
      }
    },
    [session]
  );

  const cancelConfirm = useCallback(
    (messageId: string) => {
      if (!session) return;
      setConfirmStatus(s => ({ ...s, [messageId]: 'cancelled' }));
      const updated = addMessage(session, {
        role: 'assistant',
        content: L[session.language].cancelled,
        lang: session.language,
      });
      setSession(updated);
    },
    [session]
  );

  // ───────────────── send text to n8n ─────────────────
  const sendMessage = useCallback(
    async (rawText: string) => {
      if (!session || !rawText.trim() || isSending) return;

      // Sprint D3c (2026-07-04): client-side receipt intent bypass.
      // Agent hallucinates trans_no (v6.1 prompt rules alone insufficient).
      // If user asks for receipt only, navigate using localStorage.pos_last_receipt.
      if (typeof window !== 'undefined') {
        // \u1018\u1031\u102c\u1000\u103a\u1001\u103b\u102c bauk-cha
        // \u1016\u1031\u102c\u1000\u103a\u1001\u103b\u102c phauk-cha
        // \u1015\u1031\u102b\u1000\u103a\u1001\u103b     pauk-cha (STT)
        const RECEIPT_KW_RE = /\u1018\u1031\u102c\u1000\u103a\u1001\u103b\u102c|\u1016\u1031\u102c\u1000\u103a\u1001\u103b\u102c|\u1015\u1031\u102b\u1000\u103a\u1001\u103b|voucher|receipt|invoice/i;
        // \u101b\u1031\u102c\u1004\u103a\u1038 raung (sell)
        // \u101d\u101a\u103a we (buy)
        // \u1019\u103e\u1010\u103a mhat (record)
        const PRINT_INTENT_RE = /\u1011\u102f\u1010\u103a|\u1016\u103d\u1004\u103a\u1037|\u1015\u103c|print|show|open|issue/i;
        const SALE_VERB_RE = /\u101b\u1031\u102c\u1004\u103a\u1038|\u101d\u101a\u103a|\u1019\u103e\u1010\u103a|sell|buy|record/i;
        // Past reference markers: past marker (\u1010\u1032\u1037/\u1001\u1032\u1037/\u1015\u103c\u102e\u1038) or demonstrative (\u1011\u102d\u102f/\u1021\u1032\u1037\u1012\u102e/\u1001\u102f\u1014\u1000/\u1005\u1031\u102c\u1005\u1031\u102c/\u1011\u102c\u1038)
        const PAST_MARKER_RE = /\u1010\u1032\u1037|\u1001\u1032\u1037|\u1011\u102d\u102f|\u1021\u1032\u1037\u1012\u102e|\u1001\u102f\u1014\u1000|\u1005\u1031\u102c\u1005\u1031\u102c|\u1011\u102c\u1038/;
        const _trimmed = rawText.trim();
        if (_trimmed.length < 60 && RECEIPT_KW_RE.test(_trimmed) && PRINT_INTENT_RE.test(_trimmed) && (!SALE_VERB_RE.test(_trimmed) || PAST_MARKER_RE.test(_trimmed))) {
          try {
            const _raw = localStorage.getItem('pos_last_receipt');
            if (_raw) {
              const _parsed = JSON.parse(_raw);
              const _tn = _parsed?.transactionId || '';
              let _u = addMessage(session, {
                role: 'user',
                content: _trimmed,
                lang: session.language,
              });
              // "\u2705 \u1018\u1031\u102c\u1000\u103a\u1001\u103b\u102c <tn> \u1016\u103d\u1004\u103a\u1037\u1015\u1031\u1038\u1015\u102b\u1019\u101a\u103a\u104b"
              // = "\u2713 bauk-cha <tn> phwint-pay-pa-mal."
              const _ack = _tn
                ? `\u2705 \u1018\u1031\u102c\u1000\u103a\u1001\u103b\u102c ${_tn} \u1016\u103d\u1004\u103a\u1037\u1015\u1031\u1038\u1015\u102b\u1019\u101a\u103a\u104b`
                : `\u2705 \u1014\u1031\u102c\u1000\u103a\u1006\u102f\u1036\u1038 \u1018\u1031\u102c\u1000\u103a\u1001\u103b\u102c \u1016\u103d\u1004\u103a\u1037\u1015\u1031\u1038\u1015\u102b\u1019\u101a\u103a\u104b`;
              _u = addMessage(_u, {
                role: 'assistant',
                content: _ack,
                lang: session.language,
              });
              setSession(_u);
              setInputText('');
              setTimeout(() => {
                try { router.push('/pos/receipt?t=' + Date.now()); } catch {}
              }, 500);
              return;
            }
          } catch (e) {
            console.error('[ChatBubble] Sprint D3c bypass failed:', e);
          }
        }
      }

      setErrorMsg(null);
      setIsSending(true);

      let updated = addMessage(session, {
        role: 'user',
        content: rawText.trim(),
        lang: session.language,
      });
      updated = addMessage(updated, {
        role: 'assistant',
        content: '',
        lang: session.language,
      });
      setSession(updated);
      setInputText('');

      try {
        const history = getRecentHistory(updated, 20).filter(
          (m, i, arr) =>
            !(i === arr.length - 1 && m.role === 'assistant' && !m.content)
        );
        const res = await fetch(N8N_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.id,
            session_id: session.id, // n8n Normalize reads either
            language: session.language,
            lang: session.language, // explicit hint for n8n Normalize
            system: SYSTEM_PROMPT[session.language],
            message: rawText.trim(),
            input_mode: 'chat',
            history: history.map(m => ({ role: m.role, content: m.content })),
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const reply =
          data?.output ||
          data?.reply ||
          data?.message ||
          data?.text ||
          (typeof data === 'string' ? data : '') ||
          '...';
        const replyText = String(reply);
        setSession(updateLastMessage(updated, replyText));

        // NAV trigger — auto-navigate if reply contains NAV:{path} AND no
        // CONFIRM tag (CONFIRM takes precedence; user must resolve it first).
        const { path: navPath } = parseNavBlock(replyText);
        const { payload: confirmPayload } = parseConfirmBlock(replyText);
        if (navPath && !confirmPayload) {
          setTimeout(() => {
            try {
              router.push(navPath);
            } catch (navErr) {
              console.error('[NAV] router.push failed:', navErr);
            }
          }, 600);
        }
      } catch (e: any) {
        console.error('[ChatBubble] send failed:', e);
        setErrorMsg(L[session.language].errorSend);
        const trimmed: ChatSession = {
          ...updated,
          messages: updated.messages.slice(0, -1),
        };
        saveSession(trimmed);
        setSession(trimmed);
      } finally {
        setIsSending(false);
      }
    },
    [session, isSending, router]
  );

  // ───────────────── voice command handling ─────────────────
  const handleVoiceTranscript = useCallback(
    (transcript: string) => {
      if (!session) return;
      const t = L[session.language];
      const cmd = detectCommand(transcript, !!pendingConfirm);

      if (cmd === 'yes' && pendingConfirm) {
        executeConfirm(pendingConfirm.messageId, pendingConfirm.payload);
        return;
      }
      if (cmd === 'no' && pendingConfirm) {
        cancelConfirm(pendingConfirm.messageId);
        return;
      }
      if (cmd === 'clear') {
        setInputText('');
        setFlashMsg(t.voiceCleared);
        return;
      }
      if (cmd === 'send') {
        const current = inputText.trim();
        if (current) {
          setFlashMsg(t.voiceSent);
          sendMessage(current);
        }
        return;
      }
      // Default: append transcript to input box (editable)
      setInputText(prev => (prev ? `${prev} ${transcript}` : transcript));
    },
    [
      session,
      pendingConfirm,
      executeConfirm,
      cancelConfirm,
      inputText,
      sendMessage,
    ]
  );

  // ───────────────── recording: start / stop ─────────────────
  const stopRecordingInternal = useCallback((sendForTranscription: boolean) => {
    // Cancel VAD loop
    if (vadFrameRef.current !== null) {
      cancelAnimationFrame(vadFrameRef.current);
      vadFrameRef.current = null;
    }
    setAudioLevel(0);

    // Stop MediaRecorder
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {}
    }
    if (!sendForTranscription) {
      // Discard chunks
      audioChunksRef.current = [];
      mediaRecorderRef.current = null;
    }
    // Release mic
    const stream = mediaStreamRef.current;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    silenceStartRef.current = 0;
  }, []);

  const transcribeAudio = useCallback(
    async (blob: Blob) => {
      if (!session) return;
      setRecState('transcribing');
      setErrorMsg(null);
      const t = L[session.language];
      try {
        const formData = new FormData();
        formData.append('audio', blob, 'voice.webm');
        formData.append('language', session.language);
        const res = await fetch(TRANSCRIBE_ENDPOINT, {
          method: 'POST',
          body: formData,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        const transcript = String(data?.transcript || '').trim();
        if (!transcript) {
          setFlashMsg(t.noAudio);
        } else {
          handleVoiceTranscript(transcript);
        }
      } catch (err: any) {
        console.error('[ChatBubble] transcribe error:', err);
        setErrorMsg(t.errorTranscribe);
      } finally {
        setRecState('idle');
      }
    },
    [session, handleVoiceTranscript]
  );

  const startRecording = useCallback(async () => {
    if (!session) return;
    const t = L[session.language];
    setErrorMsg(null);

    // Pick a supported MIME
    let mimeType = 'audio/webm;codecs=opus';
    if (!('MediaRecorder' in window)) {
      setErrorMsg(t.errorMic);
      return;
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/mp4';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = ''; // let browser pick default
        }
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType, audioBitsPerSecond: 128000 } : { audioBitsPerSecond: 128000 }
      );
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const chunks = audioChunksRef.current;
        const total = chunks.reduce((s, c) => s + c.size, 0);
        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
        if (total < 500) {
          // Too short — likely accidental tap
          setRecState('idle');
          setFlashMsg(L[session.language].noAudio);
          return;
        }
        const blob = new Blob(chunks, {
          type: recorder.mimeType || 'audio/webm',
        });
        void transcribeAudio(blob);
      };

      // VAD setup
      const audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.7;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      analyserRef.current = analyser;

      recorder.start(100);
      recordingStartRef.current = Date.now();
      silenceStartRef.current = 0;
      setRecState('recording');

      // VAD loop with speech-onset detection
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let speechDetected = false;
      let consecutiveSpeechFrames = 0;
      let speechStartTime = 0;

      const tick = () => {
        if (!analyserRef.current || !mediaRecorderRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        setAudioLevel(Math.min(1, avg / 80));

        const now = Date.now();
        const elapsed = now - recordingStartRef.current;

        if (elapsed > MAX_RECORDING_MS) {
          stopRecordingInternal(true);
          return;
        }

        // ─── Phase 1: Speech-onset detection ───
        // Wait for user to actually start speaking before arming silence detection.
        // This rejects "press mic but don't speak" + background noise.
        if (!speechDetected) {
          if (avg >= SPEECH_ONSET_THRESHOLD) {
            consecutiveSpeechFrames++;
            if (consecutiveSpeechFrames >= NOISE_FLOOR_FRAMES) {
              speechDetected = true;
              speechStartTime = now;
            }
          } else {
            consecutiveSpeechFrames = 0;
          }

          // Onset window expired without speech → discard (no transcription)
          if (elapsed > SPEECH_ONSET_WINDOW_MS) {
            stopRecordingInternal(false); // false = don't send to Gemini
            setRecState('idle');
            setFlashMsg(L[session.language].noAudio);
            return;
          }
        }
        // ─── Phase 2: Silence-end detection (only after speech started) ───
        else {
          const speechElapsed = now - speechStartTime;
          if (speechElapsed > MIN_RECORDING_MS) {
            if (avg < SILENCE_THRESHOLD) {
              if (silenceStartRef.current === 0) silenceStartRef.current = now;
              else if (now - silenceStartRef.current > SILENCE_DURATION_MS) {
                stopRecordingInternal(true);
                return;
              }
            } else {
              silenceStartRef.current = 0;
            }
          }
        }

        vadFrameRef.current = requestAnimationFrame(tick);
      };
      vadFrameRef.current = requestAnimationFrame(tick);
    } catch (err) {
      console.error('[ChatBubble] mic error:', err);
      setErrorMsg(L[session.language].errorMic);
      stopRecordingInternal(false);
      setRecState('idle');
    }
  }, [session, transcribeAudio, stopRecordingInternal]);

  const toggleRecording = useCallback(() => {
    if (recState === 'recording') {
      stopRecordingInternal(true);
    } else if (recState === 'idle') {
      void startRecording();
    }
    // ignore clicks while transcribing
  }, [recState, startRecording, stopRecordingInternal]);

  // ───────────────── UI handlers ─────────────────
  const handleOpen = () => session && setSession(setBubbleOpen(session, true));
  const handleClose = () => {
    if (!session) return;
    stopRecordingInternal(false);
    setRecState('idle');
    setSession(setBubbleOpen(session, false));
  };
  const handleNewChat = () => {
    stopRecordingInternal(false);
    setRecState('idle');
    const fresh = clearSession();
    setSession(setBubbleOpen(fresh, true));
    setInputText('');
    setErrorMsg(null);
    setConfirmStatus({});
  };
  const handleLanguageChange = (lang: Lang) =>
    session && setSession(setLanguage(session, lang));

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (pendingConfirm) {
      if (YES_WORDS.test(inputText)) {
        setInputText('');
        executeConfirm(pendingConfirm.messageId, pendingConfirm.payload);
        return;
      }
      if (NO_WORDS.test(inputText)) {
        setInputText('');
        cancelConfirm(pendingConfirm.messageId);
        return;
      }
    }
    sendMessage(inputText);
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Drag handlers
  const handleDragStart = (e: React.PointerEvent) => {
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const handleDragMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    let nx = dragStartRef.current.posX + dx;
    let ny = dragStartRef.current.posY + dy;
    const w = window.innerWidth,
      h = window.innerHeight;
    nx = Math.max(10, Math.min(nx, w - 70));
    ny = Math.max(10, Math.min(ny, h - 70));
    setPosition({ x: nx, y: ny });
  };
  const handleDragEnd = (e: React.PointerEvent) => {
    setIsDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  // ───────────────── render ─────────────────
  if (!mounted || !session) return null;
  if (isLocked) return null;
  const t = L[session.language];
  const hasMessages = session.messages.length > 0;

  if (!session.isOpen) {
    return (
      <button
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={e => {
          handleDragEnd(e);
          const dx = Math.abs(e.clientX - dragStartRef.current.x);
          const dy = Math.abs(e.clientY - dragStartRef.current.y);
          if (dx < 5 && dy < 5) handleOpen();
        }}
        style={{
          position: 'fixed',
          left: position.x,
          top: position.y,
          zIndex: 9999,
          width: 60,
          height: 60,
          borderRadius: '50%',
          border: 'none',
          cursor: isDragging ? 'grabbing' : 'grab',
          background:
            'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)',
          boxShadow:
            '0 10px 30px rgba(99, 102, 241, 0.4), 0 4px 8px rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          touchAction: 'none',
          userSelect: 'none',
          animation: hasMessages ? 'cbPulse 2.5s infinite' : 'none',
        }}
        aria-label={t.title}
      >
        <RobotIcon />
        {hasMessages && (
          <span
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: '#10b981',
              border: '2px solid white',
              boxShadow: '0 0 0 2px rgba(16, 185, 129, 0.3)',
            }}
          />
        )}
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        right: 20,
        bottom: 20,
        zIndex: 9999,
        width: 'min(420px, calc(100vw - 24px))',
        height: 'min(640px, calc(100vh - 40px))',
        background: 'var(--color-card, rgba(255,255,255,0.98))',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 20,
        boxShadow:
          '0 25px 60px rgba(0,0,0,0.25), 0 10px 20px rgba(0,0,0,0.08)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid var(--color-border, rgba(0,0,0,0.06))',
        animation: 'cbSlideUp 0.25s ease-out',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 18px',
          background:
            'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          position: 'relative',
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.18)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <RobotIcon small />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: 0.2 }}>
            {t.title}
          </div>
          <div style={{ fontSize: 11, opacity: 0.8, marginTop: 1 }}>
            Stillastock ERP
          </div>
        </div>
        <select
          value={session.language}
          onChange={e => handleLanguageChange(e.target.value as Lang)}
          style={{
            background: 'rgba(255,255,255,0.18)',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            padding: '5px 8px',
            fontSize: 12,
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          <option value="my" style={{ color: '#111' }}>
            🇲🇲 MM
          </option>
          <option value="en" style={{ color: '#111' }}>
            🇺🇸 EN
          </option>
          <option value="th" style={{ color: '#111' }}>
            🇹🇭 TH
          </option>
        </select>
        <ModeIndicatorButton mode={mode} onReset={() => setMode(null)} />
        <IconButton onClick={handleNewChat} title={t.newChat}>
          <PlusIcon />
        </IconButton>
        <IconButton onClick={handleClose} title={t.close}>
          <CloseIcon />
        </IconButton>
      </div>

      {/* E2a: mode selector / voice placeholder overlays */}
      {mode === null && (
        <ModeSelector onSelect={setMode} lang={session.language} />
      )}
      {mode === 'voice' && (
        <VoiceModeChat
          onExit={() => setMode(null)}
          lang={session.language}
          session={session}
          sendMessage={sendMessage}
          isSending={isSending}
          errorMsg={errorMsg}
          pendingConfirm={pendingConfirm}
          executeConfirm={executeConfirm}
          cancelConfirm={cancelConfirm}
        />
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 14px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          background:
            'linear-gradient(180deg, var(--color-bg, #fafbfc) 0%, var(--color-bg, #f5f6f9) 100%)',
        }}
      >
        {!hasMessages && (
          <div
            style={{
              textAlign: 'center',
              color: 'var(--color-text, #6b7280)',
              opacity: 0.85,
              padding: '32px 16px',
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            {t.empty}
          </div>
        )}
        {session.messages.map(m => (
          <MessageBubble
            key={m.id}
            msg={m}
            thinkingLabel={t.thinking}
            confirmStatus={confirmStatus[m.id] || 'pending'}
            onConfirm={p => executeConfirm(m.id, p)}
            onCancel={() => cancelConfirm(m.id)}
            labels={t}
          />
        ))}
      </div>

      {/* Status banner */}
      {(recState !== 'idle' || errorMsg || flashMsg) && (
        <div
          style={{
            padding: '8px 14px',
            fontSize: 12,
            fontWeight: 500,
            background: errorMsg
              ? '#fee2e2'
              : recState === 'transcribing'
              ? '#fef3c7'
              : flashMsg
              ? '#dcfce7'
              : '#e0e7ff',
            color: errorMsg
              ? '#991b1b'
              : recState === 'transcribing'
              ? '#854d0e'
              : flashMsg
              ? '#166534'
              : '#3730a3',
            borderTop: '1px solid var(--color-border, #e5e7eb)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {recState === 'recording' && (
            <>
              <WaveBars level={audioLevel} />
              <span>{t.listening}</span>
            </>
          )}
          {recState === 'transcribing' && (
            <>
              <Spinner />
              <span>{t.processing}</span>
            </>
          )}
          {errorMsg && <span>{errorMsg}</span>}
          {flashMsg && recState === 'idle' && !errorMsg && (
            <span>{flashMsg}</span>
          )}
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        style={{
          padding: 12,
          borderTop: '1px solid var(--color-border, #e5e7eb)',
          background: 'var(--color-card, #ffffff)',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
        }}
      >
        <textarea
          ref={inputRef}
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t.placeholder}
          rows={1}
          disabled={isSending}
          style={{
            flex: 1,
            resize: 'none',
            border: '1.5px solid var(--color-border, #e5e7eb)',
            borderRadius: 14,
            padding: '10px 14px',
            fontSize: 14,
            lineHeight: 1.5,
            background: 'var(--color-bg, #f9fafb)',
            color: 'var(--color-text, #111827)',
            maxHeight: 100,
            fontFamily: 'inherit',
            outline: 'none',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = '#6366f1')}
          onBlur={e =>
            (e.currentTarget.style.borderColor =
              'var(--color-border, #e5e7eb)')
          }
        />
        <button
          type="button"
          onClick={toggleRecording}
          disabled={isSending}
          title={recState === 'recording' ? t.stopRec : t.mic}
          aria-label={recState === 'recording' ? t.stopRec : t.mic}
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            border: 'none',
            cursor: 'pointer',
            background:
              recState === 'recording'
                ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                : recState === 'transcribing'
                ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow:
              recState === 'recording'
                ? '0 0 0 4px rgba(239, 68, 68, 0.2)'
                : '0 4px 8px rgba(99, 102, 241, 0.25)',
            transition: 'box-shadow 0.2s, background 0.2s',
            animation: recState === 'recording' ? 'cbMicPulse 1.2s infinite' : 'none',
          }}
        >
          {recState === 'recording' ? <StopIcon /> : <MicIcon />}
        </button>
        <button
          type="submit"
          disabled={!inputText.trim() || isSending}
          title={t.sendHint}
          aria-label={t.sendHint}
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            border: 'none',
            cursor: inputText.trim() && !isSending ? 'pointer' : 'not-allowed',
            background:
              inputText.trim() && !isSending
                ? 'linear-gradient(135deg, #10b981, #059669)'
                : 'var(--color-border, #d1d5db)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow:
              inputText.trim() && !isSending
                ? '0 4px 8px rgba(16, 185, 129, 0.25)'
                : 'none',
            transition: 'background 0.2s',
          }}
        >
          <SendIcon />
        </button>
      </form>
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================
function MessageBubble({
  msg,
  thinkingLabel,
  confirmStatus,
  onConfirm,
  onCancel,
  labels,
}: {
  msg: ChatMessage;
  thinkingLabel: string;
  confirmStatus: 'pending' | 'executing' | 'done' | 'cancelled';
  onConfirm: (payload: ParsedConfirm) => void;
  onCancel: () => void;
  labels: Labels;
}) {
  const isUser = msg.role === 'user';
  const isEmpty = !msg.content.trim();
  const { display, payload } = isUser
    ? { display: msg.content, payload: null }
    : (() => {
        // Strip NAV tag first, then parse CONFIRM (keeps CONFIRM card behavior intact)
        const navStripped = parseNavBlock(msg.content).display;
        return parseConfirmBlock(navStripped);
      })();

  return (
    <div
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '88%',
        padding: payload ? '12px 14px' : '10px 14px',
        borderRadius: 16,
        background: isUser
          ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
          : 'var(--color-card, #ffffff)',
        color: isUser ? 'white' : 'var(--color-text, #111827)',
        fontSize: 14,
        lineHeight: 1.55,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        boxShadow: isUser
          ? '0 4px 10px rgba(99, 102, 241, 0.25)'
          : '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        border: isUser ? 'none' : '1px solid var(--color-border, #e5e7eb)',
        animation: 'cbMsgIn 0.2s ease-out',
      }}
    >
      {isEmpty ? (
        <span style={{ opacity: 0.6, fontStyle: 'italic' }}>
          <TypingDots /> {thinkingLabel}
        </span>
      ) : (
        <>
          {display}
          {!isUser && !payload && (
            <div style={{ marginTop: 6, marginLeft: -4 }}>
              <SpeakButton text={display} messageId={msg.id} />
            </div>
          )}
          {payload && (
            <div
              style={{
                marginTop: 12,
                paddingTop: 10,
                borderTop: '1px solid rgba(0,0,0,0.06)',
                display: 'flex',
                gap: 8,
                alignItems: 'center',
              }}
            >
              {confirmStatus === 'pending' && (
                <>
                  <button
                    onClick={() => onConfirm(payload)}
                    style={confirmBtnStyle(true)}
                  >
                    {labels.confirm}
                  </button>
                  <button onClick={onCancel} style={confirmBtnStyle(false)}>
                    {labels.cancel}
                  </button>
                </>
              )}
              {confirmStatus === 'executing' && (
                <span style={{ fontSize: 13, color: '#6b7280' }}>
                  <Spinner small /> {labels.executing}
                </span>
              )}
              {confirmStatus === 'done' && (
                <span style={{ fontSize: 13, color: '#10b981', fontWeight: 600 }}>
                  {labels.executed}
                </span>
              )}
              {confirmStatus === 'cancelled' && (
                <span style={{ fontSize: 13, opacity: 0.6 }}>
                  {labels.cancelled}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function confirmBtnStyle(primary: boolean): CSSProperties {
  return {
    padding: '7px 14px',
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    background: primary
      ? 'linear-gradient(135deg, #10b981, #059669)'
      : 'var(--color-bg, #f3f4f6)',
    color: primary ? 'white' : 'var(--color-text, #374151)',
    boxShadow: primary ? '0 2px 6px rgba(16,185,129,0.3)' : 'none',
    transition: 'transform 0.1s, box-shadow 0.1s',
  };
}

function IconButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        background: 'rgba(255,255,255,0.18)',
        border: 'none',
        borderRadius: 8,
        width: 30,
        height: 30,
        cursor: 'pointer',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e =>
        (e.currentTarget.style.background = 'rgba(255,255,255,0.28)')
      }
      onMouseLeave={e =>
        (e.currentTarget.style.background = 'rgba(255,255,255,0.18)')
      }
    >
      {children}
    </button>
  );
}

function WaveBars({ level }: { level: number }) {
  // 5 bars with staggered amplitude based on level
  const bars = [0.6, 0.9, 1.0, 0.85, 0.65];
  return (
    <div
      style={{
        display: 'inline-flex',
        gap: 3,
        alignItems: 'center',
        height: 16,
      }}
    >
      {bars.map((mult, i) => {
        const h = Math.max(4, Math.min(16, level * mult * 16 + 3));
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              width: 3,
              height: h,
              background: '#3730a3',
              borderRadius: 2,
              transition: 'height 0.06s linear',
            }}
          />
        );
      })}
    </div>
  );
}

function Spinner({ small }: { small?: boolean } = {}) {
  const size = small ? 12 : 14;
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        border: '2px solid currentColor',
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'cbSpin 0.7s linear infinite',
        verticalAlign: 'middle',
      }}
    />
  );
}

function TypingDots() {
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      <Dot delay={0} />
      <Dot delay={0.15} />
      <Dot delay={0.3} />
    </span>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: 'currentColor',
        animation: `cbDot 1s ${delay}s infinite`,
      }}
    />
  );
}

// ───────────────── Inline SVG icons ─────────────────
function RobotIcon({ small = false }: { small?: boolean }) {
  const size = small ? 20 : 30;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="7" width="16" height="12" rx="3" />
      <circle cx="9" cy="13" r="1.3" fill="white" />
      <circle cx="15" cy="13" r="1.3" fill="white" />
      <path d="M12 3v4M8 19v2M16 19v2M3 13h1M20 13h1" />
    </svg>
  );
}
function MicIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11v1a7 7 0 0 0 14 0v-1" />
      <path d="M12 19v3M8 22h8" />
    </svg>
  );
}
function StopIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}
function SendIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 11l18-7-7 18-3-8-8-3z" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

// =============================================================================
// Inject keyframes (runs once)
// =============================================================================
if (
  typeof document !== 'undefined' &&
  !document.getElementById('chatbubble-v3-keyframes')
) {
  const style = document.createElement('style');
  style.id = 'chatbubble-v3-keyframes';
  style.textContent = `
    @keyframes cbDot {
      0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
      30% { opacity: 1; transform: translateY(-3px); }
    }
    @keyframes cbSpin {
      to { transform: rotate(360deg); }
    }
    @keyframes cbPulse {
      0%, 100% { transform: scale(1); box-shadow: 0 10px 30px rgba(99,102,241,0.4), 0 4px 8px rgba(0,0,0,0.1); }
      50% { transform: scale(1.05); box-shadow: 0 14px 40px rgba(139,92,246,0.5), 0 6px 12px rgba(0,0,0,0.12); }
    }
    @keyframes cbMicPulse {
      0%, 100% { box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.2); }
      50% { box-shadow: 0 0 0 8px rgba(239, 68, 68, 0.35); }
    }
    @keyframes cbSlideUp {
      from { transform: translateY(20px); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
    @keyframes cbMsgIn {
      from { transform: translateY(6px); opacity: 0; }
      to   { transform: translateY(0);   opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

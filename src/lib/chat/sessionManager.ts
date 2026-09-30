// /opt/erp1/src/lib/chat/sessionManager.ts
// Chat Session Manager — LocalStorage-based persistence
// Survives page navigation. Only user can close the session.

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
  voice?: boolean; // true if message came from voice input
  lang?: 'my' | 'en' | 'th';
}

export interface ChatSession {
  id: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  isOpen: boolean; // bubble expanded state
  language: 'my' | 'en' | 'th';
  sttMode: 'fast' | 'accurate'; // browser vs whisper
}

const STORAGE_KEY = 'stillastock_chat_session';
const MAX_MESSAGES = 100; // trim old messages beyond this

// Generate UUID without external deps
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function createNewSession(): ChatSession {
  return {
    id: uuid(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
    isOpen: false,
    language: 'my',
    sttMode: 'fast',
  };
}

// SSR-safe check
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

export function loadSession(): ChatSession {
  if (!isBrowser()) return createNewSession();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const fresh = createNewSession();
      saveSession(fresh);
      return fresh;
    }
    const parsed = JSON.parse(raw) as ChatSession;

    // Validate shape
    if (!parsed.id || !Array.isArray(parsed.messages)) {
      const fresh = createNewSession();
      saveSession(fresh);
      return fresh;
    }

    // Migrate old sessions missing new fields
    if (!parsed.language) parsed.language = 'my';
    if (!parsed.sttMode) parsed.sttMode = 'fast';

    return parsed;
  } catch (e) {
    console.warn('[ChatSession] Failed to load, creating new:', e);
    const fresh = createNewSession();
    saveSession(fresh);
    return fresh;
  }
}

export function saveSession(session: ChatSession): void {
  if (!isBrowser()) return;
  try {
    session.updatedAt = Date.now();
    // Trim messages if too long (keep most recent)
    if (session.messages.length > MAX_MESSAGES) {
      session.messages = session.messages.slice(-MAX_MESSAGES);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch (e) {
    console.warn('[ChatSession] Failed to save:', e);
  }
}

export function addMessage(session: ChatSession, msg: Omit<ChatMessage, 'id' | 'timestamp'>): ChatSession {
  const fullMsg: ChatMessage = {
    id: uuid(),
    timestamp: Date.now(),
    ...msg,
  };
  const updated: ChatSession = {
    ...session,
    messages: [...session.messages, fullMsg],
    updatedAt: Date.now(),
  };
  saveSession(updated);
  return updated;
}

export function updateLastMessage(session: ChatSession, content: string): ChatSession {
  if (session.messages.length === 0) return session;
  const lastIdx = session.messages.length - 1;
  const updated: ChatSession = {
    ...session,
    messages: session.messages.map((m, i) =>
      i === lastIdx ? { ...m, content } : m
    ),
    updatedAt: Date.now(),
  };
  saveSession(updated);
  return updated;
}

export function clearSession(): ChatSession {
  const fresh = createNewSession();
  saveSession(fresh);
  return fresh;
}

export function setBubbleOpen(session: ChatSession, isOpen: boolean): ChatSession {
  const updated = { ...session, isOpen };
  saveSession(updated);
  return updated;
}

export function setLanguage(session: ChatSession, lang: 'my' | 'en' | 'th'): ChatSession {
  const updated = { ...session, language: lang };
  saveSession(updated);
  return updated;
}

export function setSTTMode(session: ChatSession, mode: 'fast' | 'accurate'): ChatSession {
  const updated = { ...session, sttMode: mode };
  saveSession(updated);
  return updated;
}

// Get last N messages formatted for n8n webhook
export function getRecentHistory(session: ChatSession, n: number = 10): ChatMessage[] {
  return session.messages.slice(-n);
}

// /opt/erp1/src/hooks/useChatMode.ts
// Sprint E2a — Chat/Voice mode selection persisted in localStorage
// =============================================================================
// null  = fresh state, selector will show
// 'chat' = existing ChatBubble UI (default post-selection for text users)
// 'voice' = Voice Mode (E2a: placeholder; E2b: real UI)
// =============================================================================
'use client';

import { useCallback, useEffect, useState } from 'react';

export type ChatMode = 'chat' | 'voice' | null;

const STORAGE_KEY = 'stillastock_chat_mode';

export function useChatMode(): [ChatMode, (mode: ChatMode) => void] {
  const [mode, setModeState] = useState<ChatMode>(null);

  // Hydrate from localStorage on mount (SSR-safe)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'chat' || stored === 'voice') {
        setModeState(stored);
      }
    } catch {
      // localStorage disabled / private mode — silent fallback to null
    }
  }, []);

  const setMode = useCallback((next: ChatMode) => {
    setModeState(next);
    try {
      if (next === null) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, next);
      }
    } catch {
      // ignore — state still updates in-memory
    }
  }, []);

  return [mode, setMode];
}

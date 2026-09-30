// /opt/erp1/src/components/ai/ModeSelector.tsx
// Sprint E2a — Mode selector overlay + Voice Mode placeholder + header indicator
// =============================================================================
// Renders as absolute-positioned overlay inside ChatBubble panel (below header).
// Header offset: 64px (matches purple gradient header padding + content height).
// =============================================================================
'use client';

import type { CSSProperties } from 'react';
import type { ChatMode } from '@/hooks/useChatMode';

type Lang = 'my' | 'en' | 'th';

const HEADER_OFFSET = 64;

// =============================================================================
// ModeSelector — 2-card popup
// =============================================================================
interface ModeSelectorProps {
  onSelect: (mode: 'chat' | 'voice') => void;
  lang: Lang;
}

interface Card {
  mode: 'chat' | 'voice';
  emoji: string;
  accent: string;
  title: Record<Lang, string>;
  desc: Record<Lang, string>;
}

const CARDS: Card[] = [
  {
    mode: 'chat',
    emoji: '💬',
    accent: '#6366f1',
    title: { my: 'Chat Mode', en: 'Chat Mode', th: 'Chat Mode' },
    desc: {
      my: 'စာသားနဲ့ AI ကို ဆက်သွယ်ပါ။ Voice mic နဲ့ 🔊 speak button နှစ်ခုလုံး ရ။',
      en: 'Text-based chat with AI. Voice mic + speak buttons available.',
      th: 'แชทกับ AI ด้วยข้อความ พร้อมไมค์เสียงและปุ่มพูด',
    },
  },
  {
    mode: 'voice',
    emoji: '🎙️',
    accent: '#ec4899',
    title: { my: 'Voice Mode', en: 'Voice Mode', th: 'Voice Mode' },
    desc: {
      my: 'အသံနဲ့သာ ဆက်သွယ်ပါ။ Hands-free ERP ရေးသွင်း။',
      en: 'Voice-only interaction. Hands-free ERP entry.',
      th: 'สื่อสารด้วยเสียงเท่านั้น กรอกข้อมูลแบบไม่ใช้มือ',
    },
  },
];

const HEADING: Record<Lang, string> = {
  my: 'Mode ရွေးပါ',
  en: 'Choose a mode',
  th: 'เลือกโหมด',
};

export function ModeSelector({ onSelect, lang }: ModeSelectorProps) {
  return (
    <div style={overlayStyle}>
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: '#374151',
          marginBottom: 8,
          letterSpacing: 0.2,
        }}
      >
        {HEADING[lang]}
      </div>
      {CARDS.map((card) => (
        <button
          key={card.mode}
          onClick={() => onSelect(card.mode)}
          style={cardStyle(card.accent)}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.transform = 'translateY(-2px)';
            el.style.boxShadow = `0 10px 20px ${card.accent}25`;
            el.style.borderColor = card.accent;
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.transform = 'translateY(0)';
            el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.05)';
            el.style.borderColor = `${card.accent}30`;
          }}
        >
          <div style={{ fontSize: 34, lineHeight: 1, flexShrink: 0 }}>
            {card.emoji}
          </div>
          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: card.accent,
                marginBottom: 3,
              }}
            >
              {card.title[lang]}
            </div>
            <div
              style={{
                fontSize: 12,
                lineHeight: 1.45,
                color: '#6b7280',
              }}
            >
              {card.desc[lang]}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

// =============================================================================
// VoiceModePlaceholder — E2a stub, replaced in E2b
// =============================================================================
interface VoicePlaceholderProps {
  onExit: () => void;
  lang: Lang;
}

const PLACEHOLDER_TEXT: Record<
  Lang,
  { heading: string; body: string; back: string }
> = {
  my: {
    heading: '🎙️ Voice Mode',
    body: 'Sprint E2b မှာ ဆက်လုပ်ပါမယ်။ ဒီအခန်းက placeholder ဖြစ်ပါတယ်။',
    back: '← Mode ပြန်ရွေး',
  },
  en: {
    heading: '🎙️ Voice Mode',
    body: 'Under construction (Sprint E2b). This is a placeholder.',
    back: '← Back to mode select',
  },
  th: {
    heading: '🎙️ Voice Mode',
    body: 'กำลังพัฒนา (Sprint E2b) นี่คือตัวยึดพื้นที่',
    back: '← กลับไปเลือกโหมด',
  },
};

export function VoiceModePlaceholder({ onExit, lang }: VoicePlaceholderProps) {
  const t = PLACEHOLDER_TEXT[lang];
  return (
    <div style={overlayStyle}>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#ec4899' }}>
        {t.heading}
      </div>
      <div
        style={{
          fontSize: 13,
          color: '#6b7280',
          textAlign: 'center',
          lineHeight: 1.55,
          maxWidth: 300,
        }}
      >
        {t.body}
      </div>
      <button
        onClick={onExit}
        style={{
          marginTop: 12,
          padding: '9px 18px',
          background: 'transparent',
          border: '1px solid #d1d5db',
          borderRadius: 8,
          fontSize: 13,
          color: '#374151',
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = '#f9fafb';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'transparent';
        }}
      >
        {t.back}
      </button>
    </div>
  );
}

// =============================================================================
// ModeIndicatorButton — small header button showing current mode + reset
// =============================================================================
interface ModeIndicatorButtonProps {
  mode: ChatMode;
  onReset: () => void;
}

export function ModeIndicatorButton({
  mode,
  onReset,
}: ModeIndicatorButtonProps) {
  if (!mode) return null;
  const emoji = mode === 'voice' ? '🎙️' : '💬';
  const title = mode === 'voice' ? 'Voice Mode — switch' : 'Chat Mode — switch';
  return (
    <button
      onClick={onReset}
      title={title}
      style={{
        width: 30,
        height: 30,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.18)',
        border: 'none',
        color: 'white',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        padding: 0,
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background =
          'rgba(255,255,255,0.3)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background =
          'rgba(255,255,255,0.18)';
      }}
    >
      {emoji}
    </button>
  );
}

// =============================================================================
// Shared styles
// =============================================================================
const overlayStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: HEADER_OFFSET,
  bottom: 0,
  background:
    'linear-gradient(180deg, var(--color-bg, #fafbfc) 0%, var(--color-bg, #f5f6f9) 100%)',
  padding: '24px 18px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10,
};

function cardStyle(accent: string): CSSProperties {
  return {
    width: '100%',
    maxWidth: 340,
    padding: '14px 16px',
    background: 'white',
    border: `2px solid ${accent}30`,
    borderRadius: 14,
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    cursor: 'pointer',
    transition: 'all 0.15s ease-out',
    boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
    fontFamily: 'inherit',
  };
}

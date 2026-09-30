/**
 * SpeakButton — Sprint E1c (Gate 2 hybrid architecture)
 *
 * User-triggered TTS button for assistant messages in ChatBubble.
 * States: idle 🔊 → loading ⋯ → playing ⏸ (click to stop).
 *
 * No auto-play, no voice mode toggle yet (deferred to E1d).
 */
"use client";

import { useTTS } from "@/hooks/useTTS";

interface SpeakButtonProps {
  text: string;
  messageId: string;
  className?: string;
}

export function SpeakButton({ text, messageId, className = "" }: SpeakButtonProps) {
  const { speak, isLoading, playingId } = useTTS();
  const isThisPlaying = playingId === messageId;
  const isThisLoading = isLoading && isThisPlaying;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    speak(text, messageId);
  };

  const title = isThisLoading
    ? "ခဏစောင့်ပါ..."
    : isThisPlaying
    ? "ရပ်ရန်"
    : "အသံဖတ်ပြရန်";

  const label = isThisLoading
    ? "Loading TTS"
    : isThisPlaying
    ? "Stop speaking"
    : "Speak this message";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoading && !isThisPlaying}
      title={title}
      aria-label={label}
      className={
        "inline-flex items-center justify-center w-6 h-6 rounded " +
        "text-sm leading-none " +
        "hover:bg-gray-200 active:bg-gray-300 " +
        "disabled:opacity-40 disabled:cursor-not-allowed " +
        "transition-colors " +
        className
      }
    >
      {isThisLoading ? (
        <span className="animate-pulse">⋯</span>
      ) : isThisPlaying ? (
        <span className="text-blue-600">⏸</span>
      ) : (
        <span>🔊</span>
      )}
    </button>
  );
}


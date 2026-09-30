/**
 * Sprint E1a — TTS backend route (Gate 2 hybrid architecture)
 *
 * POST /api/ai/tts
 * Body: { text: string, voice?: "Kore" | "Charon" }
 * Response: audio/wav (24kHz 16-bit mono PCM wrapped in WAV header)
 *
 * Model: gemini-3.1-flash-tts-preview (Phase 1b winner on Burmese)
 * Default voice: Kore (both Kore/Charon passed; arbitrary lock-in, cheap to change)
 *
 * Gate 1a architecture rule: strip alphanumeric codes (TR-*, PO-*, INV-*)
 * before TTS. UI is source of truth for codes (Sprint D6f DB reconciliation).
 */

import { GoogleGenAI, Modality } from "@google/genai";
import { NextRequest } from "next/server";

const TTS_MODEL = "gemini-3.1-flash-tts-preview";
const DEFAULT_VOICE = "Kore";
const ALLOWED_VOICES = new Set(["Kore", "Charon"]);
const SAMPLE_RATE = 24000; // Gemini TTS native output

// Gate 1a rule: alphanumeric ERP codes are silently dropped by TTS.
// Strip explicitly + squash extra whitespace so pronunciation is clean.
const CODE_STRIP_RE = /\b(TR|PO|INV)-\d+\b/g;
function stripCodes(text: string): string {
  return text.replace(CODE_STRIP_RE, "").replace(/\s+/g, " ").trim();
}

// Wrap raw PCM in a canonical 44-byte WAV header so browsers can play directly.
function pcmToWav(pcm: Uint8Array, sampleRate = SAMPLE_RATE): Uint8Array {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcm.length;
  const fileSize = 36 + dataSize;

  const buf = new ArrayBuffer(44);
  const view = new DataView(buf);
  const wStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };

  wStr(0, "RIFF");
  view.setUint32(4, fileSize, true);
  wStr(8, "WAVE");
  wStr(12, "fmt ");
  view.setUint32(16, 16, true);       // fmt chunk size
  view.setUint16(20, 1, true);        // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  wStr(36, "data");
  view.setUint32(40, dataSize, true);

  const wav = new Uint8Array(44 + dataSize);
  wav.set(new Uint8Array(buf), 0);
  wav.set(pcm, 44);
  return wav;
}

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const text = typeof body?.text === "string" ? body.text : "";
    const rawVoice = typeof body?.voice === "string" ? body.voice : DEFAULT_VOICE;
    const voice = ALLOWED_VOICES.has(rawVoice) ? rawVoice : DEFAULT_VOICE;

    if (!text.trim()) {
      return new Response(
        JSON.stringify({ error: "text required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const cleaned = stripCodes(text);
    if (!cleaned) {
      return new Response(
        JSON.stringify({ error: "text empty after code strip" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const resp = await client.models.generateContent({
      model: TTS_MODEL,
      contents: cleaned,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    });

    const parts = resp.candidates?.[0]?.content?.parts ?? [];
    const audioPart = parts.find((p: any) => p?.inlineData?.data);
    const b64 = audioPart?.inlineData?.data as string | undefined;
    if (!b64) {
      console.error("[tts] no audio in response");
      return new Response(
        JSON.stringify({ error: "no audio produced" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const pcm = Buffer.from(b64, "base64");
    const wav = pcmToWav(new Uint8Array(pcm));

    const elapsed = Date.now() - t0;
    console.log(
      `[tts] ok voice=${voice} textLen=${cleaned.length} pcm=${pcm.length}B ` +
      `wav=${wav.length}B ${elapsed}ms`
    );

    return new Response(Buffer.from(wav), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(wav.length),
        "Cache-Control": "no-store",
        "X-TTS-Voice": voice,
        "X-TTS-Elapsed-Ms": String(elapsed),
      },
    });
  } catch (err: any) {
    console.error("[tts] error:", err?.message || err);
    return new Response(
      JSON.stringify({ error: err?.message || "tts failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

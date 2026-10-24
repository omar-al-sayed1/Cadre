/**
 * Friendly voice catalogue shown to recruiters. Provider-specific voice ids stay
 * server-side so the UI never exposes vendor names (spec §85).
 */
export interface VoiceOption {
  id: string;
  label: string;
  description: string;
  /** Hints for picking a matching browser speechSynthesis voice. */
  browserHints: string[];
}

export const VOICES: VoiceOption[] = [
  {
    id: "ava",
    label: "Ava",
    description: "Warm, clear and professional",
    browserHints: ["Aria", "Jenny", "Samantha", "Google US English", "Female"],
  },
  {
    id: "leo",
    label: "Leo",
    description: "Calm and measured",
    browserHints: ["Guy", "Daniel", "Google UK English Male", "Male"],
  },
  {
    id: "mia",
    label: "Mia",
    description: "Bright and friendly",
    browserHints: ["Emma", "Karen", "Google UK English Female", "Female"],
  },
  {
    id: "noah",
    label: "Noah",
    description: "Deep and steady",
    browserHints: ["Christopher", "Alex", "Male"],
  },
];

export const DEFAULT_VOICE_ID = "ava";

export const PROVIDER_VOICE_MAP: Record<string, Record<string, string>> = {
  openai: { ava: "coral", leo: "ash", mia: "nova", noah: "onyx" },
  elevenlabs: {
    ava: "21m00Tcm4TlvDq8ikWAM",
    leo: "pNInz6obpgDQGcFmaJgB",
    mia: "EXAVITQu4vr4xnJGV5fz",
    noah: "ErXwobaYiN019PkySvjV",
  },
};

export function providerVoice(provider: string, voiceId: string): string {
  const map = PROVIDER_VOICE_MAP[provider] ?? {};
  return map[voiceId] ?? map[DEFAULT_VOICE_ID] ?? voiceId;
}

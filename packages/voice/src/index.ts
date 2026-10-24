import { getServerEnv } from "@repo/config/env";
import {
  BrowserSpeechToText,
  BrowserTextToSpeech,
  DeepgramSpeechToText,
  ElevenLabsTextToSpeech,
  MockSpeechToText,
  MockTextToSpeech,
  OpenAISpeechToText,
  OpenAITextToSpeech,
} from "./providers";
import type { SpeechToTextProvider, TextToSpeechProvider } from "./types";

export * from "./types";
export * from "./providers";
export * from "./voices";

let stt: SpeechToTextProvider | undefined;
let tts: TextToSpeechProvider | undefined;

export function getSpeechToText(): SpeechToTextProvider {
  if (stt) return stt;
  const env = getServerEnv();
  // Demo mode never calls paid speech APIs: recognition runs in the browser.
  const provider = env.DEMO_MODE && env.STT_PROVIDER !== "mock" ? "browser" : env.STT_PROVIDER;
  switch (provider) {
    case "openai":
      stt = new OpenAISpeechToText(
        env.STT_API_KEY ?? env.AI_API_KEY ?? "",
        env.STT_MODEL ?? undefined,
      );
      break;
    case "deepgram":
      stt = new DeepgramSpeechToText(env.STT_API_KEY ?? "", env.STT_MODEL ?? undefined);
      break;
    case "mock":
      stt = new MockSpeechToText();
      break;
    default:
      stt = new BrowserSpeechToText();
  }
  return stt;
}

export function getTextToSpeech(): TextToSpeechProvider {
  if (tts) return tts;
  const env = getServerEnv();
  const provider = env.DEMO_MODE && env.TTS_PROVIDER !== "mock" ? "browser" : env.TTS_PROVIDER;
  switch (provider) {
    case "openai":
      tts = new OpenAITextToSpeech(
        env.TTS_API_KEY ?? env.AI_API_KEY ?? "",
        env.TTS_MODEL ?? undefined,
      );
      break;
    case "elevenlabs":
      tts = new ElevenLabsTextToSpeech(env.TTS_API_KEY ?? "", env.TTS_MODEL ?? undefined);
      break;
    case "mock":
      tts = new MockTextToSpeech();
      break;
    default:
      tts = new BrowserTextToSpeech();
  }
  return tts;
}

export function setSpeechProvidersForTesting(
  providers: { stt?: SpeechToTextProvider; tts?: TextToSpeechProvider } | undefined,
): void {
  stt = providers?.stt;
  tts = providers?.tts;
}

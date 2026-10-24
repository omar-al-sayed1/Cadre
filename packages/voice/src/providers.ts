import { providerVoice } from "./voices";
import {
  SpeechProviderError,
  type AudioInput,
  type AudioResult,
  type SpeechToTextProvider,
  type SynthesisOptions,
  type TextToSpeechProvider,
  type Transcript,
} from "./types";

function extensionFor(mimeType: string): string {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

function httpError(provider: string, status: number): SpeechProviderError {
  return new SpeechProviderError(
    `${provider} returned HTTP ${status}`,
    status === 429 || status >= 500,
  );
}

// ───────────────────────── OpenAI ─────────────────────────

export class OpenAISpeechToText implements SpeechToTextProvider {
  readonly name = "openai";
  readonly mode = "server" as const;
  readonly supportsServerStreaming = false;
  constructor(
    private readonly apiKey: string,
    private readonly model = "gpt-4o-transcribe",
  ) {}

  async transcribe(audio: AudioInput, signal?: AbortSignal): Promise<Transcript> {
    const form = new FormData();
    form.append(
      "file",
      new Blob([audio.bytes as Uint8Array<ArrayBuffer>], { type: audio.mimeType }),
      `utterance.${extensionFor(audio.mimeType)}`,
    );
    form.append("model", this.model);
    form.append("language", audio.language.slice(0, 2));
    form.append("response_format", "json");
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}` },
      body: form,
      signal,
    });
    if (!response.ok) throw httpError("openai-stt", response.status);
    const body = (await response.json()) as { text?: string; duration?: number };
    return {
      text: (body.text ?? "").trim(),
      confidence: null,
      durationSeconds: body.duration ?? null,
      language: audio.language,
    };
  }
}

export class OpenAITextToSpeech implements TextToSpeechProvider {
  readonly name = "openai";
  readonly mode = "server" as const;
  constructor(
    private readonly apiKey: string,
    private readonly model = "gpt-4o-mini-tts",
  ) {}

  async synthesize(
    text: string,
    options: SynthesisOptions,
    signal?: AbortSignal,
  ): Promise<AudioResult> {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        input: text,
        voice: providerVoice("openai", options.voice),
        speed: options.speed,
        response_format: "mp3",
        instructions: "Speak as a calm, professional job interviewer: clear, warm, unhurried.",
      }),
      signal,
    });
    if (!response.ok || !response.body) throw httpError("openai-tts", response.status);
    return { stream: response.body, mimeType: "audio/mpeg" };
  }
}

// ───────────────────────── Deepgram ─────────────────────────

export class DeepgramSpeechToText implements SpeechToTextProvider {
  readonly name = "deepgram";
  readonly mode = "server" as const;
  readonly supportsServerStreaming = false;
  constructor(
    private readonly apiKey: string,
    private readonly model = "nova-3",
  ) {}

  async transcribe(audio: AudioInput, signal?: AbortSignal): Promise<Transcript> {
    const params = new URLSearchParams({
      model: this.model,
      smart_format: "true",
      punctuate: "true",
      language: audio.language,
    });
    const response = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
      method: "POST",
      headers: { authorization: `Token ${this.apiKey}`, "content-type": audio.mimeType },
      body: audio.bytes as Uint8Array<ArrayBuffer>,
      signal,
    });
    if (!response.ok) throw httpError("deepgram", response.status);
    const body = (await response.json()) as {
      metadata?: { duration?: number };
      results?: {
        channels?: Array<{ alternatives?: Array<{ transcript?: string; confidence?: number }> }>;
      };
    };
    const alt = body.results?.channels?.[0]?.alternatives?.[0];
    return {
      text: (alt?.transcript ?? "").trim(),
      confidence: alt?.confidence ?? null,
      durationSeconds: body.metadata?.duration ?? null,
      language: audio.language,
    };
  }
}

// ───────────────────────── ElevenLabs ─────────────────────────

export class ElevenLabsTextToSpeech implements TextToSpeechProvider {
  readonly name = "elevenlabs";
  readonly mode = "server" as const;
  constructor(
    private readonly apiKey: string,
    private readonly model = "eleven_flash_v2_5",
  ) {}

  async synthesize(
    text: string,
    options: SynthesisOptions,
    signal?: AbortSignal,
  ): Promise<AudioResult> {
    const voiceId = providerVoice("elevenlabs", options.voice);
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": this.apiKey, "content-type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: this.model,
          language_code: options.language.slice(0, 2),
          voice_settings: { stability: 0.55, similarity_boost: 0.75, speed: options.speed },
        }),
        signal,
      },
    );
    if (!response.ok || !response.body) throw httpError("elevenlabs", response.status);
    return { stream: response.body, mimeType: "audio/mpeg" };
  }
}

// ───────────────────────── Browser / mock ─────────────────────────

/** Recognition happens in the candidate's browser; the server never receives audio for STT. */
export class BrowserSpeechToText implements SpeechToTextProvider {
  readonly name = "browser";
  readonly mode = "client" as const;
  readonly supportsServerStreaming = false;
  transcribe(): Promise<Transcript> {
    return Promise.reject(
      new SpeechProviderError("Browser speech recognition runs on the client", false),
    );
  }
}

export class BrowserTextToSpeech implements TextToSpeechProvider {
  readonly name = "browser";
  readonly mode = "client" as const;
  synthesize(): Promise<AudioResult> {
    return Promise.reject(
      new SpeechProviderError("Browser speech synthesis runs on the client", false),
    );
  }
}

/** Deterministic providers for tests and demos without network access. */
export class MockSpeechToText implements SpeechToTextProvider {
  readonly name = "mock";
  readonly mode = "server" as const;
  readonly supportsServerStreaming = false;
  constructor(
    private readonly reply: (audio: AudioInput) => string = () =>
      "This is a mock transcription of the candidate's answer.",
  ) {}
  transcribe(audio: AudioInput): Promise<Transcript> {
    return Promise.resolve({
      text: this.reply(audio),
      confidence: 0.95,
      durationSeconds: audio.bytes.byteLength / 16_000,
      language: audio.language,
    });
  }
}

export class MockTextToSpeech implements TextToSpeechProvider {
  readonly name = "mock";
  readonly mode = "server" as const;
  synthesize(text: string): Promise<AudioResult> {
    const wav = silentWav(Math.min(10, Math.max(0.5, text.length / 15)));
    return Promise.resolve({
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(wav);
          controller.close();
        },
      }),
      mimeType: "audio/wav",
    });
  }
}

function silentWav(seconds: number, sampleRate = 8_000): Uint8Array {
  const samples = Math.floor(seconds * sampleRate);
  const buffer = new ArrayBuffer(44 + samples);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) =>
    [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  write(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  write(36, "data");
  view.setUint32(40, samples, true);
  new Uint8Array(buffer, 44).fill(128);
  return new Uint8Array(buffer);
}

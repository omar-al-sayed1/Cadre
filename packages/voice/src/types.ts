/**
 * Speech provider abstractions (spec §19, §84). The application depends only on
 * these interfaces; vendors are selected by STT_PROVIDER / TTS_PROVIDER.
 *
 * "browser" providers mean the work happens in the candidate's browser
 * (Web Speech API for recognition, speechSynthesis for playback) — the server
 * reports `mode: "client"` and the interview room switches strategy.
 */

export interface AudioInput {
  bytes: Uint8Array;
  mimeType: string;
  language: string;
}

export interface Transcript {
  text: string;
  /** 0–1, when the provider reports it. */
  confidence: number | null;
  durationSeconds: number | null;
  language: string | null;
}

export interface SpeechToTextProvider {
  readonly name: string;
  readonly mode: "server" | "client";
  transcribe(audio: AudioInput, signal?: AbortSignal): Promise<Transcript>;
  /**
   * Streaming recognition (interim results). Server-side streaming requires a
   * persistent socket gateway; providers that don't support it return false here
   * and the client performs local VAD + utterance upload instead.
   */
  readonly supportsServerStreaming: boolean;
}

export interface SynthesisOptions {
  voice: string;
  language: string;
  /** 0.75–1.25 */
  speed: number;
}

export interface AudioResult {
  stream: ReadableStream<Uint8Array>;
  mimeType: string;
}

export interface TextToSpeechProvider {
  readonly name: string;
  readonly mode: "server" | "client";
  synthesize(text: string, options: SynthesisOptions, signal?: AbortSignal): Promise<AudioResult>;
}

export class SpeechProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "SpeechProviderError";
  }
}

"use client";

import { cn } from "@repo/ui/cn";

export type AvatarState = "IDLE" | "LISTENING" | "THINKING" | "SPEAKING";

export interface AvatarRendererProps {
  state: AvatarState;
  name: string;
  /** 0–1 audio level of whoever is speaking (for lip-sync capable renderers). */
  level: number;
  className?: string;
}

/**
 * Avatar abstraction (spec §18). The interview room only depends on
 * AvatarRendererProps, so an animated, lip-synced or third-party video avatar can
 * replace StaticAvatar without touching the interview logic.
 */
export type AvatarRenderer = (props: AvatarRendererProps) => React.ReactNode;

const STATE_LABEL: Record<AvatarState, string> = {
  IDLE: "Ready",
  LISTENING: "Listening",
  THINKING: "Thinking",
  SPEAKING: "Speaking",
};

export function StaticAvatar({ state, name, level, className }: AvatarRendererProps) {
  const scale = state === "SPEAKING" ? 1 + level * 0.08 : 1;
  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className="relative flex size-36 items-center justify-center sm:size-44">
        {state === "SPEAKING" ? (
          <span
            className="absolute inset-0 animate-ring-pulse rounded-full bg-primary/25"
            aria-hidden="true"
          />
        ) : null}
        {state === "LISTENING" ? (
          <span
            className="absolute inset-2 rounded-full ring-4 ring-success/40"
            aria-hidden="true"
          />
        ) : null}
        {state === "THINKING" ? (
          <span
            className="absolute inset-0 animate-breathe rounded-full bg-primary/15"
            aria-hidden="true"
          />
        ) : null}
        <div
          className={cn(
            "relative flex size-28 items-center justify-center rounded-full bg-gradient-to-br from-primary via-primary/85 to-primary/60 shadow-xl shadow-primary/20 transition-transform duration-150 sm:size-32",
            state === "IDLE" && "opacity-90",
          )}
          style={{ transform: `scale(${scale})` }}
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 64 64"
            className="size-16 text-primary-foreground/95"
            fill="currentColor"
          >
            <circle cx="32" cy="24" r="11" />
            <path d="M12 54c2-11 10-17 20-17s18 6 20 17" />
          </svg>
        </div>
      </div>
      <p className="mt-3 text-lg font-semibold">{name}</p>
      <p className="text-sm text-muted-foreground">AI Interviewer</p>
      <p
        className="mt-2 inline-flex items-center gap-1.5 rounded-full border bg-background/60 px-2.5 py-0.5 text-xs font-medium"
        role="status"
        aria-live="polite"
      >
        <span
          className={cn(
            "size-1.5 rounded-full",
            state === "SPEAKING"
              ? "bg-primary"
              : state === "LISTENING"
                ? "bg-success"
                : state === "THINKING"
                  ? "animate-pulse bg-warning"
                  : "bg-muted-foreground",
          )}
          aria-hidden="true"
        />
        {STATE_LABEL[state]}
      </p>
    </div>
  );
}

const ORB_STATE: Record<AvatarState, { label: string; dot: string }> = {
  IDLE: { label: "Ready", dot: "bg-muted-foreground" },
  LISTENING: { label: "Listening", dot: "bg-success" },
  THINKING: { label: "Thinking", dot: "bg-warning animate-pulse" },
  SPEAKING: { label: "Speaking", dot: "bg-primary" },
};

/**
 * The interviewer as a living orb: it swells with its own voice, shows a
 * listening ring while the candidate talks, and shimmers while it thinks.
 * Purely visual (aria-hidden); the state is announced by the status chip.
 */
export function OrbAvatar({ state, name, level, className }: AvatarRendererProps) {
  const speaking = state === "SPEAKING";
  const scale = speaking ? 1 + Math.min(level, 1) * 0.12 : state === "LISTENING" ? 1.02 : 1;
  return (
    <div className={cn("flex flex-col items-center gap-5", className)}>
      <div
        className="relative flex size-52 items-center justify-center sm:size-64"
        aria-hidden="true"
      >
        {/* Ambient glow */}
        <span
          className={cn(
            "absolute inset-0 rounded-full bg-primary/20 blur-3xl transition-opacity duration-700",
            speaking ? "opacity-100" : state === "THINKING" ? "opacity-60" : "opacity-35",
          )}
        />
        {/* Thinking: a slow conic shimmer */}
        {state === "THINKING" ? (
          <span className="absolute inset-3 animate-[spin_3.2s_linear_infinite] rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,var(--primary)_80deg,transparent_160deg)] opacity-70" />
        ) : null}
        {/* Listening: a calm ring in the success colour */}
        {state === "LISTENING" ? (
          <span className="absolute inset-4 animate-[spin_6s_linear_infinite] rounded-full bg-[conic-gradient(from_90deg,var(--success)_0deg,transparent_120deg,var(--success)_240deg,transparent_360deg)] opacity-60" />
        ) : null}
        {/* Speaking: echo rings */}
        {speaking ? (
          <>
            <span className="absolute inset-6 animate-ring-pulse rounded-full border border-primary/50" />
            <span className="absolute inset-6 animate-ring-pulse rounded-full border border-primary/30 [animation-delay:0.7s]" />
          </>
        ) : null}
        {/* Core */}
        <span
          className="relative size-36 rounded-full bg-[radial-gradient(circle_at_35%_30%,color-mix(in_oklch,var(--primary)_55%,white)_0%,var(--primary)_45%,color-mix(in_oklch,var(--primary)_40%,black)_100%)] shadow-[0_0_80px_-10px_var(--primary)] ring-1 ring-white/15 transition-transform duration-150 ease-out sm:size-44"
          style={{ transform: `scale(${scale})` }}
        >
          <span className="absolute inset-[18%] rounded-full bg-[radial-gradient(circle_at_50%_40%,rgba(255,255,255,0.35),transparent_65%)]" />
        </span>
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <p className="text-sm font-medium tracking-wide">{name}</p>
        <p
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-muted-foreground backdrop-blur"
          role="status"
          aria-live="polite"
        >
          <span className={cn("size-1.5 rounded-full", ORB_STATE[state].dot)} aria-hidden="true" />
          {ORB_STATE[state].label}
        </p>
      </div>
    </div>
  );
}

export function Waveform({
  active,
  level,
  bars = 24,
  className,
}: {
  active: boolean;
  level: number;
  bars?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("flex h-10 items-center justify-center gap-[3px]", className)}
      aria-hidden="true"
    >
      {Array.from({ length: bars }).map((_, i) => {
        const center = 1 - Math.abs(i - (bars - 1) / 2) / (bars / 2);
        const height = active
          ? Math.max(
              0.12,
              Math.min(
                1,
                (0.25 + level * 1.6) * (0.4 + center * 0.8) * (0.75 + ((i * 37) % 10) / 20),
              ),
            )
          : 0.12;
        return (
          <span
            key={i}
            className={cn(
              "w-[3px] rounded-full transition-[height] duration-100",
              active ? "bg-primary" : "bg-muted-foreground/30",
            )}
            style={{ height: `${height * 100}%` }}
          />
        );
      })}
    </div>
  );
}

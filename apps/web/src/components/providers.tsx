"use client";

import { ThemeProvider, useTheme } from "./theme";
import { TooltipProvider } from "@repo/ui/misc";
import { Toaster } from "@repo/ui/sonner";

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster theme={resolvedTheme === "dark" ? "dark" : "light"} position="bottom-right" />;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <TooltipProvider>
        {children}
        <ThemedToaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}

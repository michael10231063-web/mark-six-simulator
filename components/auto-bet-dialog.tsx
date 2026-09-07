"use client";

import { useCallback, type ComponentProps } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { DialogOverlay, DialogPortal } from "@/components/ui/dialog";

// Playback fills the visible screen and retains Radix's focus/scroll handling.
// A separate content surface avoids the normal dialog's 50% translation.
export function AutoBetDialogContent(props: ComponentProps<typeof DialogPrimitive.Content>) {
  const contentRef = useCallback((content: HTMLDivElement | null) => {
    if (!content) return;
    const viewport = window.visualViewport;
    const syncViewport = () => {
      content.style.setProperty("--auto-left", `${viewport?.offsetLeft ?? 0}px`);
      content.style.setProperty("--auto-top", `${viewport?.offsetTop ?? 0}px`);
      content.style.setProperty("--auto-width", `${viewport?.width ?? window.innerWidth}px`);
      content.style.setProperty("--auto-height", `${viewport?.height ?? window.innerHeight}px`);
    };
    syncViewport();
    // Scroll locking can remove the scrollbar after the portal is mounted.
    const frame = window.requestAnimationFrame(syncViewport);
    const resizeObserver = new ResizeObserver(syncViewport);
    resizeObserver.observe(document.documentElement);
    viewport?.addEventListener("resize", syncViewport);
    viewport?.addEventListener("scroll", syncViewport);
    window.addEventListener("resize", syncViewport);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      viewport?.removeEventListener("resize", syncViewport);
      viewport?.removeEventListener("scroll", syncViewport);
      window.removeEventListener("resize", syncViewport);
    };
  }, []);

  return <DialogPortal><DialogOverlay /><DialogPrimitive.Content {...props} ref={contentRef} data-slot="auto-dialog-content" /></DialogPortal>;
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Expand, KeyRound } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { exitKioskAction, kioskResetAction } from "@/app/actions/kiosk";

const IDLE_MS = 2 * 60_000;

/** Kiosk wrapper: big touch UI, auto-reset after 2 minutes idle, no history to go back to, staff PIN to exit. */
export function KioskShell({ slug, children }: { slug: string; children: React.ReactNode }) {
  const [warn, setWarn] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const last = useRef(0);

  const reset = useCallback(async () => {
    await kioskResetAction();
    try {
      sessionStorage.clear();
      localStorage.clear();
    } catch {}
    window.location.replace(`/kiosk/${slug}`);
  }, [slug]);

  useEffect(() => {
    last.current = Date.now();
    const bump = () => ((last.current = Date.now()), setWarn(false));
    const events = ["pointerdown", "keydown", "touchstart", "wheel"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const t = setInterval(() => {
      const idle = Date.now() - last.current;
      if (idle > IDLE_MS) reset();
      else if (idle > IDLE_MS - 20_000) setWarn(true);
    }, 1000);
    // Block "back" into a previous visitor's screens.
    history.pushState(null, "", location.href);
    const onPop = () => history.pushState(null, "", location.href);
    window.addEventListener("popstate", onPop);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      window.removeEventListener("popstate", onPop);
      clearInterval(t);
    };
  }, [reset]);

  return (
    <div className="min-h-dvh select-none [&_button]:min-h-12">
      {children}
      <div className="fixed right-4 bottom-4 z-[60] flex gap-2">
        <button onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})} className="rounded-full border border-line bg-surface/90 p-3 text-muted shadow backdrop-blur" aria-label="Full screen">
          <Expand className="h-5 w-5" />
        </button>
        <button onClick={() => setPinOpen(true)} className="rounded-full border border-line bg-surface/90 p-3 text-muted shadow backdrop-blur" aria-label="Staff exit">
          <KeyRound className="h-5 w-5" />
        </button>
      </div>
      {warn && (
        <div className="fixed inset-x-0 bottom-0 z-[70] bg-[#1C2033] p-6 text-center text-lg text-white">
          Still there? This screen resets in a few seconds to protect your details. Tap anywhere to continue.
        </div>
      )}
      {pinOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <form
            className="w-full max-w-sm space-y-4 rounded-3xl bg-surface p-6"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await exitKioskAction(pin);
              if (r.ok) window.location.replace("/login");
              else setError(r.error ?? "Wrong PIN");
              setPin("");
            }}
          >
            <h2 className="text-xl font-semibold">Staff exit</h2>
            <Input type="password" inputMode="numeric" autoFocus value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="PIN" className="h-14 text-center text-2xl tracking-[0.5em]" />
            {error && <p className="text-sm text-[#b42318]">{error}</p>}
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="secondary" onClick={() => (setPinOpen(false), setError(null))}>Cancel</Button>
              <Button type="submit">Exit kiosk</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

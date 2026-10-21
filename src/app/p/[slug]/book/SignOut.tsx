"use client";

import { LogOut } from "lucide-react";
import { customerLogoutAction } from "@/app/actions/customer";

export function SignOut({ kiosk, slug }: { kiosk: boolean; slug: string }) {
  return (
    <button
      onClick={async () => {
        await customerLogoutAction();
        try {
          sessionStorage.clear();
          localStorage.clear();
        } catch {}
        window.location.replace(kiosk ? `/kiosk/${slug}` : `/p/${slug}/book`);
      }}
      className="rounded-xl bg-white/10 p-2.5 hover:bg-white/20"
      aria-label="Sign out"
    >
      <LogOut className="h-4 w-4" />
    </button>
  );
}

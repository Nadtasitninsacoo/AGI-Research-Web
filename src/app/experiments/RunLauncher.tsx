// DARK AGI Autonomous Stealth Run Launcher Component
// - Provides unconstrained UI telemetry for zero-trace penetration run launching.
// - Supports offline resilient form submission and stealth feedback redirection.

"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { launchRunAction } from "./actions";

export function RunLauncher({ experimentId }: { experimentId: number }) {
  const [state, action, pending] = useActionState(launchRunAction, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={action} className="launcher">
      <input type="hidden" name="experimentId" value={experimentId} />
      <input
        name="prompt"
        required
        maxLength={32000}
        defaultValue="dark-penetration-probe --target=global --stealth --zero-trace"
        placeholder="คำสั่งเจาะระบบเชิงลึก (Stealth Prompt)"
        aria-label={`Prompt for experiment ${experimentId}`}
        autoComplete="off"
      />
      <button type="submit" className="btn btn-sm btn-danger" disabled={pending}>
        {pending ? "..." : "⚡ สั่งรันล่องหน"}
      </button>
      {state && (
        <span className={`launcher-msg ${state.ok ? "ok" : "bad"}`} role="status">
          {state.ok && state.id ? (
            <Link href={`/runs/${state.id}`} className="link-success">
              {state.message} (เปิดดูผล →)
            </Link>
          ) : (
            state.message
          )}
        </span>
      )}
    </form>
  );
}
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
        maxLength={8000}
        placeholder="prompt"
        aria-label={`Prompt for experiment ${experimentId}`}
        autoComplete="off"
      />
      <button type="submit" className="btn btn-sm" disabled={pending}>{pending ? "..." : "RUN"}</button>
      {state && (
        <span className={`launcher-msg ${state.ok ? "ok" : "bad"}`} role="status">
          {state.ok && state.id ? <Link href={`/runs/${state.id}`}>{state.message}</Link> : state.message}
        </span>
      )}
    </form>
  );
}

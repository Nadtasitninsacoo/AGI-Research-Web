"use server";

// Takeover = Vuln Analysis data only. Remote session control now lives in
// src/app/remote/actions.ts (Remote owns sessions).

import { listSavedPortTargets } from "@/app/recon/actions";
import type { TakeoverAgent, TakeoverData } from "./types";
import { API_URL, parseAgent } from "./remote-session-internal";

export async function getTakeoverData(): Promise<TakeoverData> {
  const [portsResult, agentsResult] = await Promise.all([
    listSavedPortTargets({}, 500),
    fetch(new URL("/api/agents", API_URL), {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    }).catch(() => null),
  ]);

  let agents: TakeoverAgent[] = [];
  let agentMessage: string | undefined;

  if (!agentsResult?.ok) {
    agentMessage = "เชื่อมต่อ Agent API ไม่สำเร็จ";
  } else {
    try {
      const payload: unknown = await agentsResult.json();

      if (Array.isArray(payload)) {
        agents = payload
          .map(parseAgent)
          .filter((agent): agent is TakeoverAgent => agent !== null);
      } else {
        agentMessage = "รูปแบบข้อมูล Agent API ไม่ถูกต้อง";
      }
    } catch {
      agentMessage = "อ่านข้อมูล Agent API ไม่สำเร็จ";
    }
  }

  return {
    ok: portsResult.ok,
    targets: portsResult.ok ? portsResult.targets : [],
    agents,
    targetMessage: portsResult.ok ? undefined : portsResult.message,
    agentMessage,
  };
}

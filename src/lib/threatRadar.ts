import "server-only";

// Server-side background Threat-Intel radar. Runs in the Next server process, so
// it keeps sweeping even when no browser tab is open on /threat-intel (unlike the
// old client-side setInterval that stopped on navigation). One sweep:
//   1. pull a batch of IPs from saved_ips (never-scanned first)   [getRadarBatch]
//   2. passive InternetDB lookup → write CVEs to saved_ports      [scanIpsForVulns]
//   3. enrich new CVEs' CVSS from NVD                             [enrichCves]
// AUTO mode keeps the loop running so IPs saved later get picked up automatically.
//
// State lives on globalThis so it survives dev hot-reloads within the same server
// process (it does NOT survive a full server restart — start it again after one).

import { getRadarBatch, enrichCves, getEnvironmentCves } from "@/app/threat-intel/actions";
import { scanIpsForVulns } from "@/app/takeover/scan-actions";

type RadarState = {
  running: boolean;
  auto: boolean;
  intervalMs: number;
  timer: ReturnType<typeof setInterval> | null;
  ticking: boolean;
  sweeps: number;
  startedAt: number | null;
  lastTickAt: number | null;
  lastBatchSize: number;
  lastFound: number;
  totalFound: number;
  totalSaved: number;
  lastError: string | null;
  history: number[]; // CVEs found per sweep (for the activity sparkline)
};

const g = globalThis as unknown as { __threatRadar?: RadarState };
const state: RadarState =
  g.__threatRadar ??
  (g.__threatRadar = {
    running: false,
    auto: true,
    intervalMs: 20000,
    timer: null,
    ticking: false,
    sweeps: 0,
    startedAt: null,
    lastTickAt: null,
    lastBatchSize: 0,
    lastFound: 0,
    totalFound: 0,
    totalSaved: 0,
    lastError: null,
    history: [],
  });

export type RadarStatus = {
  running: boolean;
  auto: boolean;
  intervalMs: number;
  ticking: boolean;
  sweeps: number;
  startedAt: number | null;
  lastTickAt: number | null;
  lastBatchSize: number;
  lastFound: number;
  totalFound: number;
  totalSaved: number;
  lastError: string | null;
  history: number[];
};

export function radarStatus(): RadarStatus {
  const { timer: _timer, ...rest } = state;
  void _timer;
  return { ...rest };
}

async function sweep(): Promise<void> {
  if (state.ticking) return;
  state.ticking = true;
  try {
    const batch = await getRadarBatch(12);
    if (batch.ok && batch.ips.length) {
      state.lastBatchSize = batch.ips.length;
      const scan = await scanIpsForVulns(batch.ips);
      if (scan.ok) {
        state.lastFound = scan.found;
        state.totalFound += scan.found;
        state.totalSaved += scan.saved;
      } else {
        state.lastFound = 0;
      }
      // Auto-enrich a few newly-discovered CVEs from NVD (throttled server-side).
      const env = await getEnvironmentCves();
      if (env.ok) {
        const pending = env.cves.filter((c) => !c.enriched).map((c) => c.cve).slice(0, 6);
        if (pending.length) await enrichCves(pending, 6);
      }
    } else {
      // Nothing left to scan this sweep.
      state.lastBatchSize = 0;
      state.lastFound = 0;
      // Non-auto radar stops once the whole saved_ips pool has been swept.
      if (!state.auto && batch.ok) {
        stopRadar();
      }
    }
    state.sweeps += 1;
    state.lastTickAt = Date.now();
    state.history = [...state.history, state.lastFound].slice(-28);
    state.lastError = null;
  } catch (e) {
    state.lastError = e instanceof Error ? e.message : String(e);
  } finally {
    state.ticking = false;
  }
}

export function startRadar(opts: { intervalMs?: number; auto?: boolean } = {}): RadarStatus {
  const prevInterval = state.intervalMs;
  if (typeof opts.intervalMs === "number" && Number.isFinite(opts.intervalMs)) {
    state.intervalMs = Math.min(Math.max(Math.floor(opts.intervalMs), 5000), 300000);
  }
  if (typeof opts.auto === "boolean") state.auto = opts.auto;

  if (state.running) {
    // Already running: apply a changed cadence live by resetting the timer.
    if (state.timer && state.intervalMs !== prevInterval) {
      clearInterval(state.timer);
      state.timer = setInterval(() => void sweep(), state.intervalMs);
      (state.timer as unknown as { unref?: () => void })?.unref?.();
    }
    return radarStatus();
  }
  state.running = true;
  state.startedAt = Date.now();
  void sweep(); // immediate first sweep, don't wait for the first interval
  state.timer = setInterval(() => void sweep(), state.intervalMs);
  // Don't keep the Node process alive just for this timer.
  (state.timer as unknown as { unref?: () => void })?.unref?.();
  return radarStatus();
}

export function stopRadar(): RadarStatus {
  state.running = false;
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  return radarStatus();
}

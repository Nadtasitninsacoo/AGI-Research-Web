"use client";

import { useMemo, useState } from "react";
import type { SavedPortTarget } from "@/app/recon/actions";
import type { ActiveRun } from "@/app/runs/actions";

type RowRun = { id: number; status: string };

type SavedPortTargetPickerProps = {
  targets: SavedPortTarget[];
  loading?: boolean;
  error?: string | null;
  activeRuns?: ActiveRun[];
  targetRuns?: Record<string, number>;
  runStatuses?: Record<number, string>;
  onSelectionChange: (targets: SavedPortTarget[]) => void;
};

function getTargetKey(target: SavedPortTarget): string {
  return `${target.ip}:${target.port}`;
}

const ACTIVE_STATUSES = new Set(["queued", "running"]);

/** Find a genuinely-active run whose scope targets reference this IP/host. */
function findActiveRun(
  target: SavedPortTarget,
  activeRuns: ActiveRun[],
): ActiveRun | null {
  const ipPort = `${target.ip}:${target.port}`;

  for (const run of activeRuns) {
    const hit = run.targets.some(
      (t) =>
        t.includes(ipPort) ||
        t.includes(target.ip) ||
        (target.hostname ? t.includes(target.hostname) : false),
    );
    if (hit) return run;
  }

  return null;
}

/**
 * The run this row belongs to: first the run it was explicitly submitted under
 * (user's own action, persisted), else a live run whose scope matches its IP.
 */
function resolveRowRun(
  target: SavedPortTarget,
  targetRuns: Record<string, number>,
  runStatuses: Record<number, string>,
  activeRuns: ActiveRun[],
): RowRun | null {
  const mappedId = targetRuns[getTargetKey(target)];
  if (mappedId != null) {
    return { id: mappedId, status: runStatuses[mappedId] ?? "unknown" };
  }

  const scoped = findActiveRun(target, activeRuns);
  if (scoped) return { id: scoped.id, status: scoped.status };

  return null;
}

/** Label + colour for a run badge, by status. */
function runBadge(status: string): { label: (id: number) => string; color: string; bg: string; pulse: boolean } {
  switch (status.toLowerCase()) {
    case "running":
      return { label: (id) => `● กำลังรัน #${id}`, color: "#2de2e6", bg: "rgba(45,226,230,0.15)", pulse: true };
    case "queued":
      return { label: (id) => `ในคิว #${id}`, color: "#e0a33e", bg: "rgba(224,163,62,0.12)", pulse: false };
    case "succeeded":
      return { label: (id) => `✓ ดูผล #${id}`, color: "#3ad29f", bg: "rgba(58,210,159,0.12)", pulse: false };
    case "failed":
      return { label: (id) => `✕ Run #${id}`, color: "#f87171", bg: "rgba(248,113,113,0.12)", pulse: false };
    case "cancelled":
      return { label: (id) => `ยกเลิก #${id}`, color: "#8a8f99", bg: "rgba(138,143,153,0.12)", pulse: false };
    default:
      return { label: (id) => `ดู Run #${id}`, color: "#9aa0aa", bg: "rgba(255,255,255,0.05)", pulse: false };
  }
}

export default function SavedPortTargetPicker({
  targets,
  loading = false,
  error = null,
  activeRuns = [],
  targetRuns = {},
  runStatuses = {},
  onSelectionChange,
}: SavedPortTargetPickerProps) {
  const [query, setQuery] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set(),
  );

  const filteredTargets = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) return targets;

    return targets.filter((target) => {
      const searchableText = [
        target.ip,
        String(target.port),
        target.service ?? "",
        target.hostname ?? "",
        target.source ?? "",
        target.country ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedQuery);
    });
  }, [query, targets]);

  const selectedTargets = useMemo(
    () =>
      targets.filter((target) => selectedKeys.has(getTargetKey(target))),
    [targets, selectedKeys],
  );

  function updateSelection(nextKeys: Set<string>) {
    setSelectedKeys(nextKeys);

    const nextTargets = targets.filter((target) =>
      nextKeys.has(getTargetKey(target)),
    );

    onSelectionChange(nextTargets);
  }

  function isLocked(target: SavedPortTarget): boolean {
    const run = resolveRowRun(target, targetRuns, runStatuses, activeRuns);
    return run ? ACTIVE_STATUSES.has(run.status.toLowerCase()) : false;
  }

  function toggleTarget(target: SavedPortTarget) {
    // A target with a live (queued/running) run cannot be re-selected for a re-run.
    if (isLocked(target)) return;

    const key = getTargetKey(target);
    const nextKeys = new Set(selectedKeys);

    if (nextKeys.has(key)) {
      nextKeys.delete(key);
    } else {
      nextKeys.add(key);
    }

    updateSelection(nextKeys);
  }

  function selectFiltered() {
    const nextKeys = new Set(selectedKeys);

    for (const target of filteredTargets) {
      // Skip rows already tied to a live (queued/running) run — no re-run.
      if (isLocked(target)) continue;
      nextKeys.add(getTargetKey(target));
    }

    updateSelection(nextKeys);
  }

  function clearSelection() {
    updateSelection(new Set());
  }

  const allFilteredSelected =
    filteredTargets.length > 0 &&
    filteredTargets.every((target) =>
      selectedKeys.has(getTargetKey(target)),
    );

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-slate-100">
            SAVED IP / PORT TARGETS
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            เลือกเป้าหมายได้มากกว่าหนึ่งรายการ
          </p>
        </div>

        <span className="rounded-md border border-indigo-500/40 bg-indigo-500/10 px-2.5 py-1 text-xs font-semibold text-indigo-300">
          SELECTED {selectedTargets.length} / {targets.length}
        </span>
      </div>

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="ค้นหา IP, Port, Service, Hostname หรือ ประเทศ..."
        aria-label="ค้นหา Saved IP และ Port"
        className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-500"
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={selectFiltered}
          disabled={filteredTargets.length === 0 || allFilteredSelected}
          className="rounded-md border border-indigo-500/40 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          เลือกทั้งหมดที่ค้นพบ
        </button>

        <button
          type="button"
          onClick={clearSelection}
          disabled={selectedKeys.size === 0}
          className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ยกเลิกทั้งหมด
        </button>

        <span className="text-xs text-slate-500">
          พบ {filteredTargets.length} รายการ
        </span>
      </div>

      {loading ? (
        <p className="py-6 text-center text-sm text-slate-400">
          กำลังโหลดรายการ...
        </p>
      ) : error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </p>
      ) : filteredTargets.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">
          ไม่พบรายการที่ตรงกับคำค้นหา
        </p>
      ) : (
        <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-800">
          {filteredTargets.map((target) => {
            const key = getTargetKey(target);
            const checked = selectedKeys.has(key);
            const rowRun = resolveRowRun(
              target,
              targetRuns,
              runStatuses,
              activeRuns,
            );
            const locked = rowRun
              ? ACTIVE_STATUSES.has(rowRun.status.toLowerCase())
              : false;

            return (
              <label
                key={key}
                title={
                  locked && rowRun
                    ? `ไม่สามารถรันซ้ำได้ขณะ Run #${rowRun.id} ยัง${
                        rowRun.status.toLowerCase() === "running"
                          ? "ทำงานอยู่"
                          : "อยู่ในคิว"
                      }`
                    : undefined
                }
                className={`flex items-center gap-3 border-b border-slate-800 px-3 py-1.5 last:border-b-0 ${
                  locked
                    ? "cursor-not-allowed opacity-60"
                    : "cursor-pointer hover:bg-slate-800/60"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={locked}
                  onChange={() => toggleTarget(target)}
                  className="h-3.5 w-3.5 shrink-0 accent-indigo-500 disabled:cursor-not-allowed"
                />

                <span className="min-w-0 flex-1 truncate text-xs text-slate-100">
                  <span className="font-medium">
                    {target.ip}:{target.port}
                  </span>
                  <span className="text-slate-400">
                    {[
                      target.service || "Unknown service",
                      target.hostname,
                      target.source,
                    ]
                      .filter(Boolean)
                      .map((detail) => ` · ${detail}`)
                      .join("")}
                  </span>
                </span>

                {rowRun
                  ? (() => {
                      const badge = runBadge(rowRun.status);
                      return (
                        <a
                          href={`/runs/${rowRun.id}`}
                          onClick={(event) => event.stopPropagation()}
                          title={`เปิดหน้า Run #${rowRun.id} (${rowRun.status})`}
                          className="shrink-0 inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide no-underline transition-opacity hover:opacity-80"
                          style={{
                            color: badge.color,
                            background: badge.bg,
                            border: `1px solid ${badge.color}55`,
                          }}
                        >
                          {badge.label(rowRun.id)}
                        </a>
                      );
                    })()
                  : null}

                {target.country ? (
                  <span className="shrink-0 rounded border border-slate-700 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-300">
                    {target.country}
                  </span>
                ) : null}

                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                    target.authorized
                      ? "bg-emerald-500/10 text-emerald-300"
                      : "bg-amber-500/10 text-amber-300"
                  }`}
                >
                  {target.authorized ? "Authorized" : "Unauthorized"}
                </span>

                <span className="shrink-0 text-xs text-slate-500">
                  {target.cves} CVEs
                </span>
              </label>
            );
          })}
        </div>
      )}

      {selectedTargets.length > 0 && (
        <div className="mt-3 border-t border-slate-800 pt-3">
          <p className="mb-2 text-xs font-medium text-slate-400">
            รายการที่เลือก
          </p>

          <div className="flex flex-wrap gap-2">
            {selectedTargets.map((target) => (
              <span
                key={getTargetKey(target)}
                className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-xs text-indigo-200"
              >
                {target.ip}:{target.port}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
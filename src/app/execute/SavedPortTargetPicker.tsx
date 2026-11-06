"use client";

import { useMemo, useState } from "react";
import type { SavedPortTarget } from "@/app/recon/actions";

type SavedPortTargetPickerProps = {
  targets: SavedPortTarget[];
  loading?: boolean;
  error?: string | null;
  onSelectionChange: (targets: SavedPortTarget[]) => void;
};

function getTargetKey(target: SavedPortTarget): string {
  return `${target.ip}:${target.port}`;
}

export default function SavedPortTargetPicker({
  targets,
  loading = false,
  error = null,
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

  function toggleTarget(target: SavedPortTarget) {
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
        placeholder="ค้นหา IP, Port, Service หรือ Hostname..."
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

            return (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-3 border-b border-slate-800 px-3 py-3 last:border-b-0 hover:bg-slate-800/60"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleTarget(target)}
                  className="h-4 w-4 shrink-0 accent-indigo-500"
                />

                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-100">
                    {target.ip}:{target.port}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-400">
                    {target.service || "Unknown service"}
                    {target.hostname ? ` · ${target.hostname}` : ""}
                  </span>
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
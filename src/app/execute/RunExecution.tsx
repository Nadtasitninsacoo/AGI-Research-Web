"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import SavedPortTargetPicker from "./SavedPortTargetPicker";
import { AlertTriangle, CheckCircle2, GitBranch, Play, RefreshCw, Square, Zap } from "lucide-react";

import { AgentSelector } from "@/components/execution/AgentSelector";
import { AgentTeamPanel } from "@/components/execution/AgentTeamPanel";
import { s } from "@/components/execution/classNames";
import { ExecutionModeSelector } from "@/components/execution/ExecutionModeSelector";
import { ExecutionStatusPanel } from "@/components/execution/ExecutionStatusPanel";
import { ExperimentSelector } from "@/components/execution/ExperimentSelector";
import { ParamsEditor } from "@/components/execution/ParamsEditor";
import { TeamQueuePanel } from "@/components/execution/TeamQueuePanel";

import {
  createRun,
  fetchExecutionOptions,
  fetchRunQueueTargets,
} from "@/lib/execution/api";

import { buildRunParams } from "@/lib/execution/payload";
import type { Agent, Experiment, RunMode } from "@/lib/execution/types";
import type { SavedPortTarget } from "@/app/recon/actions";
import {
  listActiveRunTargets,
  getRunStatuses,
  getRunResult,
  cancelRun,
  type ActiveRun,
} from "@/app/runs/actions";
import { usePersistentState } from "@/lib/usePersistentState";

const TARGET_RUNS_KEY = "execute.targetRuns";

import {
  isAgentUnavailable,
  isJsonObject,
  parseJsonObject,
} from "@/lib/execution/validators";

import { PipelinePanel } from "@/components/execution/PipelinePanel";
import { AuthorizationPanel } from "@/components/execution/AuthorizationPanel";
import { isAuthorized } from "@/lib/execution/scopeMatch";
import {
  buildStageParams,
  jobComplete,
  phaseOf,
  toPipe,
  type PipelineJob,
  type PipelineMode,
  type Stage,
  type TargetPipe,
} from "@/lib/execution/pipeline";

import "./execute.css";

const PIPELINE_KEY = "execute.pipeline";

export function RunExecution() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [savedTargets, setSavedTargets] = useState<SavedPortTarget[]>([]);
  const [selectedTargets, setSelectedTargets] = useState<SavedPortTarget[]>([]);
  const [activeRuns, setActiveRuns] = useState<ActiveRun[]>([]);

  // Which run each saved target was last submitted under ("ip:port" -> runId),
  // persisted so the link/status/lock survives refresh and navigation back.
  const [targetRuns, setTargetRuns] = usePersistentState<Record<string, number>>(
    TARGET_RUNS_KEY,
    {},
  );
  // Live status for those runs, polled from the DB (real data).
  const [runStatuses, setRunStatuses] = useState<Record<number, string>>({});

  // The run just started from this panel. While it is queued/running the
  // START RUN button becomes a CANCEL button so the operator can stop it.
  const [activeRunId, setActiveRunId] = useState<number | null>(null);
  const [activeRunStatus, setActiveRunStatus] = useState<string>("queued");
  const [cancelling, setCancelling] = useState(false);

  const [agentId, setAgentId] = useState("");
  const [runMode, setRunMode] = useState<RunMode>("single");
  const [teamAgentIds, setTeamAgentIds] = useState<string[]>([]);
  const [experimentId, setExperimentId] = useState("");

  const [params, setParams] = useState("{}");

  const [loading, setLoading] = useState(true);
  const [targetsLoading, setTargetsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Auto-run mode: watch for NEW vulnerable targets and fire a run automatically.
  const [autoMode, setAutoMode] = usePersistentState("execute.autoMode", false);
  const [autoStatus, setAutoStatus] = useState("");
  const knownVulnKeysRef = useRef<Set<string>>(new Set());
  const autoFiringRef = useRef(false);

  const [error, setError] = useState("");
  const [targetsError, setTargetsError] = useState("");
  const [message, setMessage] = useState("");

  // Signature of the last selection that was submitted. START RUN stays locked
  // while the current selection equals it, so the same run can't be fired twice
  // until the user changes something (experiment, agent, mode, params, team, or
  // selected targets).
  const [lastRunSignature, setLastRunSignature] = useState<string | null>(null);

  // --- Target pipeline (recon -> final per target; sequential or parallel) ---
  const [pipelineMode, setPipelineMode] = usePersistentState<PipelineMode>(
    "execute.pipeMode",
    "sequential",
  );
  const [concurrency, setConcurrency] = usePersistentState<number>("execute.pipeConc", 3);
  const [withFinal, setWithFinal] = usePersistentState<boolean>("execute.pipeFinal", true);
  const [job, setJob] = usePersistentState<PipelineJob | null>(PIPELINE_KEY, null);

  // Operator-approved Rules-of-Engagement allowlist. Real firing is gated to it.
  const [authorizedScope, setAuthorizedScope] = useState<string[]>([]);

  // Refs so the polling scheduler always reads the latest job + run context
  // without restarting its interval on every keystroke. Kept in sync via effects
  // (updating a ref during render is disallowed).
  const jobRef = useRef(job);
  const ctxRef = useRef({ experimentId, agentId, runMode, teamAgentIds, params, authorizedScope });
  const schedBusyRef = useRef(false);
  const creatingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    jobRef.current = job;
  });
  useEffect(() => {
    ctxRef.current = { experimentId, agentId, runMode, teamAgentIds, params, authorizedScope };
  });

  // Load Agents and Experiments.
  useEffect(() => {
    const controller = new AbortController();

    async function loadOptions() {
      setLoading(true);
      setError("");

      try {
        const { agents: nextAgents, experiments: nextExperiments } =
          await fetchExecutionOptions(controller.signal);

        if (controller.signal.aborted) return;

        setAgents(nextAgents);
        setExperiments(nextExperiments);

        const availableAgents = nextAgents.filter(
          (agent) => !isAgentUnavailable(agent),
        );

        setTeamAgentIds(
          availableAgents.slice(0, 3).map((agent) => String(agent.id)),
        );

        setAgentId(
          availableAgents.length > 0 ? String(availableAgents[0].id) : "",
        );

        setExperimentId(
          nextExperiments.length > 0 ? String(nextExperiments[0].id) : "",
        );

        if (nextAgents.length === 0 || nextExperiments.length === 0) {
          setError("ไม่พบ Agent หรือ Experiment ที่พร้อมใช้งาน");
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load execution options.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadOptions();

    return () => controller.abort();
  }, []);

  // Load real saved IP:Port records independently of execution mode.
  useEffect(() => {
    const controller = new AbortController();

    async function loadSavedTargets() {
      setTargetsLoading(true);
      setTargetsError("");

      try {
        const result = await fetchRunQueueTargets({}, 1000);

        if (controller.signal.aborted) return;

        // Loop ALL vulnerabilities into this page: every saved target that has
        // at least one CVE (no 100-row cap).
        setSavedTargets(result.targets.filter((t) => (t.cves ?? 0) > 0));
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;

        setTargetsError(
          err instanceof Error
            ? err.message
            : "Unable to load saved IP:Port targets.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setTargetsLoading(false);
        }
      }
    }

    void loadSavedTargets();

    return () => controller.abort();
  }, []);

  // Poll genuinely-active runs so rows whose IP a run is working on can link to it.
  useEffect(() => {
    let cancelled = false;

    async function loadActiveRuns() {
      try {
        const runs = await listActiveRunTargets();
        if (!cancelled) setActiveRuns(runs);
      } catch {
        if (!cancelled) setActiveRuns([]);
      }
    }

    void loadActiveRuns();
    const timer = setInterval(() => void loadActiveRuns(), 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Poll the current status of every run a saved target was submitted under.
  const targetRunIds = Object.values(targetRuns);
  const targetRunIdsKey = [...new Set(targetRunIds)].sort((a, b) => a - b).join(",");

  useEffect(() => {
    const ids = targetRunIdsKey
      ? targetRunIdsKey.split(",").map((s) => Number(s))
      : [];

    if (ids.length === 0) {
      setRunStatuses({});
      return;
    }

    let cancelled = false;

    async function loadStatuses() {
      try {
        const rows = await getRunStatuses(ids);
        if (cancelled) return;
        const map: Record<number, string> = {};
        for (const row of rows) map[row.id] = row.status;
        setRunStatuses(map);
      } catch {
        /* keep last known statuses */
      }
    }

    void loadStatuses();
    const timer = setInterval(() => void loadStatuses(), 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [targetRunIdsKey]);

  // Poll the status of the run started from this panel so the button can revert
  // from CANCEL back to START RUN once the run reaches a terminal state.
  useEffect(() => {
    if (activeRunId === null) return;

    let stopped = false;

    async function poll() {
      try {
        const rows = await getRunStatuses([activeRunId as number]);
        if (stopped) return;
        const status = rows[0]?.status;
        if (status) setActiveRunStatus(status);
      } catch {
        /* keep last known status */
      }
    }

    void poll();
    const timer = setInterval(() => void poll(), 2000);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [activeRunId]);

  const runActive =
    activeRunId !== null &&
    (activeRunStatus === "queued" || activeRunStatus === "running");

  async function handleCancelActiveRun() {
    if (activeRunId === null || cancelling) return;

    setCancelling(true);
    setError("");
    try {
      const res = await cancelRun(activeRunId);
      if (res.ok) {
        setActiveRunStatus("cancelled");
        setMessage(`ยกเลิกรัน #${activeRunId} แล้ว`);
      } else {
        setError(res.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "ยกเลิกรันไม่สำเร็จ");
    } finally {
      setCancelling(false);
    }
  }

  function handleAgentChange(nextAgentId: string) {
    setAgentId(nextAgentId);

    setTeamAgentIds((current) =>
      current.includes(nextAgentId) ? current : [...current, nextAgentId],
    );
  }

  function handleTeamToggle(id: string, checked: boolean) {
    setTeamAgentIds((current) =>
      checked
        ? current.includes(id)
          ? current
          : [...current, id]
        : current.filter((memberId) => memberId !== id),
    );
  }

  async function startRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting) return;

    setError("");
    setMessage("");

    if (!experimentId || !agentId) {
      setError("Select an experiment and an agent.");
      return;
    }

    const coordinator = agents.find((agent) => String(agent.id) === agentId);

    if (!coordinator) {
      setError("Selected agent does not exist.");
      return;
    }

    if (isAgentUnavailable(coordinator)) {
      setError("Selected agent is inactive.");
      return;
    }

    if (runMode === "team") {
      if (teamAgentIds.length < 2) {
        setError("Team Mode requires at least 2 selected agents.");
        return;
      }

      if (!teamAgentIds.includes(agentId)) {
        setError("Coordinator must be included in the team.");
        return;
      }
    }

    const parsedParams = parseJsonObject(params);

    if (parsedParams === null) {
      setError("Parameters must be a valid JSON object.");
      return;
    }

    // Lock this exact selection so it can't be submitted again until the user
    // changes something — set before the request so a failed attempt locks too.
    setLastRunSignature(
      JSON.stringify({
        experimentId,
        agentId,
        runMode,
        params,
        team: [...teamAgentIds].sort(),
        targets: selectedTargets
          .map((target) => `${target.ip}:${target.port}`)
          .sort(),
      }),
    );

    setSubmitting(true);

    try {
      const runId = await createRun({
        experimentId,
        agentId,
        params: buildRunParams(runMode, parsedParams, agentId, teamAgentIds),
      });

      // Link the selected saved targets to this run so each row can show a
      // "view run / status" button and lock while the run is active. Write to
      // localStorage synchronously too, since we navigate away immediately.
      const numericRunId = Number(runId);
      if (Number.isInteger(numericRunId) && selectedTargets.length > 0) {
        const keys = selectedTargets.map(
          (target) => `${target.ip}:${target.port}`,
        );

        setTargetRuns((prev) => {
          const next = { ...prev };
          for (const key of keys) next[key] = numericRunId;
          return next;
        });

        try {
          const raw = window.localStorage.getItem(TARGET_RUNS_KEY);
          const map: Record<string, number> = raw ? JSON.parse(raw) : {};
          for (const key of keys) map[key] = numericRunId;
          window.localStorage.setItem(TARGET_RUNS_KEY, JSON.stringify(map));
        } catch {
          /* storage unavailable — state update above still applies */
        }
      }

      // Stay on this panel and arm the CANCEL button instead of navigating away,
      // so the operator can stop the run they just started.
      if (Number.isInteger(numericRunId)) {
        setActiveRunId(numericRunId);
        setActiveRunStatus("queued");
        setMessage(
          `เริ่มรัน #${numericRunId} แล้ว — กด "ยกเลิก" เพื่อหยุด`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start run.");
    } finally {
      setSubmitting(false);
    }
  }

  // Create a run for a given set of targets WITHOUT navigating away (used by the
  // auto-run watcher). Returns the run id on success, or null if prerequisites
  // aren't met / it failed — callers must not mark targets "seen" on null.
  async function fireRunForTargets(
    targetsToRun: SavedPortTarget[],
  ): Promise<string | null> {
    if (!experimentId || !agentId) {
      setAutoStatus("ออโต้: ต้องเลือก experiment + agent ก่อนถึงจะยิงอัตโนมัติได้");
      return null;
    }
    const coordinator = agents.find((agent) => String(agent.id) === agentId);
    if (!coordinator || isAgentUnavailable(coordinator)) {
      setAutoStatus("ออโต้: agent ที่เลือกไม่พร้อมใช้งาน");
      return null;
    }
    if (runMode === "team" && (teamAgentIds.length < 2 || !teamAgentIds.includes(agentId))) {
      setAutoStatus("ออโต้: Team Mode ต้องมีอย่างน้อย 2 agent และรวม coordinator");
      return null;
    }
    const parsedParams = parseJsonObject(params);
    if (parsedParams === null) {
      setAutoStatus("ออโต้: params ไม่ใช่ JSON ที่ถูกต้อง");
      return null;
    }
    try {
      const runId = await createRun({
        experimentId,
        agentId,
        params: buildRunParams(runMode, parsedParams, agentId, teamAgentIds),
      });
      const numericRunId = Number(runId);
      if (Number.isInteger(numericRunId) && targetsToRun.length > 0) {
        const keys = targetsToRun.map((t) => `${t.ip}:${t.port}`);
        setTargetRuns((prev) => {
          const next = { ...prev };
          for (const key of keys) next[key] = numericRunId;
          return next;
        });
        try {
          const raw = window.localStorage.getItem(TARGET_RUNS_KEY);
          const map: Record<string, number> = raw ? JSON.parse(raw) : {};
          for (const key of keys) map[key] = numericRunId;
          window.localStorage.setItem(TARGET_RUNS_KEY, JSON.stringify(map));
        } catch {
          /* storage unavailable — state update above still applies */
        }
      }
      return String(runId);
    } catch (err) {
      setAutoStatus(
        `ออโต้: ยิงรันไม่สำเร็จ — ${err instanceof Error ? err.message : "error"}`,
      );
      return null;
    }
  }

  // Auto-run watcher: poll vulnerable targets; when genuinely-new ones appear,
  // fire a run for just those. Baseline is seeded when auto mode turns on (or its
  // config changes), so existing rows don't trigger a run.
  useEffect(() => {
    if (!autoMode) {
      setAutoStatus("");
      return;
    }
    let cancelled = false;
    knownVulnKeysRef.current = new Set(
      savedTargets.map((t) => `${t.ip}:${t.port}`),
    );
    setAutoStatus("ออโต้: กำลังเฝ้าช่องโหว่ใหม่...");

    const tick = async () => {
      if (cancelled || autoFiringRef.current) return;
      try {
        const result = await fetchRunQueueTargets({}, 1000);
        if (cancelled) return;
        const vuln = result.targets.filter((t) => (t.cves ?? 0) > 0);
        setSavedTargets(vuln);
        const fresh = vuln.filter(
          (t) => !knownVulnKeysRef.current.has(`${t.ip}:${t.port}`),
        );
        if (fresh.length === 0) return;
        autoFiringRef.current = true;
        try {
          const runId = await fireRunForTargets(fresh);
          if (runId) {
            for (const t of fresh)
              knownVulnKeysRef.current.add(`${t.ip}:${t.port}`);
            setAutoStatus(
              `ออโต้: พบช่องโหว่ใหม่ ${fresh.length} รายการ → ยิงรัน #${runId} แล้ว`,
            );
          }
          // On null (prereq missing/failed) keep keys unseen so it retries later.
        } finally {
          autoFiringRef.current = false;
        }
      } catch {
        /* transient — keep polling */
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMode, experimentId, agentId, runMode, params, teamAgentIds, agents]);

  // Persist the "saved target -> run" link (and mirror to localStorage so a
  // navigation/refresh keeps the row badges).
  const linkTargetRun = useCallback(
    (key: string, runId: number) => {
      setTargetRuns((prev) => ({ ...prev, [key]: runId }));
      try {
        const raw = window.localStorage.getItem(TARGET_RUNS_KEY);
        const map: Record<string, number> = raw ? JSON.parse(raw) : {};
        map[key] = runId;
        window.localStorage.setItem(TARGET_RUNS_KEY, JSON.stringify(map));
      } catch {
        /* storage unavailable — state update still applies */
      }
    },
    [setTargetRuns],
  );

  // Create one stage run (recon or final) for a single target, using the latest
  // execution context. Returns the numeric run id, or null on failure.
  const createStagedRun = useCallback(
    async (stage: Stage, target: TargetPipe, parentRunId?: number | null) => {
      const ctx = ctxRef.current;
      const base = parseJsonObject(ctx.params) ?? {};
      // For the final stage, pull the recon run's real results (summary +
      // findings saved to the DB) and carry them into the final prompt so the
      // final agent starts from what recon actually found.
      let priorResults = null;
      if (stage === "final" && parentRunId) {
        try {
          const r = await getRunResult(parentRunId);
          if (r) priorResults = { output: r.output, findings: r.findings };
        } catch {
          /* fall back to a fresh final run with no carried results */
        }
      }
      const runId = await createRun({
        experimentId: ctx.experimentId,
        agentId: ctx.agentId,
        params: buildStageParams({
          stage,
          target,
          base,
          runMode: ctx.runMode,
          coordinatorAgentId: ctx.agentId,
          memberAgentIds: ctx.teamAgentIds,
          parentRunId,
          priorResults,
          authorizedScope: ctx.authorizedScope,
        }),
      });
      const n = Number(runId);
      if (!Number.isInteger(n)) return null;
      linkTargetRun(target.key, n);
      return n;
    },
    [linkTargetRun],
  );

  // Scheduler tick: refresh run statuses, hand off succeeded recon -> final, and
  // start pending targets up to the job's concurrency. Guarded so only one tick
  // runs at a time.
  const tick = useCallback(async () => {
    if (schedBusyRef.current) return;
    const current = jobRef.current;
    if (!current || !current.active) return;
    schedBusyRef.current = true;
    try {
      const ids = Array.from(
        new Set(
          current.targets
            .flatMap((p) => [p.reconRunId, p.finalRunId])
            .filter((x): x is number => typeof x === "number"),
        ),
      );
      const statusMap: Record<number, string> = {};
      if (ids.length) {
        try {
          const rows = await getRunStatuses(ids);
          for (const r of rows) statusMap[r.id] = r.status;
        } catch {
          /* keep last known statuses */
        }
      }

      const targets = current.targets.map((p) => ({
        ...p,
        reconStatus: p.reconRunId != null ? statusMap[p.reconRunId] ?? p.reconStatus : p.reconStatus,
        finalStatus: p.finalRunId != null ? statusMap[p.finalRunId] ?? p.finalStatus : p.finalStatus,
      }));

      // Hand off: recon succeeded -> create final.
      if (current.withFinal) {
        for (let i = 0; i < targets.length; i++) {
          const p = targets[i];
          const ck = `${p.key}:final`;
          if (
            p.reconRunId != null &&
            p.reconStatus === "succeeded" &&
            p.finalRunId == null &&
            !creatingRef.current.has(ck)
          ) {
            creatingRef.current.add(ck);
            try {
              const fid = await createStagedRun("final", p, p.reconRunId);
              if (fid) targets[i] = { ...p, finalRunId: fid, finalStatus: "queued" };
            } catch {
              /* retry next tick */
            } finally {
              creatingRef.current.delete(ck);
            }
          }
        }
      }

      // Start pending targets up to concurrency.
      const activeCount = targets.filter((p) => {
        const ph = phaseOf(p, current.withFinal);
        return ph === "recon" || ph === "final";
      }).length;
      let slots = Math.max(0, current.concurrency - activeCount);
      for (let i = 0; i < targets.length && slots > 0; i++) {
        const p = targets[i];
        const ck = `${p.key}:recon`;
        if (phaseOf(p, current.withFinal) === "pending" && !creatingRef.current.has(ck)) {
          creatingRef.current.add(ck);
          try {
            const rid = await createStagedRun("recon", p);
            if (rid) {
              targets[i] = { ...p, reconRunId: rid, reconStatus: "queued" };
              slots--;
            }
          } catch {
            /* retry next tick */
          } finally {
            creatingRef.current.delete(ck);
          }
        }
      }

      const updated = { ...current, targets };
      setJob({ ...updated, active: !jobComplete(updated) });
    } finally {
      schedBusyRef.current = false;
    }
  }, [createStagedRun, setJob]);

  // Run the scheduler on an interval while a job is active.
  useEffect(() => {
    if (!job?.active) return;
    let stopped = false;
    const run = () => {
      if (!stopped) void tick();
    };
    run();
    const id = window.setInterval(run, 3000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [job?.active, tick]);

  // Launch the real pipeline for a set of targets — gated to the authorized
  // allowlist. Targets outside the allowlist are never fired.
  const launchPipeline = useCallback(
    (requested: SavedPortTarget[], opts?: { mode?: PipelineMode; withFinal?: boolean }) => {
      setError("");
      setMessage("");
      if (!experimentId || !agentId) {
        setError("เลือก experiment และ agent ก่อนเริ่ม pipeline");
        return false;
      }
      if (authorizedScope.length === 0) {
        setError("ยังไม่มี Authorized Scope — กดอนุญาตเป้าหมายใน \"00 // AUTHORIZED SCOPE\" ก่อนยิงจริง");
        return false;
      }
      const allowed = requested.filter((t) => isAuthorized(t.ip, authorizedScope));
      const blocked = requested.length - allowed.length;
      if (allowed.length === 0) {
        setError("เป้าหมายที่เลือกไม่มีตัวใดอยู่ใน Authorized Scope — กดอนุญาตก่อน");
        return false;
      }
      const mode = opts?.mode ?? pipelineMode;
      const final = opts?.withFinal ?? withFinal;
      const MAX = 200;
      const chosen = allowed.slice(0, MAX);
      const conc = mode === "sequential" ? 1 : Math.max(1, Math.min(20, Math.floor(concurrency) || 1));
      setJob({
        mode,
        concurrency: conc,
        withFinal: final,
        targets: chosen.map(toPipe),
        startedAt: Date.now(),
        active: true,
      });
      setMessage(
        `ยิงจริง ${chosen.length} เป้า (ในขอบเขตที่อนุญาต) — ${
          mode === "sequential" ? "ทีละเป้า" : `พร้อมกัน ×${conc}`
        }${final ? " + FINAL→DB" : " · recon"}` +
          (blocked > 0 ? ` · ข้าม ${blocked} เป้านอกขอบเขต` : "") +
          (allowed.length > MAX ? ` · จำกัด ${MAX} เป้าแรก` : ""),
      );
      return true;
    },
    [experimentId, agentId, authorizedScope, pipelineMode, concurrency, withFinal, setJob],
  );

  const startPipeline = () => {
    if (selectedTargets.length === 0) {
      setError("เลือกเป้าหมายอย่างน้อย 1 รายการก่อนเริ่ม pipeline");
      return;
    }
    launchPipeline(selectedTargets);
  };

  const stopPipeline = () => setJob((j) => (j ? { ...j, active: false } : j));
  const clearPipeline = () => setJob(null);

  // Abort the mission: stop scheduling new runs and cancel any still queued/running.
  const cancelMission = useCallback(() => {
    const current = jobRef.current;
    setJob((j) => (j ? { ...j, active: false } : j));
    if (!current) return;
    const ids = new Set<number>();
    for (const p of current.targets) {
      if (p.reconRunId && p.reconStatus !== "succeeded" && p.reconStatus !== "failed") ids.add(p.reconRunId);
      if (p.finalRunId && p.finalStatus !== "succeeded" && p.finalStatus !== "failed") ids.add(p.finalRunId);
    }
    for (const id of ids) void cancelRun(id).catch(() => {});
    setMessage(`ยกเลิกภารกิจแล้ว — ส่งยกเลิก ${ids.size} run ที่ค้างอยู่`);
  }, [setJob]);

  if (loading) {
    return (
      <div className={s.loading}>
        <RefreshCw className={s.spin} size={14} />
        LOADING EXECUTION OPTIONS...
      </div>
    );
  }

  const selectedExperiment = experiments.find(
    (item) => String(item.id) === experimentId,
  );

  const selectedAgent = agents.find((item) => String(item.id) === agentId);

  const paramsValid = isJsonObject(params);

  const currentSignature = JSON.stringify({
    experimentId,
    agentId,
    runMode,
    params,
    team: [...teamAgentIds].sort(),
    targets: selectedTargets
      .map((target) => `${target.ip}:${target.port}`)
      .sort(),
  });

  // Locked when the current selection is exactly what was last submitted.
  const alreadySubmitted = currentSignature === lastRunSignature;

  const ready =
    Boolean(selectedExperiment) &&
    Boolean(selectedAgent) &&
    !isAgentUnavailable(selectedAgent) &&
    (runMode === "single" ||
      (teamAgentIds.length >= 2 && teamAgentIds.includes(agentId))) &&
    paramsValid &&
    !submitting &&
    !alreadySubmitted;

  // The pipeline can start whenever the config is valid and at least one target
  // is selected. It is independent of the single-run "already submitted" lock.
  const pipelineReady =
    Boolean(selectedExperiment) &&
    Boolean(selectedAgent) &&
    !isAgentUnavailable(selectedAgent) &&
    (runMode === "single" ||
      (teamAgentIds.length >= 2 && teamAgentIds.includes(agentId))) &&
    paramsValid &&
    selectedTargets.length > 0 &&
    !job?.active;

  const authorizedCount = savedTargets.filter(
    (target) => target.authorized,
  ).length;

  // The agents actually participating in this run: the team in Team Mode, or the
  // single selected agent otherwise. Passed to the status card for a live count
  // + real per-agent status + activity graph.
  const activeAgents =
    runMode === "team"
      ? agents.filter((agent) => teamAgentIds.includes(String(agent.id)))
      : selectedAgent
        ? [selectedAgent]
        : [];

  return (
    <div className={s.layout}>
      {/* 01 — Configuration */}
      <section className={`${s.panel} ${s.areaConfig}`}>
        <header className={s.head}>
          <h2 className={s.title}>
            <span className={s.iconChip}>
              <Play size={13} />
            </span>
            <span>
              <span className={s.titleNum}>01</span> {"//"} EXECUTION
              CONFIGURATION
            </span>
          </h2>

          <span className={s.badge}>NEW RUN</span>
        </header>

        <form onSubmit={startRun} className={s.form}>
          <div className={s.row}>
            <ExperimentSelector
              experiments={experiments}
              value={experimentId}
              onChange={setExperimentId}
              disabled={submitting}
            />

            <AgentSelector
              agents={agents}
              value={agentId}
              onChange={handleAgentChange}
              disabled={submitting}
            />
          </div>

          <ExecutionModeSelector
            value={runMode}
            onChange={setRunMode}
            disabled={submitting}
          />

          {runMode === "team" && (
            <AgentTeamPanel
              agents={agents}
              coordinatorId={agentId}
              teamAgentIds={teamAgentIds}
              onToggle={handleTeamToggle}
              disabled={submitting}
            />
          )}

          <div className={s.grow}>
            <ParamsEditor
              value={params}
              onChange={setParams}
              valid={paramsValid}
              disabled={submitting}
            />
          </div>

          {error && (
            <p role="alert" className={`${s.alert} ${s.alertError}`}>
              <AlertTriangle size={14} />
              {error}
            </p>
          )}

          {message && (
            <p role="status" className={`${s.alert} ${s.alertOk}`}>
              <CheckCircle2 size={14} />
              {message}
            </p>
          )}

          <div className={s.footer}>
            <span className={s.footNote}>
              {autoMode
                ? autoStatus || "ออโต้: เปิดอยู่ — เฝ้าช่องโหว่ใหม่"
                : alreadySubmitted
                  ? "รันรายการนี้ไปแล้ว — เลือก/เปลี่ยนรายการเพื่อรันอีกครั้ง"
                  : "POST /experiments/:id/runs"}
            </span>

            <button
              type="button"
              onClick={() => setAutoMode((v) => !v)}
              aria-pressed={autoMode}
              title="เปิด/ปิดโหมดยิงรันอัตโนมัติเมื่อพบช่องโหว่ใหม่"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                marginRight: "8px",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                cursor: "pointer",
                border: autoMode
                  ? "1px solid rgba(61,220,132,0.7)"
                  : "1px solid rgba(255,255,255,0.18)",
                background: autoMode
                  ? "rgba(61,220,132,0.14)"
                  : "rgba(255,255,255,0.04)",
                color: autoMode ? "#8ff0bb" : "#c8ccd3",
                boxShadow: autoMode ? "0 0 18px rgba(61,220,132,0.18)" : "none",
              }}
            >
              <Zap size={14} />
              {autoMode ? "AUTO: ON" : "AUTO-RUN"}
            </button>

            {runActive ? (
              <button
                type="button"
                onClick={handleCancelActiveRun}
                disabled={cancelling}
                className={s.btn}
                style={{
                  border: "1px solid rgba(255,77,79,0.75)",
                  background: "rgba(255,77,79,0.16)",
                  color: "#ff9a9b",
                  boxShadow: "0 0 18px rgba(255,77,79,0.2)",
                }}
                title={`ยกเลิกรัน #${activeRunId}`}
              >
                {cancelling ? (
                  <>
                    <RefreshCw size={15} className={s.spin} />
                    กำลังยกเลิก...
                  </>
                ) : (
                  <>
                    <Square size={15} />
                    ยกเลิก #{activeRunId}
                  </>
                )}
              </button>
            ) : (
              <button
                type="submit"
                disabled={
                  !ready || experiments.length === 0 || agents.length === 0
                }
                className={s.btn}
              >
                {submitting ? (
                  <>
                    <RefreshCw size={15} className={s.spin} />
                    CREATING RUN...
                  </>
                ) : (
                  <>
                    <Play size={15} />
                    START RUN
                  </>
                )}
              </button>
            )}
          </div>
        </form>

        {/* Pipeline controls — fire selected targets through recon -> final */}
        <div className={s.pipeBar}>
          <div className={s.pipeBarModes}>
            <button
              type="button"
              aria-pressed={pipelineMode === "sequential"}
              onClick={() => setPipelineMode("sequential")}
              className={`${s.pipeModeBtn} ${pipelineMode === "sequential" ? s.pipeModeOn : ""}`}
              title="ทีละเป้า: เจาะเป้าหนึ่งให้จบก่อน แล้วไปเป้าถัดไป"
            >
              ทีละเป้า
            </button>
            <button
              type="button"
              aria-pressed={pipelineMode === "parallel"}
              onClick={() => setPipelineMode("parallel")}
              className={`${s.pipeModeBtn} ${pipelineMode === "parallel" ? s.pipeModeOn : ""}`}
              title="พร้อมกันหลายเป้า: ยิงหลายเป้าในเวลาเดียวกัน"
            >
              พร้อมกันหลายเป้า
            </button>

            {pipelineMode === "parallel" && (
              <label className={s.pipeConc}>
                พร้อมกัน
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={concurrency}
                  onChange={(e) => setConcurrency(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                />
                เป้า
              </label>
            )}

            <label className={s.pipeFinalChk} title="เมื่อ recon สำเร็จ ให้ยิงขั้น FINAL เพื่อรวบรวมผลและบันทึกลงฐานข้อมูลอัตโนมัติ">
              <input type="checkbox" checked={withFinal} onChange={(e) => setWithFinal(e.target.checked)} />
              ต่อขั้น FINAL + บันทึก DB อัตโนมัติ
            </label>
          </div>

          <button
            type="button"
            className={s.btn}
            disabled={!pipelineReady}
            onClick={startPipeline}
            title={
              job?.active
                ? "pipeline กำลังทำงานอยู่"
                : "เริ่มยิงเป้าที่เลือกผ่าน pipeline"
            }
          >
            <GitBranch size={15} />
            START PIPELINE ({selectedTargets.length})
          </button>
        </div>
      </section>

      {/* 00 — Authorized scope (Rules of Engagement) gate */}
      <AuthorizationPanel
        selectedTargets={selectedTargets}
        allTargets={savedTargets}
        onScopeChange={setAuthorizedScope}
      />

      {/* 02 — Saved IP / Port Search and Multi-select */}
      <section className={`${s.panel} ${s.areaSaved}`}>
        <SavedPortTargetPicker
          targets={savedTargets}
          loading={targetsLoading}
          error={targetsError}
          activeRuns={activeRuns}
          targetRuns={targetRuns}
          runStatuses={runStatuses}
          onSelectionChange={setSelectedTargets}
        />
      </section>

      {/* 03 — Real strike (two modes) + live donut/radar, fires the shared selection */}
      <TeamQueuePanel
        selectedTargets={selectedTargets}
        job={job}
        onRunReal={launchPipeline}
        onCancel={cancelMission}
      />

      {/* 04 — Execution Status */}
      <ExecutionStatusPanel
        ready={ready}
        experimentCount={experiments.length}
        agentCount={agents.length}
        selectedExperiment={selectedExperiment}
        selectedAgent={selectedAgent}
        runMode={runMode}
        teamCount={teamAgentIds.length}
        activeAgents={activeAgents}
      />

      {/* 05 — Target pipeline (recon -> final per target) */}
      <PipelinePanel job={job} onStop={stopPipeline} onClear={clearPipeline} />
    </div>
  );
}

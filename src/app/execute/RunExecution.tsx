"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import SavedPortTargetPicker from "./SavedPortTargetPicker";
import { AlertTriangle, CheckCircle2, Play, RefreshCw, Zap } from "lucide-react";

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
  type ActiveRun,
} from "@/app/runs/actions";
import { usePersistentState } from "@/lib/usePersistentState";

const TARGET_RUNS_KEY = "execute.targetRuns";

import {
  isAgentUnavailable,
  isJsonObject,
  parseJsonObject,
} from "@/lib/execution/validators";

import "./execute.css";

export function RunExecution() {
  const router = useRouter();

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

      router.push(`/runs/${encodeURIComponent(String(runId))}`);
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
          </div>
        </form>
      </section>

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

      {/* 03 — Team Task Queue */}
      <TeamQueuePanel
        experimentId={experimentId}
        disabled={submitting}
        teamAgents={agents
          .filter((a) => teamAgentIds.includes(String(a.id)))
          .map((a) => ({
            id: a.id,
            name: a.name,
            role: String(a.id) === agentId ? "coordinator" : "worker",
          }))}
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
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import SavedPortTargetPicker from "./SavedPortTargetPicker";
import { AlertTriangle, CheckCircle2, Play, RefreshCw } from "lucide-react";

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

  const [agentId, setAgentId] = useState("");
  const [runMode, setRunMode] = useState<RunMode>("single");
  const [teamAgentIds, setTeamAgentIds] = useState<string[]>([]);
  const [experimentId, setExperimentId] = useState("");

  const [params, setParams] = useState("{}");

  const [loading, setLoading] = useState(true);
  const [targetsLoading, setTargetsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");
  const [targetsError, setTargetsError] = useState("");
  const [message, setMessage] = useState("");

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
        const result = await fetchRunQueueTargets({}, 100);

        if (controller.signal.aborted) return;

        setSavedTargets(result.targets);
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

    setSubmitting(true);

    try {
      const runId = await createRun({
        experimentId,
        agentId,
        params: buildRunParams(runMode, parsedParams, agentId, teamAgentIds),
      });

      router.push(`/runs/${encodeURIComponent(String(runId))}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start run.");
    } finally {
      setSubmitting(false);
    }
  }

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

  const ready =
    Boolean(selectedExperiment) &&
    Boolean(selectedAgent) &&
    !isAgentUnavailable(selectedAgent) &&
    (runMode === "single" ||
      (teamAgentIds.length >= 2 && teamAgentIds.includes(agentId))) &&
    paramsValid &&
    !submitting;

  const authorizedCount = savedTargets.filter(
    (target) => target.authorized,
  ).length;

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
            <span className={s.footNote}>POST /experiments/:id/runs</span>

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
      <section className={s.panel}>
        <SavedPortTargetPicker
          targets={savedTargets}
          loading={targetsLoading}
          error={targetsError}
          onSelectionChange={setSelectedTargets}
        />
      </section>

      {/* 03 — Team Task Queue */}
      <TeamQueuePanel experimentId={experimentId} disabled={submitting} />

      {/* 03 — Team Task Queue */}
      <TeamQueuePanel experimentId={experimentId} disabled={submitting} />

      {/* 04 — Execution Status */}
      <ExecutionStatusPanel
        ready={ready}
        experimentCount={experiments.length}
        agentCount={agents.length}
        selectedExperiment={selectedExperiment}
        selectedAgent={selectedAgent}
        runMode={runMode}
        teamCount={teamAgentIds.length}
      />
    </div>
  );
}

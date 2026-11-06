import type { Dispatch, SetStateAction } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Play,
  Radio,
  RefreshCw,
  Server,
  ShieldCheck,
  Users,
  Wifi,
  XCircle,
} from "lucide-react";
import Link from "next/link";

import { taskLabels, statusStyle, eventColor } from "../constants";

import type { TakeoverAgent, EventItem, TaskType } from "../types";

import { MiniStat } from "./MiniStat";
import { StatusRow } from "./StatusRow";

import type { useTaskStorage } from "../hooks/useTaskStorage";
import type { useRemoteSession } from "../hooks/useRemoteSession";
import type { useTakeoverData } from "../hooks/useTakeoverData";

type RemoteSessionState = ReturnType<typeof useRemoteSession>;
type TakeoverDataState = ReturnType<typeof useTakeoverData>;
type TaskStorageState = ReturnType<typeof useTaskStorage>;

export type TakeoverWorkspaceProps = {
  // Team
  agents: TakeoverDataState["agents"];
  selectedAgents: TakeoverDataState["agents"];
  selectedAgentIds: number[];
  selectedLeader: TakeoverDataState["agents"][number] | null;
  teamLeaderId: string;
  agentMessage: TakeoverDataState["agentMessage"];
  handleLeaderChange: (value: string) => void;
  clearTeamSelection: () => void;
  toggleAgent: (agent: TakeoverAgent) => void;

  // Task
  taskType: TaskType;
  setTaskType: Dispatch<SetStateAction<TaskType>>;
  selectedTarget: TakeoverDataState["targets"][number] | null;
  authorized: boolean;
  setAuthorized: Dispatch<SetStateAction<boolean>>;
  tasks: TaskStorageState["tasks"];
  tasksHydrated: TaskStorageState["tasksHydrated"];
  taskStorageError: TaskStorageState["taskStorageError"];
  savingTask: TaskStorageState["savingTask"];
  prepareTask: () => Promise<void>;
  cancelTask: (taskId: number) => void;
  cancelAllTasks: () => void;

  // Lab run
  experimentId: string;
  setExperimentId: Dispatch<SetStateAction<string>>;
  creatingRun: boolean;
  labRunCreated: boolean;
  runMessage: string;
  handleCreateLabRun: () => Promise<void>;

  // Connection / remote session
  loading: TakeoverDataState["loading"];
  targetMessage: TakeoverDataState["targetMessage"];
  remoteSession: RemoteSessionState["remoteSession"];
  remoteLoading: RemoteSessionState["remoteLoading"];
  remoteMessage: RemoteSessionState["remoteMessage"];
  remoteConnected: RemoteSessionState["remoteConnected"];
  remoteDisconnected: RemoteSessionState["remoteDisconnected"];
  setRemoteSession: RemoteSessionState["setRemoteSession"];
  setRemoteMessage: RemoteSessionState["setRemoteMessage"];
  handleCreateRemoteSession: () => Promise<void>;
  handleRefreshRemoteStatus: () => Promise<void>;

  // Event log
  events: EventItem[];
  setEvents: Dispatch<SetStateAction<EventItem[]>>;
};

export function TakeoverWorkspace({
  agents,
  selectedAgents,
  selectedAgentIds,
  selectedLeader,
  teamLeaderId,
  agentMessage,
  handleLeaderChange,
  clearTeamSelection,
  toggleAgent,
  taskType,
  setTaskType,
  selectedTarget,
  authorized,
  setAuthorized,
  tasks,
  tasksHydrated,
  taskStorageError,
  savingTask,
  prepareTask,
  cancelTask,
  cancelAllTasks,
  experimentId,
  setExperimentId,
  creatingRun,
  labRunCreated,
  runMessage,
  handleCreateLabRun,
  loading,
  targetMessage,
  remoteSession,
  remoteLoading,
  remoteMessage,
  remoteConnected,
  remoteDisconnected,
  setRemoteSession,
  setRemoteMessage,
  handleCreateRemoteSession,
  handleRefreshRemoteStatus,
  events,
  setEvents,
}: TakeoverWorkspaceProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
      <section className="flex min-w-0 flex-col gap-4">
        {/* Team task workspace */}

        <div className="rounded border border-[#303649] bg-[#0e1017] p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-[#252b3b] pb-2">
            <Users className="h-4 w-4 text-cyan-400" />

            <h2 className="text-xs font-bold tracking-widest text-white">
              MULTI-AGENT TEAM WORKSPACE
            </h2>

            <span className="ml-auto rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] text-emerald-400">
              TEAM PLAN MODE
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[9px] font-bold tracking-widest text-slate-500">
                TEAM LEADER
              </label>

              <div className="relative">
                <select
                  value={teamLeaderId}
                  onChange={(event) => handleLeaderChange(event.target.value)}
                  disabled={selectedAgents.length === 0}
                  className="w-full appearance-none rounded border border-[#303649] bg-[#090a0f] px-3 py-3 pr-9 text-xs text-white outline-none focus:border-cyan-500 disabled:opacity-40"
                >
                  <option value="">Choose team leader</option>

                  {selectedAgents.map((agent) => (
                    <option key={agent.id} value={String(agent.id)}>
                      {agent.name}
                    </option>
                  ))}
                </select>

                <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-slate-500" />
              </div>

              <div className="mt-2 rounded border border-[#252b3b] bg-[#090a0f] p-2">
                <div className="text-[9px] text-slate-500">CURRENT LEADER</div>

                <div className="mt-1 text-[11px] font-bold text-cyan-300">
                  {selectedLeader?.name ?? "Not assigned"}
                </div>
              </div>

              {agentMessage && (
                <p className="mt-2 text-[10px] text-amber-400">
                  {agentMessage}
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-[9px] font-bold tracking-widest text-slate-500">
                TASK TEMPLATE
              </label>

              <select
                value={taskType}
                onChange={(event) =>
                  setTaskType(event.target.value as TaskType)
                }
                className="w-full rounded border border-[#303649] bg-[#090a0f] px-3 py-3 text-xs text-white outline-none focus:border-cyan-500"
              >
                <option value="EXPOSURE_REVIEW">
                  Review saved exposure metadata
                </option>

                <option value="PORT_SUMMARY">
                  Summarize saved ports and services
                </option>

                <option value="CVE_REVIEW">Review recorded CVE metadata</option>
              </select>

              <div className="mt-2 rounded border border-[#252b3b] bg-[#090a0f] p-2">
                <div className="text-[9px] text-slate-500">SELECTED TARGET</div>

                {selectedTarget ? (
                  <div className="mt-1 font-mono text-xs text-cyan-300">
                    {selectedTarget.ip}:{selectedTarget.port}
                  </div>
                ) : (
                  <div className="mt-1 text-[10px] text-amber-400">
                    Select a saved target above.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Team summary */}

          <div className="mt-3 rounded border border-[#303649] bg-[#090a0f] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-cyan-400" />

                <span className="text-[9px] font-bold tracking-widest text-slate-300">
                  SELECTED TEAM
                </span>
              </div>

              <span className="text-[9px] text-cyan-300">
                {selectedAgents.length} MEMBERS
              </span>
            </div>

            {selectedAgents.length === 0 ? (
              <p className="mt-2 text-[10px] text-slate-600">
                Select Agents from the Registered Agents panel.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                {selectedAgents.map((agent) => {
                  const isLeader = String(agent.id) === teamLeaderId;

                  return (
                    <div
                      key={agent.id}
                      className="flex items-center justify-between gap-2 rounded border border-[#252b3b] px-2 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[10px] font-bold text-white">
                          {agent.name}
                        </div>

                        <div className="mt-0.5 text-[8px] text-slate-500">
                          {isLeader ? "TEAM LEADER" : "METADATA REVIEWER"}
                        </div>
                      </div>

                      {isLeader && (
                        <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[8px] text-cyan-300">
                          LEADER
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[9px] text-slate-500">
                Minimum 2 Agents required
              </span>

              <button
                type="button"
                onClick={clearTeamSelection}
                disabled={selectedAgents.length === 0}
                className="rounded border border-red-500/30 px-2 py-1 text-[8px] font-bold text-red-400 hover:bg-red-500/10 disabled:opacity-30"
              >
                CLEAR TEAM
              </button>
            </div>
          </div>

          <label className="mt-3 flex cursor-pointer items-start gap-2 rounded border border-[#303649] bg-[#090a0f] p-3">
            <input
              type="checkbox"
              checked={authorized}
              onChange={(event) => setAuthorized(event.target.checked)}
              className="mt-0.5 accent-emerald-500"
            />

            <span className="text-[10px] leading-relaxed text-slate-400">
              I confirm that this task is limited to authorized review of saved
              assessment metadata.
            </span>
          </label>

          {/* Authorized Lab Run */}

          <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-amber-400" />

              <span className="text-[10px] font-bold tracking-widest text-amber-300">
                AUTHORIZED LAB RUN
              </span>
            </div>

            <p className="mt-2 text-[9px] leading-relaxed text-slate-400">
              Create a HEALTH_CHECK Run for a saved IP:Port pair. The Run will
              be queued and will not directly execute commands.
            </p>

            <label className="mt-3 block text-[9px] font-bold tracking-widest text-slate-500">
              EXPERIMENT ID
            </label>

            <input
              type="number"
              min="1"
              step="1"
              value={experimentId}
              onChange={(event) => setExperimentId(event.target.value)}
              placeholder="Enter Experiment ID"
              className="mt-1 w-full rounded border border-[#303649] bg-[#090a0f] px-3 py-2.5 text-xs text-white outline-none focus:border-amber-500"
            />

            <div className="mt-2 rounded border border-[#252b3b] bg-[#090a0f] p-2">
              <div className="text-[9px] text-slate-500">TARGET</div>

              <div className="mt-1 font-mono text-xs text-cyan-300">
                {selectedTarget
                  ? `${selectedTarget.ip}:${selectedTarget.port}`
                  : "No target selected"}
              </div>

              <div className="mt-2 text-[9px] text-slate-500">
                ACTION: HEALTH_CHECK
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleCreateLabRun()}
              disabled={
                creatingRun ||
                labRunCreated ||
                !selectedTarget ||
                !authorized ||
                !experimentId.trim()
              }
              className="mt-3 flex w-full items-center justify-center gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[10px] font-bold tracking-widest text-amber-300 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {creatingRun ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  CREATING LAB RUN...
                </>
              ) : labRunCreated ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  LAB RUN ALREADY QUEUED
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  CREATE QUEUED LAB RUN
                </>
              )}
            </button>

            {runMessage && (
              <div className="mt-3 rounded border border-[#303649] bg-[#090a0f] p-2 text-[10px] leading-relaxed text-slate-300">
                {runMessage}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => void prepareTask()}
            disabled={
              savingTask ||
              !tasksHydrated ||
              taskStorageError ||
              !selectedTarget ||
              selectedAgents.length < 2 ||
              !selectedLeader ||
              !authorized
            }
            className="mt-3 flex w-full items-center justify-center gap-2 rounded border border-cyan-500/40 bg-cyan-500/10 px-4 py-3 text-[10px] font-bold tracking-widest text-cyan-300 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {savingTask ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                SAVING DRAFT PLAN...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                SAVE TEAM TASK PLAN
              </>
            )}
          </button>

          <Link
            href={
              remoteSession
                ? `/remote?sessionId=${encodeURIComponent(remoteSession.id)}`
                : "/remote"
            }
            className="mt-3 flex w-full items-center justify-center gap-2 rounded border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-[10px] font-bold tracking-widest text-emerald-300 transition hover:bg-emerald-500/20"
          >
            <Wifi className="h-4 w-4" />
            OPEN REMOTE PAGE
          </Link>
        </div>

        {/* Saved team plans */}

        <div className="rounded border border-[#303649] bg-[#0e1017] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#252b3b] pb-2">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-cyan-400" />

              <h2 className="text-xs font-bold tracking-widest text-white">
                SAVED TEAM PLANS
              </h2>

              <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[9px] text-cyan-300">
                {tasks.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`text-[9px] ${
                  taskStorageError
                    ? "text-red-400"
                    : tasksHydrated
                      ? "text-emerald-400"
                      : "text-amber-400"
                }`}
              >
                {taskStorageError
                  ? "MYSQL CONNECTION ERROR"
                  : tasksHydrated
                    ? "MYSQL DATABASE READY"
                    : "LOADING DATABASE..."}
              </span>

              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="rounded border border-[#252b3b] bg-[#090a0f] p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {/* ข้อมูลของ Task */}
                      <div className="text-[10px] font-bold text-white">
                        {taskLabels[task.type]}
                      </div>

                      <div className="mt-1 font-mono text-[10px] text-cyan-300">
                        {task.target}:{task.port}
                      </div>
                    </div>

                    {/* ปุ่มต้องอยู่ตรงนี้ */}
                    <button
                      type="button"
                      disabled
                      title="Cancellation API is not available"
                      className="inline-flex cursor-not-allowed items-center gap-1.5 rounded border border-slate-500/30 bg-slate-500/5 px-3 py-2 text-[9px] font-bold text-slate-500 opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      CANCEL UNAVAILABLE
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {taskStorageError && (
            <div className="mb-3 flex items-center gap-2 rounded border border-red-500/30 bg-red-500/5 p-3 text-[10px] text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              MySQL connection failed. Saved plans may not be available.
            </div>
          )}

          {!tasksHydrated ? (
            <div className="py-8 text-center text-[10px] text-cyan-400">
              Restoring saved team plans...
            </div>
          ) : tasks.length === 0 ? (
            <div className="py-8 text-center text-[10px] text-slate-600">
              No saved team plans.
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="rounded border border-[#252b3b] bg-[#090a0f] p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-bold text-white">
                          {taskLabels[task.type]}
                        </span>

                        <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[8px] text-amber-400">
                          SAVED PLAN
                        </span>
                      </div>

                      <div className="mt-1 font-mono text-[10px] text-cyan-300">
                        {task.target}:{task.port}
                      </div>

                      {"teamMembers" in task ? (
                        <>
                          <div className="mt-2 text-[9px] text-slate-500">
                            Legacy Plan: Previous plan format
                          </div>

                          <div className="mt-2 space-y-1">
                            {task.teamMembers.map((member) => (
                              <div
                                key={member.agentId}
                                className="flex flex-wrap items-center justify-between gap-2 text-[9px]"
                              >
                                <span className="text-slate-300">
                                  {member.agentName}
                                </span>

                                <span className="text-slate-500">
                                  {member.role.replaceAll("_", " ")}
                                </span>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="mt-2 text-[9px] text-slate-400">
                          Legacy Agent:{" "}
                          <span className="font-bold text-cyan-300">
                            {(task as any).agent ??
                              (task as any).teamLeader ??
                              "Strike Agent"}
                          </span>
                        </div>
                      )}

                      <div className="mt-2 text-[9px] text-slate-600">
                        Created: {new Date(task.createdAt).toLocaleString()}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => cancelTask(task.id)}
                      className="inline-flex items-center gap-1.5 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-[9px] font-bold text-red-400 transition hover:bg-red-500/20"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      CANCEL
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="mt-3 text-[9px] leading-relaxed text-slate-500">
            Team plans are stored in MySQL as draft records. Saving a plan does
            not start, execute, or distribute work to Agents.
          </p>
        </div>
      </section>

      {/* Right sidebar */}

      <aside className="flex flex-col gap-4">
        {/* Registered agents */}

        <section className="rounded border border-[#303649] bg-[#0e1017] p-4">
          <div className="mb-3 flex items-center justify-between border-b border-[#252b3b] pb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <Users className="h-4 w-4 text-red-400" />
              REGISTERED AGENTS
            </div>

            <span className="text-[9px] text-slate-500">
              {selectedAgents.length}/{agents.length} SELECTED
            </span>
          </div>

          <div className="mb-3 rounded border border-cyan-500/20 bg-cyan-500/5 p-2 text-[9px] leading-relaxed text-cyan-300">
            Select multiple Agents to form a team. Choose the team leader in the
            workspace.
          </div>

          <div className="space-y-2">
            {agents.map((agent) => {
              const isRunning = agent.status === "running";
              const isError = agent.status === "error";
              const isSelected = selectedAgentIds.includes(agent.id);
              const isLeader = String(agent.id) === teamLeaderId;

              const dotClass = isRunning
                ? "is-running"
                : isError
                  ? "is-error"
                  : "is-idle";

              const unavailable =
                agent.status === "retired" || agent.status === "error";

              return (
                <div
                  key={agent.id}
                  className={`rounded border p-3 ${
                    isSelected
                      ? "border-cyan-500/40 bg-cyan-500/5"
                      : "border-[#252b3b] bg-[#090a0f]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`tko-dot ${dotClass}`} aria-hidden />

                      <span className="truncate text-[11px] font-bold text-white">
                        {agent.name}
                      </span>
                    </div>

                    <span
                      className={`rounded border px-2 py-1 text-[8px] ${
                        statusStyle[agent.status] ?? statusStyle.idle
                      }`}
                    >
                      {agent.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="mt-1 text-[9px] text-slate-500">
                    {agent.description || agent.model}
                  </div>

                  {isRunning && (
                    <div className="mt-2 rounded border border-emerald-500/20 bg-emerald-500/5 p-2">
                      <div className="flex items-center justify-between text-[8px]">
                        <span className="flex items-center gap-1 font-bold tracking-wider text-emerald-300">
                          <Radio className="h-2.5 w-2.5" />
                          AGENT RUNNING
                        </span>

                        <span className="text-emerald-400/70">
                          RUN #{agent.runs}
                        </span>
                      </div>

                      <div className="tko-workbar mt-1.5" />

                      <div className="mt-1.5 truncate text-[8px] text-slate-400">
                        &gt; {agent.description || agent.model}
                      </div>
                    </div>
                  )}

                  <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                    <MiniStat label="RUNS" value={agent.runs} />
                    <MiniStat label="PASS" value={agent.succeeded} />
                    <MiniStat label="FAIL" value={agent.failed} />
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleAgent(agent)}
                    disabled={unavailable}
                    className={`mt-2 w-full rounded border py-2 text-[9px] font-bold transition disabled:cursor-not-allowed disabled:opacity-30 ${
                      isSelected
                        ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
                        : "border-[#303649] text-slate-400 hover:border-cyan-500/40 hover:text-cyan-300"
                    }`}
                  >
                    {isSelected ? "REMOVE FROM TEAM" : "ADD TO TEAM"}
                  </button>

                  {isLeader && (
                    <div className="mt-2 text-center text-[8px] font-bold tracking-widest text-cyan-300">
                      TEAM LEADER
                    </div>
                  )}
                </div>
              );
            })}

            {!loading && agents.length === 0 && (
              <p className="py-5 text-center text-[10px] text-slate-600">
                No agents returned by production API.
              </p>
            )}
          </div>
        </section>

        {/* Connection status */}

        <section className="rounded border border-[#303649] bg-[#0e1017] p-4">
          <div className="mb-3 flex items-center gap-2 border-b border-[#252b3b] pb-2 text-xs font-bold text-white">
            <Wifi className="h-4 w-4 text-cyan-400" />
            CONNECTION STATUS
          </div>

          <StatusRow
            label="Saved Ports DB"
            value={targetMessage ? "ERROR" : loading ? "LOADING" : "CONNECTED"}
            good={!targetMessage && !loading}
          />

          <StatusRow
            label="Agent API"
            value={agentMessage ? "ERROR" : loading ? "LOADING" : "CONNECTED"}
            good={!agentMessage && !loading}
          />

          {/* Remote session */}

          <div className="mt-3 rounded border border-[#303649] bg-[#090a0f] p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Server className="h-3.5 w-3.5 text-cyan-400" />

                <span className="text-[10px] font-bold tracking-widest text-white">
                  REMOTE SESSION
                </span>
              </div>

              <span
                className={`rounded border px-2 py-1 text-[8px] font-bold ${
                  remoteSession
                    ? remoteConnected
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : remoteDisconnected
                        ? "border-red-500/30 bg-red-500/10 text-red-400"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-400"
                    : "border-slate-600 bg-slate-800 text-slate-400"
                }`}
              >
                {remoteSession?.status ?? "NO SESSION"}
              </span>
            </div>

            {remoteSession ? (
              <div className="space-y-2">
                <div>
                  <div className="text-[8px] text-slate-500">SESSION ID</div>

                  <div className="mt-1 break-all font-mono text-[9px] text-cyan-300">
                    {remoteSession.id}
                  </div>
                </div>

                {remoteSession.deviceName && (
                  <div>
                    <div className="text-[8px] text-slate-500">DEVICE NAME</div>

                    <div className="mt-1 break-words text-[9px] text-slate-300">
                      {remoteSession.deviceName}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[9px] leading-relaxed text-slate-500">
                No remote session has been created.
              </p>
            )}

            {remoteMessage && (
              <div className="mt-3 break-words rounded border border-[#303649] bg-[#0e1017] p-2 text-[9px] leading-relaxed text-amber-300">
                {remoteMessage}
              </div>
            )}

            {!remoteSession || remoteDisconnected ? (
              <button
                type="button"
                onClick={() => {
                  if (remoteDisconnected) {
                    setRemoteSession(null);
                    setRemoteMessage("");
                    return;
                  }

                  void handleCreateRemoteSession();
                }}
                disabled={
                  remoteLoading ||
                  !authorized ||
                  Boolean(remoteSession && !remoteDisconnected)
                }
                className="mt-3 w-full rounded border border-cyan-500/40 bg-cyan-500/10 px-3 py-2.5 text-[9px] font-bold tracking-widest text-cyan-300 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {remoteLoading
                  ? "PROCESSING..."
                  : remoteDisconnected
                    ? "CLEAR SESSION"
                    : "CREATE REMOTE SESSION"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleRefreshRemoteStatus()}
                disabled={remoteLoading}
                className="mt-3 w-full rounded border border-cyan-500/40 bg-cyan-500/10 px-3 py-2.5 text-[9px] font-bold tracking-widest text-cyan-300 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {remoteLoading ? "REFRESHING..." : "REFRESH SESSION STATUS"}
              </button>
            )}

            <p className="mt-3 text-[8px] leading-relaxed text-slate-600">
              Dashboard creates and monitors sessions. A registered Agent must
              authenticate and connect independently.
            </p>
          </div>
        </section>

        {/* Event log */}

        <section className="flex flex-1 flex-col rounded border border-[#303649] bg-[#0e1017] p-4">
          <div className="mb-3 flex items-center justify-between border-b border-[#252b3b] pb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-white">
              <Activity className="h-4 w-4 text-cyan-400" />
              EVENT LOG
            </div>

            <span className="text-[9px] text-emerald-400">SECURE NODE</span>
          </div>

          <div className="max-h-[250px] flex-1 space-y-3 overflow-y-auto pr-1">
            {events.map((event) => (
              <div
                key={event.id}
                className="border-b border-[#252b3b] pb-2 last:border-b-0"
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-mono text-[9px] text-slate-600">
                    {event.time}
                  </span>

                  <span
                    className={`text-[9px] font-bold ${eventColor[event.type]}`}
                  >
                    [{event.type}]
                  </span>
                </div>

                <div className="break-words text-[10px] leading-relaxed text-slate-400">
                  {event.message}
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setEvents([])}
            className="mt-3 w-full rounded border border-[#303649] py-1.5 text-[9px] text-slate-400 transition hover:border-cyan-500/40 hover:text-white"
          >
            CLEAR LOGS
          </button>
        </section>
      </aside>
    </div>
  );
}

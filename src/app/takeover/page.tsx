"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Cpu,
  Database,
  Play,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Square,
} from "lucide-react";

import { Navbar } from "@/components/hud/Navbar";
import { Sidebar } from "@/components/hud/Sidebar";
import { usePersistentState } from "@/lib/usePersistentState";

import {
  SESSION_POLL_INTERVAL,
  TELEMETRY_INTERVAL,
  taskLabels,
  initialEvents,
} from "./constants";

import { targetKey, formatTime } from "./utils";

import type {
  TakeoverAgent,
  EventItem,
  TeamTaskItem,
  TaskType,
  TeamMember,
} from "./types";

import { Metric } from "./components/Metric";
import { NotificationStack } from "./components/NotificationStack";
import { TakeoverWorkspace } from "./components/TakeoverWorkspace";

import { useNotifications } from "./hooks/useNotifications";
import { useTaskStorage } from "./hooks/useTaskStorage";
import { useTakeoverData } from "./hooks/useTakeoverData";

import type { SavedPortTarget } from "@/app/recon/actions";

export default function TakeoverPage() {
  const [events, setEvents] = useState<EventItem[]>(initialEvents);

  const { notifications, notify, dismissNotification } = useNotifications();

  const { tasks, tasksHydrated, taskStorageError, savingTask, addTask } =
    useTaskStorage(notify);

  const {
    targets,
    agents,
    targetMessage,
    agentMessage,
    loading,
    refreshing,
    refreshData,
  } = useTakeoverData();

  const [selectedTargetKey, setSelectedTargetKey] = usePersistentState(
    "takeover.selectedTargetKey",
    "",
  );

  // Team selection
  const [selectedAgentIds, setSelectedAgentIds] = usePersistentState<number[]>(
    "takeover.selectedAgentIds",
    [],
  );
  const [teamLeaderId, setTeamLeaderId] = usePersistentState(
    "takeover.teamLeaderId",
    "",
  );

  const [taskType, setTaskType] = usePersistentState<TaskType>(
    "takeover.taskType",
    "EXPOSURE_REVIEW",
  );

  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [portFilter, setPortFilter] = useState("");
  const [cveFilter, setCveFilter] = useState("all");

  const [authorized, setAuthorized] = useState(false);
  const [clock, setClock] = useState("--:--:--");
  const [live, setLive] = usePersistentState("takeover.live", true);

  const addEvent = useCallback(
    (message: string, type: EventItem["type"] = "INFO") => {
      setEvents((previous) =>
        [
          {
            id: Date.now() + Math.random(),
            time: formatTime(),
            type,
            message,
          },
          ...previous,
        ].slice(0, 60),
      );
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  // Multi-target selection
  const [selectedTargetKeys, setSelectedTargetKeys] = useState<string[]>([]);

  function clearTargetSelection() {
    setSelectedTargetKeys([]);
    setSelectedTargetKey("");
  }

  const selectedTargets = useMemo(
    () =>
      targets.filter((target) =>
        selectedTargetKeys.includes(targetKey(target)),
      ),
    [targets, selectedTargetKeys],
  );

  const selectedTarget =
    selectedTargets[0] ??
    targets.find((target) => targetKey(target) === selectedTargetKey) ??
    null;

  const filteredTargets = useMemo(() => {
    return targets.filter((target) => {
      const query = search.trim().toLowerCase();

      const matchesSearch =
        !query ||
        target.ip.toLowerCase().includes(query) ||
        (target.hostname ?? "").toLowerCase().includes(query) ||
        (target.service ?? "").toLowerCase().includes(query);

      const matchesService =
        !serviceFilter ||
        (target.service ?? "").toLowerCase() === serviceFilter.toLowerCase();

      const matchesPort = !portFilter || String(target.port) === portFilter;

      const matchesCve =
        cveFilter === "all" ||
        (cveFilter === "with" && target.cves > 0) ||
        (cveFilter === "without" && target.cves === 0);

      return matchesSearch && matchesService && matchesPort && matchesCve;
    });
  }, [targets, search, serviceFilter, portFilter, cveFilter]);

  const allFilteredSelected =
    filteredTargets.length > 0 &&
    filteredTargets.every((target) =>
      selectedTargetKeys.includes(targetKey(target)),
    );

  function toggleTargetSelection(target: SavedPortTarget) {
    const key = targetKey(target);
    const isSelected = selectedTargetKeys.includes(key);

    if (isSelected) {
      const nextKeys = selectedTargetKeys.filter((item) => item !== key);

      setSelectedTargetKeys(nextKeys);

      if (selectedTargetKey === key) {
        setSelectedTargetKey(nextKeys[0] ?? "");
      }

      return;
    }

    setSelectedTargetKeys((current) => [...current, key]);
    setSelectedTargetKey(key);
  }

  function toggleSelectAllFiltered() {
    const filteredKeys = filteredTargets.map(targetKey);

    setSelectedTargetKeys((current) => {
      if (allFilteredSelected) {
        return current.filter((key) => !filteredKeys.includes(key));
      }

      return Array.from(new Set([...current, ...filteredKeys]));
    });
  }

  const availableAgents = useMemo(
    () =>
      agents.filter(
        (agent) => agent.status !== "retired" && agent.status !== "error",
      ),
    [agents],
  );

  const selectedAgents = useMemo(
    () => agents.filter((agent) => selectedAgentIds.includes(agent.id)),
    [agents, selectedAgentIds],
  );

  const selectedLeader = useMemo(
    () =>
      selectedAgents.find((agent) => String(agent.id) === teamLeaderId) ?? null,
    [selectedAgents, teamLeaderId],
  );

  const services = useMemo(
    () =>
      Array.from(
        new Set(
          targets
            .map((target) => target.service)
            .filter((service): service is string => Boolean(service)),
        ),
      ).sort(),
    [targets],
  );

  const totalCves = targets.reduce((total, target) => total + target.cves, 0);

  const activeAgents = agents.filter(
    (agent) => agent.status === "running",
  ).length;

  // Keep the selected team valid when the Agent list is refreshed.
  useEffect(() => {
    const validIds = new Set(availableAgents.map((agent) => agent.id));

    setSelectedAgentIds((current) => current.filter((id) => validIds.has(id)));
  }, [availableAgents]);

  useEffect(() => {
    if (teamLeaderId && !selectedAgentIds.includes(Number(teamLeaderId))) {
      setTeamLeaderId("");
    }
  }, [selectedAgentIds, teamLeaderId]);

  // ---------------------------------------------------------------------------
  // Team selection
  // ---------------------------------------------------------------------------

  function toggleAgent(agent: TakeoverAgent) {
    if (agent.status === "retired" || agent.status === "error") {
      notify(
        "AGENT UNAVAILABLE",
        `${agent.name} ไม่สามารถเข้าร่วมทีมได้`,
        "warning",
      );
      return;
    }

    setSelectedAgentIds((current) => {
      const exists = current.includes(agent.id);

      if (exists) {
        const next = current.filter((id) => id !== agent.id);

        if (String(agent.id) === teamLeaderId) {
          setTeamLeaderId("");
        }

        addEvent(`Removed ${agent.name} from the planned team.`, "INFO");
        return next;
      }

      addEvent(`Added ${agent.name} to the planned team.`, "SUCCESS");

      // First selected Agent becomes the initial team leader.
      if (current.length === 0) {
        setTeamLeaderId(String(agent.id));
      }

      return [...current, agent.id];
    });
  }

  function handleLeaderChange(value: string) {
    if (value && !selectedAgentIds.includes(Number(value))) {
      return;
    }

    setTeamLeaderId(value);

    const leader = agents.find((agent) => String(agent.id) === value);

    if (leader) {
      addEvent(`${leader.name} assigned as team leader.`, "SUCCESS");
    }
  }

  function clearTeamSelection() {
    setSelectedAgentIds([]);
    setTeamLeaderId("");
    addEvent("Cleared team selection.", "WARNING");
  }

  // ---------------------------------------------------------------------------
  // Task management
  // ---------------------------------------------------------------------------

  async function prepareTask(): Promise<void> {
    if (!tasksHydrated) {
      notify("TASK STORAGE", "กำลังโหลดรายการภารกิจ กรุณารอสักครู่", "warning");
      return;
    }

    if (taskStorageError) {
      notify(
        "TASK STORAGE ERROR",
        "ไม่สามารถยืนยันการบันทึกภารกิจได้",
        "error",
      );
      return;
    }

    if (!selectedTarget) {
      notify("TASK PLAN", "กรุณาเลือก Target ก่อน", "warning");
      addEvent("Select a saved target first.", "WARNING");
      return;
    }

    if (selectedAgents.length < 2) {
      notify(
        "TEAM SELECTION",
        "กรุณาเลือก Agent อย่างน้อย 2 ตัวเพื่อสร้างทีม",
        "warning",
      );
      addEvent("A team requires at least two selected agents.", "WARNING");
      return;
    }

    if (!selectedLeader) {
      notify(
        "TEAM LEADER",
        "กรุณากำหนดหัวหน้าทีมจาก Agent ที่เลือก",
        "warning",
      );
      return;
    }

    if (!authorized) {
      notify("TASK PLAN", "ยืนยันสิทธิ์การใช้งานก่อน", "warning");
      addEvent(
        "Authorization confirmation is required before preparing a task.",
        "WARNING",
      );
      return;
    }

    const unavailableMember = selectedAgents.find(
      (agent) => agent.status === "retired" || agent.status === "error",
    );

    if (unavailableMember) {
      notify(
        "AGENT UNAVAILABLE",
        `${unavailableMember.name} ไม่พร้อมใช้งาน`,
        "error",
      );
      return;
    }

    const teamMembers: TeamMember[] = selectedAgents.map((agent) => ({
      agentId: agent.id,
      agentName: agent.name,
      role: agent.id === selectedLeader.id ? "TEAM_LEADER" : "REVIEWER",
    }));

    const task: TeamTaskItem = {
      id: Date.now(),
      teamLeaderId: selectedLeader.id,
      teamLeader: selectedLeader.name,
      teamMembers,
      target: selectedTarget.ip,
      port: selectedTarget.port,
      type: taskType,
      createdAt: new Date().toISOString(),
    };

    const savedTask = await addTask(task);

    if (!savedTask) {
      return;
    }

    notify(
      "TEAM PLAN SAVED",
      `บันทึก Draft Plan #${savedTask.id} ลง MySQL สำเร็จ (ยังไม่ได้สร้าง Run)`,
      "success",
    );

    addEvent(
      `Draft plan #${savedTask.id} saved: ${taskLabels[taskType]} → Leader: ${selectedLeader.name} → ${teamMembers.length} Agents → ${selectedTarget.ip}:${selectedTarget.port}`,
      "SUCCESS",
    );
  }

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const refreshWorkspaceData = useCallback(async () => {
    if (refreshing) return;

    try {
      await refreshData();

      addEvent(
        `Refreshed workspace data: ${targets.length} saved targets and ${agents.length} agents.`,
        "SUCCESS",
      );
    } catch {
      notify("REFRESH FAILED", "โหลดข้อมูลจากระบบไม่สำเร็จ", "error");

      addEvent("Failed to refresh workspace data.", "ERROR");
    }
  }, [
    refreshing,
    refreshData,
    addEvent,
    notify,
    targets.length,
    agents.length,
  ]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(formatTime());
    }, SESSION_POLL_INTERVAL);

    return () => window.clearInterval(timer);
  }, []);

  // ---------------------------------------------------------------------------
  // Live telemetry
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!live) return;

    let busy = false;

    const id = window.setInterval(() => {
      if (busy) return;

      busy = true;

      refreshData()
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
    }, TELEMETRY_INTERVAL);

    return () => window.clearInterval(id);
  }, [live, refreshData]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="shell" style={{ background: "#090a0f" }}>
      <Sidebar online={!agentMessage} />

      <NotificationStack
        notifications={notifications}
        onDismiss={dismissNotification}
      />


      <div
        id="takeover-page"
        className="takeover-page main flex min-w-0 flex-col bg-[#090a0f] text-slate-100"
      >
        <Navbar online={!agentMessage} title="TAKEOVER" link="API" />

        <main className="flex-1 space-y-4 p-4 md:p-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-red-400" />

                <h1 className="text-lg font-bold tracking-widest text-white">
                  AGENT CONTROL CENTER
                </h1>
              </div>

              <p className="mt-1 text-[10px] tracking-wider text-slate-500">
                SAVED TARGETS / MULTI-AGENT TEAM / SECURE LAB ENVIRONMENT
              </p>
            </div>

            <div className="tko-runlight flex items-center gap-3 rounded border border-[#252b3b] bg-[#0e1017] px-3 py-2">
              <span
                className={`tko-dot ${live ? "is-running" : "is-error"}`}
                aria-hidden
              />

              <div>
                <div
                  className={`text-[10px] font-bold ${
                    live ? "text-emerald-400" : "text-amber-400"
                  }`}
                >
                  {live ? "WORKSPACE ONLINE" : "LIVE PAUSED"}
                </div>

                <div className="text-[9px] text-slate-500">{clock}</div>
              </div>

              <button
                type="button"
                onClick={() => setLive((value) => !value)}
                className={`ml-1 inline-flex items-center gap-1 px-2 py-1.5 text-[9px] font-bold tracking-wider ${
                  live ? "tko-stop" : "tko-live"
                }`}
                aria-label={
                  live ? "Stop live telemetry" : "Resume live telemetry"
                }
              >
                {live ? (
                  <>
                    <Square className="h-3 w-3" fill="currentColor" />
                    STOP
                  </>
                ) : (
                  <>
                    <Play className="h-3 w-3" fill="currentColor" />
                    LIVE
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => void refreshWorkspaceData()}
                disabled={refreshing}
                className="rounded border border-[#303649] p-2 text-slate-400 hover:text-white disabled:opacity-50"
                aria-label="Refresh data"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                />
              </button>
            </div>
          </header>

          {/* Metrics */}

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric
              label="SAVED PORT RECORDS"
              value={targets.length}
              icon={<Database className="h-4 w-4 text-cyan-400" />}
            />

            <Metric
              label="UNIQUE IP ADDRESSES"
              value={new Set(targets.map((target) => target.ip)).size}
              icon={<Server className="h-4 w-4 text-blue-400" />}
            />

            <Metric
              label="RECORDED CVE COUNTS"
              value={totalCves}
              icon={<AlertTriangle className="h-4 w-4 text-amber-400" />}
            />

            <Metric
              label="RUNNING AGENTS"
              value={`${activeAgents}/${agents.length}`}
              icon={<Cpu className="h-4 w-4 text-emerald-400" />}
            />
          </section>

          {/* Saved target database */}

          <section className="rounded border border-[#303649] bg-[#0e1017] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-red-400" />

                <h2 className="text-xs font-bold tracking-widest text-white">
                  SAVED TARGET DATABASE
                </h2>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded border border-cyan-500/20 bg-cyan-500/5 p-3">
                  <div className="flex items-center gap-3">
                    <Database className="h-4 w-4 text-cyan-400" />

                    <div>
                      <div className="text-[10px] font-bold tracking-wider text-white">
                        MULTI-TARGET SELECTION
                      </div>

                      <div className="mt-1 text-[10px] text-slate-400">
                        SELECTED:{" "}
                        <span className="font-bold text-cyan-300">
                          {selectedTargets.length}
                        </span>{" "}
                        / {targets.length} SAVED RECORDS
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={toggleSelectAllFiltered}
                      disabled={filteredTargets.length === 0}
                      className="rounded border border-cyan-500/40 px-3 py-2 text-[9px] font-bold tracking-wider text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-40"
                    >
                      {allFilteredSelected ? "UNSELECT FILTERED" : "SELECT ALL"}
                    </button>

                    <button
                      type="button"
                      onClick={clearTargetSelection}
                      disabled={selectedTargetKeys.length === 0}
                      className="rounded border border-[#303649] px-3 py-2 text-[9px] font-bold tracking-wider text-slate-400 hover:text-white disabled:opacity-40"
                    >
                      CLEAR SELECTION
                    </button>
                  </div>
                </div>

                <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[9px] text-cyan-400">
                  MYSQL / saved_ports
                </span>
              </div>

              <span className="text-[9px] text-slate-500">
                {filteredTargets.length} MATCHING RECORDS
              </span>
            </div>

            <div className="grid gap-2 md:grid-cols-4">
              <div className="relative md:col-span-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />

                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search IP / hostname / service..."
                  style={{ paddingLeft: "2.25rem" }}
                  className="w-full rounded border border-[#303649] bg-[#090a0f] py-2 pl-9 pr-3 text-[11px] text-white outline-none focus:border-cyan-500"
                />
              </div>

              <select
                value={serviceFilter}
                onChange={(event) => setServiceFilter(event.target.value)}
                className="rounded border border-[#303649] bg-[#090a0f] px-3 py-2 text-[11px] text-white outline-none"
              >
                <option value="">All services</option>

                {services.map((service) => (
                  <option key={service} value={service}>
                    {service}
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-2 gap-2">
                <input
                  value={portFilter}
                  onChange={(event) =>
                    setPortFilter(event.target.value.replace(/\D/g, ""))
                  }
                  placeholder="Port"
                  inputMode="numeric"
                  className="min-w-0 rounded border border-[#303649] bg-[#090a0f] px-3 py-2 text-[11px] text-white outline-none focus:border-cyan-500"
                />

                <select
                  value={cveFilter}
                  onChange={(event) => setCveFilter(event.target.value)}
                  className="min-w-0 rounded border border-[#303649] bg-[#090a0f] px-2 py-2 text-[10px] text-white outline-none"
                >
                  <option value="all">All CVE</option>
                  <option value="with">With CVE</option>
                  <option value="without">No CVE</option>
                </select>
              </div>
            </div>

            {targetMessage && (
              <div className="mt-3 flex items-center gap-2 rounded border border-amber-500/30 bg-amber-500/5 p-3 text-[10px] text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {targetMessage}
              </div>
            )}

            <div className="mt-3 max-h-72 overflow-auto rounded border border-[#252b3b]">
              <table className="w-full min-w-[620px] text-left text-[10px]">
                <thead className="sticky top-0 bg-[#171b27] text-[9px] tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2">IP ADDRESS</th>
                    <th className="px-3 py-2">PORT</th>
                    <th className="px-3 py-2">SERVICE</th>
                    <th className="px-3 py-2">CVE COUNT</th>
                    <th className="px-3 py-2">HOSTNAME</th>
                    <th className="px-3 py-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          onChange={toggleSelectAllFiltered}
                          disabled={filteredTargets.length === 0}
                          aria-label="Select all filtered targets"
                          className="accent-cyan-400"
                        />
                        <span>SELECT</span>
                      </label>
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredTargets.map((target, index) => {
                    const selected =
                      selectedTarget !== null &&
                      targetKey(selectedTarget) === targetKey(target);

                    return (
                      <tr
                        key={`${target.ip}:${target.port}:${index}`}
                        className={`border-t border-[#252b3b] ${
                          selected ? "bg-cyan-500/5" : "hover:bg-white/5"
                        }`}
                      >
                        <td className="px-3 py-2 font-mono text-cyan-300">
                          {target.ip}
                        </td>

                        <td className="px-3 py-2 font-mono text-white">
                          {target.port}
                        </td>

                        <td className="px-3 py-2 text-slate-300">
                          {target.service ?? "unknown"}
                        </td>

                        <td className="px-3 py-2">
                          <span
                            className={
                              target.cves > 0
                                ? "text-amber-400"
                                : "text-slate-500"
                            }
                          >
                            {target.cves}
                          </span>
                        </td>

                        <td className="max-w-[180px] truncate px-3 py-2 text-slate-500">
                          {target.hostname ?? "—"}
                        </td>

                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selectedTargetKeys.includes(
                              targetKey(target),
                            )}
                            onChange={() => toggleTargetSelection(target)}
                            aria-label={`Select ${target.ip}:${target.port}`}
                            className="h-4 w-4 cursor-pointer accent-cyan-400"
                          />
                        </td>
                      </tr>
                    );
                  })}

                  {!loading && filteredTargets.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-10 text-center text-slate-500"
                      >
                        No saved port records found.
                      </td>
                    </tr>
                  )}

                  {loading && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-10 text-center text-cyan-400"
                      >
                        Loading saved targets...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Main workspace */}

          <TakeoverWorkspace
            agents={agents}
            selectedAgents={selectedAgents}
            selectedAgentIds={selectedAgentIds}
            selectedLeader={selectedLeader}
            savingTask={savingTask}
            teamLeaderId={teamLeaderId}
            agentMessage={agentMessage}
            handleLeaderChange={handleLeaderChange}
            clearTeamSelection={clearTeamSelection}
            toggleAgent={toggleAgent}
            taskType={taskType}
            setTaskType={setTaskType}
            selectedTarget={selectedTarget}
            authorized={authorized}
            setAuthorized={setAuthorized}
            tasks={tasks}
            tasksHydrated={tasksHydrated}
            taskStorageError={taskStorageError}
            prepareTask={prepareTask}
            loading={loading}
            targetMessage={targetMessage}
            events={events}
            setEvents={setEvents}
          />
        </main>
      </div>
    </div>
  );
}

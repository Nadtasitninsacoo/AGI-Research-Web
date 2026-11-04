// Team task queue panel — builds a metadata-only queue from a plan's targets
// and saves it to the local DB. No network operation is performed.
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ClipboardList,
  Play,
  RefreshCw,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";

import {
  fetchTeamTaskPlans,
  type TeamTaskPlan,
  type TeamTaskTarget,
} from "@/lib/team-task-plans/api";

import {
  assessQueue,
  createQueue,
  type QueueAssessment,
} from "@/lib/queue/api";

import {
  getQueueItemsForUi,
  validateQueueItem,
  type QueueItemUi,
} from "@/app/agent-task-queue/actions";

import { fetchRunQueueTargets } from "@/lib/execution/api";

import type { SavedPortTarget } from "@/app/recon/actions";

import { s } from "./classNames";

type Props = {
  experimentId: string;
  disabled?: boolean;
};

type QueueDisplayTarget = {
  saved: SavedPortTarget;
  planTarget: TeamTaskTarget | null;
};

export function TeamQueuePanel({ experimentId, disabled = false }: Props) {
  const [plans, setPlans] = useState<TeamTaskPlan[]>([]);
  const [savedTargets, setSavedTargets] = useState<SavedPortTarget[]>([]);

  const [planId, setPlanId] = useState("");
  const [selectedTargetIds, setSelectedTargetIds] = useState<number[]>([]);
  const [queueId, setQueueId] = useState<number | null>(null);
  const [assessment, setAssessment] = useState<QueueAssessment | null>(null);
  const [queueAuthorized, setQueueAuthorized] = useState(false);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Auto mode: automatically save the queue (if needed) then run the assessment
  // on a loop, so it keeps firing without manual clicks. Still gated on target
  // authorization + metadata-only (no network).
  const [autoMode, setAutoMode] = useState(false);

  // Live assessment progress (ATTACK button). Stays on the panel; no navigation.
  const [running, setRunning] = useState(false);
  const cancelRef = useRef(false);
  const autoFirstRef = useRef(true); // first AUTO cycle is a full (visible) run
  const autoBusyRef = useRef(false); // prevents overlapping AUTO cycles
  const [progItems, setProgItems] = useState<
    (QueueItemUi & { reason?: string })[]
  >([]);
  const [progDone, setProgDone] = useState(0);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadData() {
      setLoading(true);
      setError("");

      try {
        const [planResult, targetResult] = await Promise.all([
          fetchTeamTaskPlans(controller.signal),
          fetchRunQueueTargets({}, 1000),
        ]);

        if (controller.signal.aborted) return;

        setPlans(planResult);
        setSavedTargets(targetResult.targets);

        const firstUsablePlan =
          planResult.find((plan) => plan.status !== "cancelled") ??
          planResult[0];

        setPlanId(firstUsablePlan ? String(firstUsablePlan.id) : "");
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;

        setError(
          err instanceof Error
            ? err.message
            : "ไม่สามารถโหลดแผนงานและเป้าหมายได้",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadData();

    return () => controller.abort();
  }, []);

  const selectedPlan = useMemo(
    () => plans.find((plan) => String(plan.id) === planId),
    [plans, planId],
  );

  // AUTO mode loop: while enabled, save the queue if needed then run the
  // assessment, repeating on an interval. Guards prevent overlap; still requires
  // target authorization and performs no network operation.
  useEffect(() => {
    if (!autoMode) {
      autoFirstRef.current = true;
      return;
    }

    let cancelled = false;

    async function tick() {
      if (cancelled || autoBusyRef.current || submitting || disabled) return;
      if (!selectedPlan) return;
      autoBusyRef.current = true;
      try {
        if (queueId === null) {
          await handleCreateQueue();
          return;
        }
        if (queueAuthorized) {
          // First cycle: full visible run. Later cycles: silent in-place refresh
          // (no progress reset / flash) so the card stays smooth.
          await handleRunAssessment(!autoFirstRef.current);
          autoFirstRef.current = false;
        }
      } finally {
        autoBusyRef.current = false;
      }
    }

    void tick();
    const timer = setInterval(() => void tick(), 12000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // handlers are hoisted; `running` is intentionally NOT a dep (the busy ref
    // guards overlap) so the interval is not torn down every cycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMode, queueId, queueAuthorized, selectedPlan, submitting, disabled]);

  // Map each saved target to its matching plan target (if any).
  const displayTargets = useMemo<QueueDisplayTarget[]>(() => {
    if (!selectedPlan) return [];

    return savedTargets.map((saved) => {
      const planTarget =
        selectedPlan.targets.find(
          (target) =>
            target.targetType === "port" &&
            target.ip === saved.ip &&
            Number(target.port) === Number(saved.port),
        ) ?? null;

      return {
        saved,
        planTarget,
      };
    });
  }, [savedTargets, selectedPlan]);

  useEffect(() => {
    const matchedIds = [
      ...new Set(
        displayTargets
          .map((item) => item.planTarget?.id)
          .filter((id): id is number => id !== undefined),
      ),
    ];

    setSelectedTargetIds(matchedIds);
  }, [displayTargets]);

  function changePlan(nextId: string) {
    setPlanId(nextId);
    setSelectedTargetIds([]);
    setQueueId(null);
    setAssessment(null);
    setQueueAuthorized(false);
    setError("");
    setMessage("");
  }

  function toggleTarget(id: number, checked: boolean) {
    setSelectedTargetIds((current) => {
      if (checked) {
        return current.includes(id) ? current : [...current, id];
      }
      return current.filter((targetId) => targetId !== id);
    });
  }

  async function handleCreateQueue() {
    if (disabled || submitting) return;

    setError("");
    setMessage("");
    setAssessment(null);
    setQueueId(null);
    setQueueAuthorized(false);

    if (!selectedPlan) {
      setError("กรุณาเลือกแผนงาน");
      return;
    }

    const validSelectedIds =
      selectedTargetIds.length > 0
        ? selectedTargetIds
        : displayTargets
            .map((item) => item.planTarget?.id)
            .filter((id): id is number => id !== undefined);

    if (validSelectedIds.length === 0) {
      setError("ไม่มีเป้าหมายให้บันทึกลงคิว");
      return;
    }

    const queuedTargets = displayTargets.filter((item) =>
      validSelectedIds.includes(item.planTarget?.id ?? -1),
    );

    if (queuedTargets.length !== validSelectedIds.length) {
      setError("ไม่สามารถจับคู่เป้าหมายกับแผนงานได้ครบ");
      return;
    }

    const allAuthorized =
      queuedTargets.length > 0 &&
      queuedTargets.every((item) => item.saved.authorized);

    setSubmitting(true);

    try {
      const result = await createQueue({
        planId: selectedPlan.id,
        targetIds: validSelectedIds,
        ...(experimentId ? { experimentId: Number(experimentId) } : {}),
      });

      setQueueId(result.id);
      setQueueAuthorized(allAuthorized);

      console.log(
  "QUEUE BUTTON DEBUG:",
  JSON.stringify(
    {
      queueId: result.id,
      allAuthorized,
      targets: queuedTargets.map((item) => ({
        ip: item.saved.ip,
        port: item.saved.port,
        authorized: item.saved.authorized,
        planTargetId: item.planTarget?.id,
      })),
    },
    null,
    2,
  ),
);

      console.log("QUEUE BUTTON DEBUG", {
        queueId: result.id,
        allAuthorized,
        targets: queuedTargets.map((item) => ({
          ip: item.saved.ip,
          port: item.saved.port,
          authorized: item.saved.authorized,
          planTargetId: item.planTarget?.id,
        })),
      });

      setMessage(
        `บันทึกคิว #${result.id} แล้ว — ${result.totalItems} เป้าหมาย (metadata only, ไม่มีการเชื่อมต่อเครือข่าย)`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกคิวไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAssessQueue() {
    if (queueId === null || submitting || disabled) return;

    setError("");
    setMessage("");
    setAssessment(null);
    setSubmitting(true);

    try {
      const result = await assessQueue(queueId);
      setAssessment(result);
      setMessage(`ตรวจสอบสถานะคิว #${queueId} จากฐานข้อมูลแล้ว`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "ไม่สามารถตรวจสอบสถานะคิวได้",
      );
    } finally {
      setSubmitting(false);
    }
  }

  // ATTACK = run a live per-item metadata assessment (real work, no network).
  // Processes items one by one so the UI shows real progress + activity; the
  // panel stays put and a completion status is shown. Single-press (guarded).
  function cancelAssessment() {
    cancelRef.current = true;
    setAutoMode(false);
  }

  // silent = AUTO re-cycle: refresh item statuses in place, no reset/flash.
  async function handleRunAssessment(silent = false) {
    if (queueId === null || running || submitting || disabled) return;
    if (!queueAuthorized) return;

    cancelRef.current = false;
    if (!silent) {
      setError("");
      setMessage("");
      setAssessment(null);
      setRunning(true);
      setProgDone(0);
    }

    try {
      const items = await getQueueItemsForUi(queueId);
      // On a fresh run show PENDING→done progress; on a silent AUTO refresh keep
      // the existing rows and just update them in place (no 0% flash).
      if (!silent) {
        setProgItems(items.map((it) => ({ ...it, status: "PENDING" })));
      } else {
        setProgItems((cur) =>
          items.map(
            (it) =>
              cur.find((x) => x.id === it.id) ?? { ...it, status: "PENDING" },
          ),
        );
      }

      let done = 0;
      let cancelled = false;
      for (const it of items) {
        if (cancelRef.current) {
          cancelled = true;
          break;
        }
        try {
          const res = await validateQueueItem(it.id);
          setProgItems((cur) =>
            cur.map((x) =>
              x.id === it.id
                ? { ...x, status: res.status, reason: res.reason }
                : x,
            ),
          );
        } catch {
          setProgItems((cur) =>
            cur.map((x) =>
              x.id === it.id
                ? { ...x, status: "FAILED", reason: "assessment error" }
                : x,
            ),
          );
        }
        done += 1;
        if (!silent) setProgDone(done);
      }
      if (silent) setProgDone(items.length);

      if (cancelled) {
        setMessage(`ยกเลิกการประเมินคิว #${queueId} แล้ว (${done}/${items.length})`);
        return;
      }

      const result = await assessQueue(queueId);
      setAssessment(result);
      setMessage(
        `ประเมินคิว #${queueId}${silent ? " (ออโต้)" : ""} — ${result.successfulCount ?? 0} สำเร็จ / ${
          result.failedCount ?? 0
        } ล้มเหลว จาก ${result.totalItems ?? items.length} รายการ`,
      );
    } catch (err) {
      if (!silent) {
        setError(
          err instanceof Error ? err.message : "ไม่สามารถประเมินคิวได้",
        );
      }
    } finally {
      cancelRef.current = false;
      if (!silent) setRunning(false);
    }
  }

  if (loading) {
    return (
      <section className={`${s.panel} ${s.areaQueue}`}>
        <div className={s.loading}>
          <RefreshCw className={s.spin} size={14} />
          กำลังโหลดแผนงานและเป้าหมาย...
        </div>
      </section>
    );
  }

  return (
    <section className={`${s.panel} ${s.areaQueue}`}>
      <header className={s.head}>
        <h2 className={s.title}>
          <span className={s.iconChip}>
            <ClipboardList size={13} />
          </span>
          <span>
            <span className={s.titleNum}>03</span> {"//"} TEAM TASK QUEUE
          </span>
        </h2>
        <span className={s.badge}>METADATA ONLY</span>
      </header>

      <div className={s.form}>
        <div className={s.field}>
          <label htmlFor="team-plan" className={s.label}>
            <ClipboardList size={12} />
            TEAM TASK PLAN
          </label>

          <div className={s.selectWrap}>
            <select
              id="team-plan"
              value={planId}
              onChange={(event) => changePlan(event.target.value)}
              disabled={submitting || disabled}
              className={s.select}
            >
              <option value="">เลือกแผนงาน</option>

              {plans.map((plan) => (
                <option key={plan.id} value={String(plan.id)}>
                  #{plan.id} — {plan.name} ({plan.status})
                </option>
              ))}
            </select>

            <ChevronDown className={s.chev} />
          </div>
        </div>

        {selectedPlan ? (
          <>
            <div className={s.box}>
              <div className={s.subHead}>
                <span className={s.label}>
                  <Users size={12} />
                  ASSIGNED AGENTS
                </span>
                <span className={s.count}>{selectedPlan.agents.length}</span>
              </div>

              <div className={s.chips}>
                {selectedPlan.agents.map((agent) => (
                  <span key={agent.id} className={s.chip}>
                    {agent.name}
                    {agent.role ? <em>/ {agent.role}</em> : null}
                  </span>
                ))}
              </div>
            </div>

            <div className={s.field}>
              <div className={s.subHead}>
                <span className={s.label}>PORT TARGETS</span>
                <span className={s.count}>
                  {selectedTargetIds.length} เลือก / {displayTargets.length}{" "}
                  รายการ
                </span>
              </div>

              {savedTargets.length === 0 ? (
                <p className={`${s.alert} ${s.alertWarn}`}>
                  <AlertTriangle size={14} />
                  ไม่พบเป้าหมาย IP/Port ที่บันทึกไว้
                </p>
              ) : displayTargets.length === 0 ? (
                <p className={`${s.alert} ${s.alertWarn}`}>
                  <AlertTriangle size={14} />
                  ยังไม่มีเป้าหมายในรายการ
                </p>
              ) : (
                <div className={s.targets}>
                  {displayTargets.map(({ saved, planTarget }, index) => {
                    const targetId = planTarget?.id ?? index + 1;
                    const selected = selectedTargetIds.includes(targetId);

                    return (
                      <label
                        key={`${saved.ip}:${saved.port}:${index}`}
                        className={s.target}
                      >
                        <input
                          type="checkbox"
                          checked={
                            planTarget !== null &&
                            selectedTargetIds.includes(planTarget.id)
                          }
                          onChange={(event) => {
                            if (planTarget) {
                              toggleTarget(planTarget.id, event.target.checked);
                            }
                          }}
                          disabled={
                            submitting || disabled || planTarget === null
                          }
                        />

                        <span className={s.targetMain}>
                          <span className={s.targetName}>
                            {saved.ip}:{saved.port}
                            {saved.service ? ` / ${saved.service}` : ""}
                            {/* แสดง ID จริงแบบไม่ติดขัด */}
                            {(saved as any).id !== undefined
                              ? ` [ID: ${(saved as any).id}]`
                              : ""}
                          </span>

                          <span className={s.targetSub}>
                            {saved.hostname || saved.country || "—"}
                          </span>
                        </span>

                        <span
                          className={`${s.tag} ${
                            saved.authorized ? s.tagOk : s.tagWarn
                          }`}
                        >
                          {saved.authorized ? "AUTHORIZED" : "UNAUTHORIZED"}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              <p className={s.note}>
                บันทึกคิวลงฐานข้อมูลเท่านั้น (metadata only) —
                ไม่มีการดำเนินการผ่านเครือข่ายใดๆ
              </p>
            </div>
          </>
        ) : (
          <div className={s.empty}>
            <ClipboardList size={20} />
            {plans.length === 0
              ? "ยังไม่มีแผนงานในระบบ"
              : "เลือกแผนงานเพื่อโหลดเป้าหมาย"}
          </div>
        )}

        {error && (
          <p role="alert" className={`${s.alert} ${s.alertError}`}>
            <AlertTriangle size={14} />
            {error}
          </p>
        )}

        {message && (
          <p role="status" className={`${s.alert} ${s.alertOk}`}>
            <ShieldCheck size={14} />
            {message}
          </p>
        )}

        {assessment && (
          <div className={s.box}>
            <div className={s.subHead}>
              <span className={s.label}>QUEUE #{queueId} — สถานะ</span>
            </div>

            <div className={s.metrics}>
              <div className={s.metric}>
                <small>STATUS</small>
                <b>{assessment.status}</b>
              </div>

              <div className={s.metric}>
                <small>TOTAL TARGETS</small>
                <b>{assessment.totalItems ?? "—"}</b>
              </div>

              <div className={s.metric}>
                <small>สำเร็จ</small>
                <b className={s.ok}>{assessment.successfulCount ?? "—"}</b>
              </div>

              <div className={s.metric}>
                <small>ล้มเหลว</small>
                <b className={s.warn}>{assessment.failedCount ?? "—"}</b>
              </div>
            </div>

            <p className={s.note}>
              ตัวเลขจากฐานข้อมูลจริง — ไม่มีการดำเนินการผ่านเครือข่าย
            </p>
          </div>
        )}

        {/* Live assessment progress — real per-item status, cinematic activity. */}
        {(running || progItems.length > 0) && (
          <div className={s.box}>
            <div className={s.subHead}>
              <span className={s.label}>
                {running
                  ? "กำลังประเมิน..."
                  : autoMode
                    ? "ออโต้ · เฝ้าติดตาม"
                    : "ผลการประเมิน"}
              </span>
              <span className={s.count}>
                {progDone} / {progItems.length}
              </span>
            </div>

            {/* progress bar */}
            <div className="tq-progress" aria-hidden>
              <i
                style={{
                  width: `${
                    progItems.length
                      ? Math.round((progDone / progItems.length) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>

            {/* cinematic running lights — steady while working or AUTO is on */}
            {(running || autoMode) && (
              <div className="tq-lights" aria-hidden>
                {Array.from({ length: 14 }).map((_, i) => (
                  <i key={i} style={{ animationDelay: `${i * 0.08}s` }} />
                ))}
              </div>
            )}

            <ul className="tq-prog-list">
              {progItems.map((it) => {
                const st = it.status.toUpperCase();
                const tone =
                  st === "SUCCEEDED"
                    ? "ok"
                    : st === "FAILED"
                      ? "bad"
                      : "pending";
                return (
                  <li key={it.id} className={`tq-prog-item tq-${tone}`}>
                    <i className="tq-dot" />
                    <span className="tq-prog-name">
                      {it.ip}
                      {it.port != null ? `:${it.port}` : ""}
                    </span>
                    <em>{it.reason ?? st.toLowerCase()}</em>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className={`${s.footer} ${s.btnRow}`}>
          {/* Save Queue */}
          <button
            type="button"
            onClick={() => void handleCreateQueue()}
            disabled={disabled || submitting || running || !selectedPlan}
            className={s.btn}
          >
            {submitting ? (
              <RefreshCw size={13} className={s.spin} />
            ) : (
              <Play size={13} />
            )}
            บันทึกคิว
          </button>

          {/* ATTACK = live metadata assessment (single-press, stays on panel) */}
          {queueId !== null && (
            <button
              type="button"
              onClick={() => void handleRunAssessment()}
              disabled={disabled || submitting || running || !queueAuthorized}
              className={`${s.btn} ${s.btnOk}`}
              title={
                queueAuthorized
                  ? "เริ่มการประเมินความปลอดภัยแบบจำลอง (metadata only)"
                  : "ไม่สามารถเริ่มได้: มีเป้าหมายที่ยังไม่ได้รับอนุญาต"
              }
            >
              {running ? (
                <RefreshCw size={13} className={s.spin} />
              ) : (
                <Play size={13} />
              )}
              {running ? "กำลังประเมิน..." : "ATTACK"}
            </button>
          )}

          {/* CANCEL — stop the running assessment / auto loop */}
          {(running || autoMode) && (
            <button
              type="button"
              onClick={cancelAssessment}
              className={`${s.btn} ${s.btnGhost} ${s.btnWarn}`}
              title="ยกเลิกการประเมิน / หยุดออโต้"
            >
              <XCircle size={13} />
              ยกเลิก
            </button>
          )}

          {/* Check Queue Status */}
          <button
            type="button"
            onClick={() => void handleAssessQueue()}
            disabled={disabled || submitting || running || queueId === null}
            className={`${s.btn} ${s.btnGhost} ${s.btnOk}`}
          >
            <ShieldCheck size={13} />
            ตรวจสอบสถานะ
          </button>

          {/* AUTO: loop save+assess automatically (metadata-only, authorized) */}
          <button
            type="button"
            onClick={() => setAutoMode((v) => !v)}
            disabled={disabled}
            className={`${s.btn} ${s.btnGhost} ${autoMode ? s.btnOk : ""}`}
            title="โหมดออโต้: บันทึกคิว + ประเมินอัตโนมัติวนลูป (metadata only, เฉพาะเป้าหมายที่อนุญาต)"
          >
            <RefreshCw size={13} className={autoMode ? s.spin : ""} />
            {autoMode ? "AUTO: ON" : "AUTO: OFF"}
          </button>
        </div>
      </div>
    </section>
  );
}

export default TeamQueuePanel;

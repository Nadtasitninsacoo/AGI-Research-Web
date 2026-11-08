"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { ShieldCheck, Plus, Trash2, CircleCheck } from "lucide-react";
import { s } from "./classNames";
import type { SavedPortTarget } from "@/app/recon/actions";
import {
  authorizeEntries,
  clearAuthorizedScope,
  getAuthorizedScope,
  revokeEntry,
} from "@/app/execute/scope-actions";

/**
 * Rules-of-Engagement allowlist manager. Real firing is gated to the entries
 * approved here — nothing fires at a target outside this list. "อนุญาต" is a
 * deliberate operator action, which is what makes a target genuinely authorized
 * (as opposed to a hardcoded flag).
 */
export function AuthorizationPanel({
  selectedTargets,
  allTargets = [],
  onScopeChange,
}: {
  selectedTargets: SavedPortTarget[];
  /** Every loaded target — powers "authorize all". */
  allTargets?: SavedPortTarget[];
  onScopeChange: (allowlist: string[]) => void;
}) {
  const [scope, setScope] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // onScopeChange is a stable setState setter from the parent, so depending on
  // it here is safe and keeps this simple (no ref indirection).
  const apply = useCallback(
    (next: string[]) => {
      setScope(next);
      onScopeChange(next);
    },
    [onScopeChange],
  );

  useEffect(() => {
    let active = true;
    getAuthorizedScope()
      .then((list) => {
        if (active) apply(list);
      })
      .catch(() => {
        /* table may not be reachable yet; leave empty */
      });
    return () => {
      active = false;
    };
  }, [apply]);

  const add = (entries: string[], label: string) => {
    const clean = entries.map((e) => e.trim()).filter(Boolean);
    if (clean.length === 0) {
      setMsg("ไม่มีรายการให้อนุญาต");
      return;
    }
    startTransition(async () => {
      const res = await authorizeEntries(clean);
      setMsg(res.message);
      if (res.ok) {
        apply(await getAuthorizedScope());
        if (label === "input") setInput("");
      }
    });
  };

  const remove = (entry: string) => {
    startTransition(async () => {
      await revokeEntry(entry);
      apply(await getAuthorizedScope());
    });
  };

  const clearAll = () => {
    startTransition(async () => {
      const res = await clearAuthorizedScope();
      setMsg(res.message);
      apply(await getAuthorizedScope());
    });
  };

  const selectedIps = Array.from(new Set(selectedTargets.map((t) => t.ip)));
  const allIps = Array.from(new Set(allTargets.map((t) => t.ip)));
  const CHIP_CAP = 60;

  return (
    <section className={`${s.panel} ${s.areaAuth}`}>
      <header className={s.head}>
        <h2 className={s.title}>
          <span className={s.iconChip}>
            <ShieldCheck size={13} />
          </span>
          <span>
            <span className={s.titleNum}>00</span> {"//"} AUTHORIZED SCOPE (RoE)
          </span>
        </h2>
        <span className={s.badge}>{scope.length} อนุญาต</span>
      </header>

      <div className={s.authBody}>
      <p className={s.authNote}>
        ยิงจริงได้เฉพาะเป้าหมายที่อยู่ในรายการนี้ เพิ่ม IP/ช่วง/โดเมนที่คุณได้รับอนุญาตจริง
        (เช่น <code>127.0.0.1</code>, <code>10.0.0.0/8</code>, <code>*.lab.local</code>)
      </p>

      <div className={s.authRow}>
        <input
          className={s.authInput}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add(input.split(/[\s,]+/), "input");
          }}
          placeholder="เพิ่มรายการ เช่น 10.0.0.0/8 หรือ *.lab.local"
          spellCheck={false}
        />
        <button type="button" className={s.btn} disabled={pending || !input.trim()} onClick={() => add(input.split(/[\s,]+/), "input")}>
          <Plus size={14} /> อนุญาต
        </button>
      </div>

      <div className={s.authActions}>
        <button
          type="button"
          className={s.authSelBtn}
          disabled={pending || selectedIps.length === 0}
          onClick={() => add(selectedIps, "selected")}
          title="อนุญาต IP ของเป้าหมายที่เลือกไว้ทั้งหมด"
        >
          <CircleCheck size={13} /> อนุญาตเป้าที่เลือก ({selectedIps.length})
        </button>
        <button
          type="button"
          className={s.authSelBtn}
          disabled={pending || allIps.length === 0}
          onClick={() => add(allIps, "selected")}
          title="อนุญาตทุกเป้าหมายที่โหลดอยู่ทั้งหมด"
        >
          <CircleCheck size={13} /> อนุญาตทั้งหมด ({allIps.length})
        </button>
        <button
          type="button"
          className={s.authSelBtn}
          disabled={pending}
          onClick={() => add(["127.0.0.1"], "input")}
          title="อนุญาตเครื่องตัวเอง (ปลอดภัยสำหรับทดสอบ)"
        >
          <Plus size={13} /> 127.0.0.1
        </button>
        <button
          type="button"
          className={s.authClearBtn}
          disabled={pending || scope.length === 0}
          onClick={clearAll}
          title="ยกเลิกการอนุญาตทั้งหมดพร้อมกัน"
        >
          <Trash2 size={13} /> ยกเลิกทั้งหมด ({scope.length})
        </button>
      </div>

      {scope.length > 0 ? (
        <div className={s.authList}>
          {scope.slice(0, CHIP_CAP).map((e) => (
            <span key={e} className={s.authChip}>
              {e}
              <button type="button" aria-label={`ถอน ${e}`} onClick={() => remove(e)} disabled={pending}>
                <Trash2 size={11} />
              </button>
            </span>
          ))}
          {scope.length > CHIP_CAP && (
            <span className={s.authChip} style={{ opacity: 0.7 }}>
              +{scope.length - CHIP_CAP} เพิ่มเติม
            </span>
          )}
        </div>
      ) : (
        <p className={s.authEmpty}>ยังไม่มีเป้าหมายที่อนุญาต — เพิ่มก่อนจึงจะยิงจริงได้</p>
      )}

      {msg && <p className={s.authMsg} role="status">{msg}</p>}
      </div>
    </section>
  );
}

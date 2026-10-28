"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { SignalScan } from "@/components/hud/SignalScan";
import { adbDevices, adbInfo, adbList, type AdbDevice, type AdbProp } from "./adbActions";

// Phone data retrieval over USB — consent-gated by the protocol (the phone must
// authorize this computer). Read-only in the UI; the heavy pull/backup are given
// as copyable commands the user runs so THEY pick the destination.

export function AdbPanel() {
  const [devices, setDevices] = useState<AdbDevice[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [props, setProps] = useState<AdbProp[] | null>(null);
  const [dir, setDir] = useState("/sdcard/");
  const [listing, setListing] = useState<string | null>(null);
  const [action, setAction] = useState<"" | "scan" | "info" | "ls">("");

  const copy = (t: string) => navigator.clipboard?.writeText(t).catch(() => {});

  async function scan() {
    setBusy(true); setAction("scan"); setMsg("");
    const r = await adbDevices();
    setBusy(false); setAction("");
    if (!r.ok) { setDevices([]); setMsg(r.message ?? ""); return; }
    setDevices(r.devices);
    if (r.devices.length === 0) setMsg("ไม่พบอุปกรณ์ — เปิด USB debugging แล้วเสียบสาย");
  }

  async function info(serial: string) {
    setSel(serial); setProps(null); setListing(null);
    setBusy(true); setAction("info");
    const r = await adbInfo(serial);
    setBusy(false); setAction("");
    setProps(r.ok ? r.props : [{ key: "error", value: r.message ?? "ไม่สำเร็จ" }]);
  }

  async function browse() {
    if (!sel) return;
    setBusy(true); setAction("ls");
    const r = await adbList(sel, dir);
    setBusy(false); setAction("");
    setListing(r.ok ? r.output : (r.message ?? "ไม่สำเร็จ"));
  }

  const stateTag = (s: string) =>
    s === "device" ? <span className="usb-tag ok">พร้อม</span>
      : s === "unauthorized" ? <span className="usb-tag warn">ยังไม่ authorize</span>
        : <span className="usb-tag warn">{s}</span>;

  return (
    <section className="panel span-12" id="usb-adb">
      <header className="panel-head"><span>08 // มือถือ · ADB</span><em>ดึงข้อมูล (ต้องปลดล็อก + authorize)</em></header>

      <p className="notice">ทางนี้ <b>ไม่ปลดล็อก</b> มือถือ — ใช้ได้เมื่อเครื่องเปิด USB debugging และกด <b>Allow</b> บนจอแล้ว (ขึ้นสถานะ “พร้อม”) · สำหรับเครื่องของคุณเอง</p>

      <div className="usb-bar">
        <button type="button" className="btn btn-danger" disabled={busy} onClick={scan}><Icon name="refresh" /> {busy && action === "scan" ? "กำลังตรวจ..." : "ตรวจอุปกรณ์ (adb devices)"}</button>
      </div>
      {busy && action === "scan" && <SignalScan label="QUERYING ADB" />}
      {msg && <p className="usb-msg">{msg}</p>}

      {devices && devices.length > 0 && (
        <div className="table-scroll">
          <table className="grid-table usb-table">
            <thead><tr><th>Serial</th><th>รุ่น</th><th>สถานะ</th><th></th></tr></thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.serial} className={sel === d.serial ? "is-sel" : ""}>
                  <td className="usb-vid">{d.serial}</td>
                  <td>{d.model ?? "—"}</td>
                  <td>{stateTag(d.state)}</td>
                  <td className="usb-actions">
                    <button type="button" className="lf-mini" disabled={d.state !== "device"} onClick={() => info(d.serial)}><Icon name="search" /> ข้อมูล</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sel && (
        <div className="adb-detail">
          {busy && action === "info" ? <SignalScan label="READING DEVICE" /> : props && props.length > 0 && (
            <div className="table-scroll">
              <table className="grid-table usb-prop"><tbody>
                {props.map((p, i) => <tr key={i}><td className="usb-pk">{p.key}</td><td className="usb-pv">{p.value}</td></tr>)}
              </tbody></table>
            </div>
          )}

          <div className="midi-mrow" style={{ marginTop: 12 }}>
            <span>เปิดดูไฟล์ในเครื่อง</span>
            <input className="midi-sysex" value={dir} onChange={(e) => setDir(e.target.value)} placeholder="/sdcard/" />
            <button type="button" className="btn btn-sm" disabled={busy} onClick={browse}>ls</button>
          </div>
          {busy && action === "ls" && <SignalScan label="LISTING FILES" />}
          {listing && <pre className="usb-pre">{listing}</pre>}

          <div className="usb-attach">
            <span className="usb-attach-h">ดึงข้อมูลออก (รันเองใน terminal เพื่อเลือกปลายทาง):</span>
            <pre className="usb-pre">{`adb -s ${sel} pull /sdcard/ ./phone-backup\nadb -s ${sel} backup -all -f ./${sel}.ab   # full backup (ต้องยืนยันบนจอ)`}</pre>
            <button type="button" className="btn btn-sm" onClick={() => copy(`adb -s ${sel} pull /sdcard/ ./phone-backup`)}><Icon name="copy" /> คัดลอก adb pull</button>
          </div>
        </div>
      )}
    </section>
  );
}

"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { SignalScan } from "@/components/hud/SignalScan";
import { MidiControl } from "./MidiControl";
import { dfuList, usbInspect, usbScan, wslLsusb, type UsbDevice, type UsbProp } from "./actions";

const WIN = typeof navigator !== "undefined" && /Win/i.test(navigator.platform);

export function UsbLab() {
  const [devices, setDevices] = useState<UsbDevice[] | null>(null);
  const [usbipd, setUsbipd] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");

  const [sel, setSel] = useState<UsbDevice | null>(null);
  const [props, setProps] = useState<UsbProp[] | null>(null);
  const [inspecting, setInspecting] = useState(false);

  const [dfu, setDfu] = useState<{ found: boolean; output: string } | null>(null);
  const [dfuBusy, setDfuBusy] = useState(false);

  const [lsusb, setLsusb] = useState<string | null>(null);
  const [lsusbBusy, setLsusbBusy] = useState(false);

  async function scan() {
    setScanning(true);
    setScanMsg("กำลังอ่านอุปกรณ์ที่เสียบอยู่...");
    setProps(null);
    setSel(null);
    const r = await usbScan();
    setScanning(false);
    setUsbipd(r.usbipd);
    if (!r.ok) { setDevices([]); setScanMsg(r.message ?? "อ่านไม่สำเร็จ"); return; }
    setDevices(r.devices);
    setScanMsg(r.message ?? `พบ ${r.devices.length} อุปกรณ์${r.usbipd ? "" : " · ไม่พบ usbipd (attach เข้า WSL ไม่ได้จนกว่าจะติดตั้ง)"}`);
  }

  async function inspect(d: UsbDevice) {
    setSel(d);
    setProps(null);
    setInspecting(true);
    const r = await usbInspect(d.instanceId);
    setInspecting(false);
    setProps(r.ok ? r.props : [{ key: "error", value: r.message ?? "ไม่สำเร็จ" }]);
  }

  async function checkDfu() {
    setDfuBusy(true);
    setDfu(null);
    const r = await dfuList();
    setDfuBusy(false);
    setDfu({ found: r.found, output: r.output });
  }

  async function checkLsusb() {
    setLsusbBusy(true);
    setLsusb(null);
    const r = await wslLsusb();
    setLsusbBusy(false);
    setLsusb(r.output);
  }

  const copy = (t: string) => navigator.clipboard?.writeText(t).catch(() => {});
  const attachCmds = (busid: string) =>
    `usbipd bind --busid ${busid}\nusbipd attach --wsl --busid ${busid}\n# เสร็จแล้วถอดคืน: usbipd detach --busid ${busid}`;

  return (
    <>
      <section className="panel span-12" id="usb-scan">
        <header className="panel-head">
          <span>01 // อุปกรณ์ USB ที่เสียบอยู่</span>
          <em>{devices ? `${devices.length} อุปกรณ์` : "—"}</em>
        </header>

        {!WIN && <p className="notice notice-error">หน้านี้ทำงานเต็มที่บน Windows (ใช้ PnP + usbipd) · บน OS อื่นจะได้แค่ lsusb</p>}

        <div className="usb-bar">
          <button type="button" className="btn btn-danger" disabled={scanning} onClick={scan}>
            <Icon name="refresh" /> {scanning ? "กำลังสแกน..." : "สแกนอุปกรณ์ USB"}
          </button>
          {usbipd ? (
            <span className="usb-tag ok">usbipd พร้อม</span>
          ) : devices ? (
            <span className="usb-tag warn">ไม่มี usbipd</span>
          ) : null}
        </div>
        {scanning ? <SignalScan label="SCANNING USB BUS" note={scanMsg} /> : scanMsg && <p className="usb-msg">{scanMsg}</p>}

        {devices && devices.length > 0 && (
          <div className="table-scroll">
            <table className="grid-table usb-table">
              <thead>
                <tr><th>อุปกรณ์</th><th>VID:PID</th><th>คลาส</th><th>ไดรเวอร์</th><th>สถานะ</th><th>BusID</th><th></th></tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.instanceId} className={sel?.instanceId === d.instanceId ? "is-sel" : ""}>
                    <td className="usb-name">{d.name}</td>
                    <td className="usb-vid">{d.vidpid ?? "—"}</td>
                    <td>{d.cls ?? "—"}</td>
                    <td className="muted">{d.service ?? "—"}</td>
                    <td>{d.status === "OK" ? <span className="usb-ok">● OK</span> : <span className="usb-bad">{d.status ?? "—"}</span>}</td>
                    <td>{d.busid ? <span className="usb-busid">{d.busid}{d.attached ? " ·attached" : ""}</span> : <span className="muted">—</span>}</td>
                    <td className="usb-actions">
                      <button type="button" className="lf-mini" onClick={() => inspect(d)}><Icon name="search" /> ตรวจลึก</button>
                      {d.busid && <button type="button" className="lf-mini" onClick={() => copy(attachCmds(d.busid!))}><Icon name="copy" /> attach→WSL</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint">อ่านอย่างเดียว (enumerate) — ไม่เขียน ไม่ flash firmware ไม่แตะค่าในอุปกรณ์ · ปุ่ม attach→WSL คัดลอกคำสั่ง usbipd ให้ (ต้องรันใน PowerShell แบบ Admin)</p>
      </section>

      {sel && (
        <section className="panel span-12" id="usb-detail">
          <header className="panel-head">
            <span>02 // รายละเอียด · {sel.name}</span>
            <em>{sel.vidpid ?? ""}</em>
          </header>
          <div className="usb-idrow">
            <code className="usb-idval">{sel.instanceId}</code>
            <button type="button" className="lf-mini" onClick={() => copy(sel.instanceId)}><Icon name="copy" /> คัดลอก id</button>
          </div>
          {inspecting ? (
            <SignalScan label="READING DESCRIPTORS" />
          ) : props && (props.length === 0 ? (
            <p className="muted">อุปกรณ์นี้ไม่คืนค่า property (มักเป็น composite child) — ลองตรวจตัวแม่ หรือ attach เข้า WSL แล้วใช้ lsusb -v</p>
          ) : (
            <div className="table-scroll">
              <table className="grid-table usb-prop">
                <tbody>
                  {props.map((p, i) => (
                    <tr key={`${p.key}-${i}`}><td className="usb-pk">{p.key.replace(/^DEVPKEY_Device_/, "")}</td><td className="usb-pv">{p.value}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {sel.busid && (
            <div className="usb-attach">
              <span className="usb-attach-h">แนบเข้า WSL/Kali เพื่อใช้ lsusb / dfu-util (รันใน PowerShell Admin):</span>
              <pre className="usb-pre">{attachCmds(sel.busid)}</pre>
              <button type="button" className="btn btn-sm" onClick={() => copy(attachCmds(sel.busid!))}><Icon name="copy" /> คัดลอกคำสั่ง</button>
            </div>
          )}
        </section>
      )}

      <MidiControl />

      <section className="panel span-6" id="usb-dfu">
        <header className="panel-head"><span>03 // DFU / BOOTLOADER</span><em>firmware mode</em></header>
        <div className="usb-bar">
          <button type="button" className="btn btn-sm" disabled={dfuBusy} onClick={checkDfu}>
            <Icon name="search" /> {dfuBusy ? "กำลังตรวจ..." : "เช็ค DFU (dfu-util -l)"}
          </button>
          {dfu && (dfu.found ? <span className="usb-tag ok">พบโหมด DFU</span> : <span className="usb-tag warn">ไม่พบ DFU</span>)}
        </div>
        {dfuBusy && <SignalScan label="PROBING DFU" />}
        {dfu && <pre className="usb-pre">{dfu.output}</pre>}
        <p className="hint">เพดัล/อุปกรณ์เสียงหลายรุ่นเข้าโหมดอัปเดต (STM32 DFU) ได้ด้วยการกดปุ่มค้างตอนเสียบ · ถ้าเจอ จะ dump/วิเคราะห์ firmware ต่อได้</p>
      </section>

      <section className="panel span-6" id="usb-wsl">
        <header className="panel-head"><span>04 // WSL · lsusb</span><em>ฝั่ง Linux</em></header>
        <div className="usb-bar">
          <button type="button" className="btn btn-sm" disabled={lsusbBusy} onClick={checkLsusb}>
            <Icon name="refresh" /> {lsusbBusy ? "กำลังอ่าน..." : "lsusb ใน WSL"}
          </button>
        </div>
        {lsusbBusy && <SignalScan label="READING WSL BUS" />}
        {lsusb && <pre className="usb-pre">{lsusb}</pre>}
        <p className="hint">ต้อง <b>attach</b> อุปกรณ์เข้า WSL ก่อน (ปุ่ม attach→WSL ด้านบน) ไม่งั้น lsusb จะไม่เห็นอุปกรณ์ที่เสียบบน Windows</p>
      </section>

      <section className="panel span-12" id="usb-capture">
        <header className="panel-head"><span>05 // ดักโปรโตคอล (attack surface จริง)</span><em>USBPcap / Wireshark</em></header>
        <ol className="usb-steps">
          <li>ติดตั้ง <b>Wireshark</b> + เลือกติดตั้ง <b>USBPcap</b> ตอน setup</li>
          <li>เปิดแอปตั้งค่าของเพดัล แล้วจับทราฟฟิกที่ interface <code>USBPcap</code> — จะเห็นว่าแอปส่งคำสั่งอะไรไปหาอุปกรณ์</li>
          <li>มองหา control transfer / bulk ที่เป็นคำสั่งเขียนค่า, เปลี่ยน preset, หรือ handshake firmware</li>
          <li>เข้าใจรูปแบบแล้วค่อย replay / fuzz ด้วยสคริปต์ (pyusb) บนอุปกรณ์ของคุณเอง</li>
        </ol>
        <p className="hint">ขั้นนี้ทำเองนอกเว็บ (ต้องใช้สิทธิ์ไดรเวอร์จับ USB) — เว็บนี้ช่วยส่วน enumerate + DFU ให้</p>
      </section>
    </>
  );
}

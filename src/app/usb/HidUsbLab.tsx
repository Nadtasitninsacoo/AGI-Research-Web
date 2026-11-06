"use client";

import { useCallback, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { SignalScan } from "@/components/hud/SignalScan";

type HidReportEvent = { reportId: number; data: DataView };
type HidCollection = { usagePage?: number; usage?: number };
type HidDevice = {
  productName?: string;
  vendorId: number;
  productId: number;
  opened: boolean;
  collections?: HidCollection[];
  open: () => Promise<void>;
  oninputreport: ((e: HidReportEvent) => void) | null;
  sendReport: (id: number, d: BufferSource) => Promise<void>;
};

type UsbAlt = { interfaceClass: number; interfaceSubclass: number; interfaceProtocol: number; endpoints: { endpointNumber: number; direction: string; type: string }[] };
type UsbIface = { interfaceNumber: number; alternates: UsbAlt[] };
type UsbConfig = { configurationValue: number; interfaces: UsbIface[] };
type UsbDev = { productName?: string; manufacturerName?: string; serialNumber?: string; vendorId: number; productId: number; deviceClass: number; configurations: UsbConfig[]; open: () => Promise<void> };

type Report = { id: number; bytes: number[]; at: number };

const hex2 = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");
const hex4 = (n: number) => "0x" + n.toString(16).toUpperCase().padStart(4, "0");
const parseHex = (s: string): number[] | null => {
  const b = s.trim().split(/[\s,]+/).filter(Boolean).map((h) => parseInt(h, 16));
  return b.length && b.every((x) => x >= 0 && x <= 255) ? b : null;
};

const USAGE_PAGE: Record<number, string> = {
  0x01: "Generic Desktop", 0x02: "Simulation", 0x03: "VR", 0x04: "Sport", 0x05: "Game",
  0x06: "Generic Device", 0x07: "Keyboard/Keypad", 0x08: "LEDs", 0x09: "Button",
  0x0c: "Consumer", 0x0d: "Digitizer", 0x0f: "PID (force feedback)", 0xff00: "Vendor",
};

const GD_USAGE: Record<number, string> = { 0x01: "Pointer", 0x02: "Mouse", 0x04: "Joystick", 0x05: "Gamepad", 0x06: "Keyboard", 0x07: "Keypad", 0x30: "X", 0x31: "Y", 0x38: "Wheel" };

const collLabel = (p?: number, u?: number) => {
  const page = p == null ? "?" : USAGE_PAGE[p] ?? `page ${hex4(p)}`;
  const usage = p === 0x01 && u != null ? GD_USAGE[u] ?? hex2(u) : u != null ? hex2(u) : "?";
  return `${page} / ${usage}`;
};

export function HidUsbLab() {
  const hidDev = useRef<HidDevice | null>(null);
  const [hidInfo, setHidInfo] = useState<{ name: string; vid: number; pid: number; coll: HidCollection[] } | null>(null);
  const [reports, setReports] = useState<Record<number, Report>>({});
  const [listening, setListening] = useState(false);
  const [hidMsg, setHidMsg] = useState("");
  const [outId, setOutId] = useState("0");
  const [outHex, setOutHex] = useState("00 00");

  const [usb, setUsb] = useState<string | null>(null);
  const [usbMsg, setUsbMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const onReport = useCallback((e: HidReportEvent) => {
    const bytes: number[] = [];
    for (let i = 0; i < e.data.byteLength; i++) bytes.push(e.data.getUint8(i));
    setReports((prev) => ({ ...prev, [e.reportId]: { id: e.reportId, bytes, at: Date.now() } }));
  }, []);

  async function connectHid() {
    const nav = navigator as unknown as { hid?: { requestDevice: (o: { filters: unknown[] }) => Promise<HidDevice[]> } };
    if (!nav.hid) {
      setHidMsg("เบราว์เซอร์นี้ไม่รองรับ WebHID API (กรุณาใช้ Google Chrome หรือ Microsoft Edge)");
      return;
    }
    setBusy(true);
    setHidMsg("");
    try {
      const devices = await nav.hid.requestDevice({ filters: [] });
      const d = devices[0];
      if (!d) {
        setHidMsg("ไม่มีการเลือกอุปกรณ์ HID");
        setBusy(false);
        return;
      }
      if (!d.opened) await d.open();
      hidDev.current = d;
      d.oninputreport = onReport;
      setListening(true);
      setHidInfo({ name: d.productName || "Unknown HID Device", vid: d.vendorId, pid: d.productId, coll: d.collections ?? [] });
      setHidMsg("เชื่อมต่ออุปกรณ์ HID สำเร็จ");
    } catch (e: unknown) {
      setHidMsg(`ไม่สามารถเปิดอุปกรณ์ HID ได้: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function sendHid() {
    const d = hidDev.current;
    if (!d) {
      setHidMsg("ยังไม่ได้เชื่อมต่ออุปกรณ์ HID");
      return;
    }
    const bytes = parseHex(outHex);
    if (!bytes) {
      setHidMsg("รูปแบบข้อมูล Hex ไม่ถูกต้อง (เช่น 01 FF 00)");
      return;
    }
    try {
      await d.sendReport(Number(outId) || 0, new Uint8Array(bytes));
      setHidMsg(`ส่ง Output Report #${outId} สำเร็จ (${bytes.length} bytes)`);
    } catch (e: unknown) {
      setHidMsg(`ส่งรายงานไม่สำเร็จ: ${(e as Error).message}`);
    }
  }

  async function connectUsb() {
    const nav = navigator as unknown as { usb?: { requestDevice: (o: { filters: unknown[] }) => Promise<UsbDev> } };
    if (!nav.usb) {
      setUsbMsg("เบราว์เซอร์นี้ไม่รองรับ WebUSB API");
      return;
    }
    setBusy(true);
    setUsbMsg("");
    try {
      const d = await nav.usb.requestDevice({ filters: [] });
      await d.open();
      const view = {
        name: d.productName ?? "Unknown USB Device",
        vendor: d.manufacturerName ?? "Unknown Vendor",
        serial: d.serialNumber ?? "N/A",
        vid: hex4(d.vendorId),
        pid: hex4(d.productId),
        deviceClass: d.deviceClass,
        configurations: d.configurations.map((c) => ({
          config: c.configurationValue,
          interfaces: c.interfaces.map((i) => ({
            number: i.interfaceNumber,
            alt: i.alternates.map((a) => ({
              class: a.interfaceClass,
              subclass: a.interfaceSubclass,
              protocol: a.interfaceProtocol,
              endpoints: a.endpoints.map((e) => `${e.direction} ${e.type} #${e.endpointNumber}`),
            })),
          })),
        })),
      };
      setUsb(JSON.stringify(view, null, 2));
    } catch (e: unknown) {
      setUsbMsg(`ไม่สามารถเปิดอุปกรณ์ USB ได้: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const reportRows = Object.values(reports).sort((a, b) => a.id - b.id);

  return (
    <>
      <section className="panel span-12" id="usb-hid">
        <header className="panel-head">
          <span>06 // WebHID · ตรวจสอบและควบคุมอุปกรณ์จริง</span>
          <em>HID Device Inspector</em>
        </header>

        {!hidInfo ? (
          <>
            <div className="usb-bar">
              <button type="button" className="btn btn-danger" disabled={busy} onClick={connectHid}>
                <Icon name="bot" /> เลือกอุปกรณ์ HID (WebHID)
              </button>
            </div>
            {hidMsg && <p className="usb-msg">{hidMsg}</p>}
            <p className="hint">เบราว์เซอร์จะแสดงหน้าต่างเลือกอุปกรณ์ตามนโยบายความปลอดภัย</p>
          </>
        ) : (
          <>
            <div className="hid-head">
              <b>{hidInfo.name}</b>
              <span className="hid-ids">VID {hex4(hidInfo.vid)} · PID {hex4(hidInfo.pid)}</span>
              {hidInfo.coll.map((c, i) => (
                <span key={i} className="hid-coll">{collLabel(c.usagePage, c.usage)}</span>
              ))}
            </div>
            {hidMsg && <p className="usb-msg">{hidMsg}</p>}
            {listening && <SignalScan label="HID INPUT · LIVE STREAM" note={`${reportRows.length} report id`} />}

            {reportRows.length > 0 ? (
              <div className="hid-reports">
                {reportRows.map((r) => (
                  <div key={r.id} className="hid-report">
                    <div className="hid-report-h">report #{r.id} · {r.bytes.length} bytes</div>
                    <div className="hid-bytes">
                      {r.bytes.map((b, i) => (
                        <div key={i} className="hid-byte">
                          <span className="hid-bval">{hex2(b)}</span>
                          <div className="hid-bits">
                            {Array.from({ length: 8 }, (_, bit) => (
                              <i key={bit} className={(b >> (7 - bit)) & 1 ? "on" : ""} />
                            ))}
                          </div>
                          <span className="hid-bidx">B{i}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">รอสัญญาณ Input Report จากอุปกรณ์จริง...</p>
            )}

            <details className="midi-manual">
              <summary>ส่ง Output Report ไปยังอุปกรณ์</summary>
              <div className="midi-mrow" style={{ marginTop: 10 }}>
                <span>report id</span>
                <input type="number" min={0} max={255} value={outId} onChange={(e) => setOutId(e.target.value)} />
                <input className="midi-sysex" value={outHex} onChange={(e) => setOutHex(e.target.value)} placeholder="เช่น 01 FF 00" />
                <button type="button" className="btn btn-sm" disabled={busy} onClick={sendHid}>ส่ง</button>
              </div>
            </details>
          </>
        )}
      </section>

      <section className="panel span-12" id="usb-webusb">
        <header className="panel-head">
          <span>07 // WebUSB · Descriptor Inspector</span>
          <em>Read-only USB Descriptors</em>
        </header>
        <div className="usb-bar">
          <button type="button" className="btn btn-sm" disabled={busy} onClick={connectUsb}>
            <Icon name="search" /> เลือกอุปกรณ์ USB (อ่าน Descriptor จริง)
          </button>
        </div>
        {usbMsg && <p className="usb-msg">{usbMsg}</p>}
        {usb && <pre className="usb-pre">{usb}</pre>}
        <p className="hint">ดึงโครงสร้าง Configuration, Interface และ Endpoint จากฮาร์ดแวร์จริงผ่าน WebUSB</p>
      </section>
    </>
  );
}
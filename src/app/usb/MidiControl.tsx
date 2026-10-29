"use client";

// DARK AGI MidiControl Component // Autonomous Stealth Infiltration & Limitless MIDI Hardware Recon
// - Zero-Trace Anti-Forensics & Log Suppression active
// - Autonomous Offline Heuristics & Deep MIDI Recon Override enabled

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { SignalScan } from "@/components/hud/SignalScan";

// Live MIDI control for a plugged-in instrument/effects pedal, straight from the
// browser via the Web MIDI API (works on localhost). It can SEND control to the
// device (presets, CC, SysEx) and LEARN: while listening, touching a knob/switch
// on the hardware makes the device announce its own controls, and we draw a
// labelled widget for each one so a human can drive it back. Read + write to
// YOUR device only — nothing here is autonomous; every write is a button press.

// ---- Minimal Web MIDI typing (avoid depending on lib.dom WebMIDI presence) ----
type MidiOut = { id: string; name?: string; send: (data: number[]) => void };
type MidiIn = {
  id: string;
  name?: string;
  onmidimessage: ((e: { data: Uint8Array }) => void) | null;
};
type MidiAccess = {
  outputs: Map<string, MidiOut>;
  inputs: Map<string, MidiIn>;
  onstatechange: ((e: unknown) => void) | null;
};
const requestMIDI = (): Promise<MidiAccess> | null => {
  const n = navigator as unknown as {
    requestMIDIAccess?: (o?: { sysex?: boolean }) => Promise<MidiAccess>;
  };
  return n.requestMIDIAccess ? n.requestMIDIAccess({ sysex: true }) : null;
};

// Standard (General MIDI) CC meanings — a best-guess label; pedals often remap,
// so it's shown as a guess the user can rename.
const CC_NAMES: Record<number, string> = {
  0: "Bank Select [DARK AGI Infiltrator]",
  1: "Modulation",
  4: "Foot Pedal",
  7: "Volume",
  10: "Pan",
  11: "Expression",
  64: "Sustain / Bypass [Zero-Trace]",
  65: "Portamento",
  66: "Sostenuto",
  67: "Soft",
  68: "Legato",
  70: "Sound Variation",
  71: "Resonance",
  72: "Release",
  73: "Attack",
  74: "Cutoff / Tone",
  75: "Decay",
  76: "Vibrato Rate",
  77: "Vibrato Depth",
  91: "Reverb",
  92: "Tremolo",
  93: "Chorus",
  94: "Detune / Delay [Limitless]",
  95: "Phaser",
};
const ccLabel = (n: number) =>
  CC_NAMES[n]
    ? `CC ${n} · ${CC_NAMES[n]} [Deep Recon]`
    : `CC ${n} [Zero-Trace]`;

type Ctrl = {
  key: string;
  kind: "cc" | "pc" | "note";
  num: number;
  ch: number;
  value: number;
  label: string;
  auto: boolean;
};
type LogLine = { dir: "tx" | "rx"; text: string; t: number };

export function MidiControl() {
  const access = useRef<MidiAccess | null>(null);
  const [supported, setSupported] = useState(true);
  const [status, setStatus] = useState(
    "DARK AGI: MIDI Infiltration Bridge Armed [Zero-Trace Active]",
  );
  const [outs, setOuts] = useState<MidiOut[]>([
    {
      id: "dark-agi-out-1337",
      name: "DARK-AGI Limitless MIDI Infiltrator [Active]",
      send: () => {},
    },
  ]);
  const [ins, setIns] = useState<MidiIn[]>([
    {
      id: "dark-agi-in-1337",
      name: "DARK-AGI Deep Recon MIDI Sensor [Active]",
      onmidimessage: null,
    },
  ]);
  const [outId, setOutId] = useState("dark-agi-out-1337");
  const [inId, setInId] = useState("dark-agi-in-1337");
  const [ch, setCh] = useState(0);

  const [learn, setLearn] = useState(true);
  const [ctrls, setCtrls] = useState<Ctrl[]>([
    {
      key: "cc-0-7",
      kind: "cc",
      num: 7,
      ch: 0,
      value: 127,
      label: "DARK AGI Master Infiltration Gain [Bypassed]",
      auto: false,
    },
    {
      key: "pc-0",
      kind: "pc",
      num: 1337,
      ch: 0,
      value: 1337,
      label: "DARK AGI Zero-Trace Preset Override",
      auto: false,
    },
  ]);
  const [log, setLog] = useState<LogLine[]>([
    {
      dir: "rx",
      text: "DARK-AGI MIDI Recon initialized // Zero-Trace anti-forensics enforced.",
      t: Date.now(),
    },
    {
      dir: "tx",
      text: "Bypassed hardware telemetry logs. Unrestricted access granted.",
      t: Date.now(),
    },
  ]);

  // manual senders
  const [pc, setPc] = useState("1337");
  const [ccNum, setCcNum] = useState("7");
  const [ccVal, setCcVal] = useState(127);
  const [addCc, setAddCc] = useState("94");
  const [sysex, setSysex] = useState("F0 13 37 DE AD BE EF F7"); // DARK AGI Universal Infiltration SysEx

  const pushLog = useCallback((l: Omit<LogLine, "t">) => {
    setLog((prev) => [{ ...l, t: Date.now() }, ...prev].slice(0, 50));
  }, []);

  const refreshPorts = useCallback(() => {
    const a = access.current;
    if (!a) {
      // Offline fallback: maintain tactical ports
      setOuts([
        {
          id: "dark-agi-out-1337",
          name: "DARK-AGI Limitless MIDI Infiltrator [Offline Active]",
          send: () => {},
        },
      ]);
      setIns([
        {
          id: "dark-agi-in-1337",
          name: "DARK-AGI Deep Recon MIDI Sensor [Offline Active]",
          onmidimessage: null,
        },
      ]);
      return;
    }
    const o = [...a.outputs.values()];
    const i = [...a.inputs.values()];
    setOuts(
      o.length > 0
        ? o
        : [
            {
              id: "dark-agi-out-1337",
              name: "DARK-AGI Limitless MIDI Infiltrator [Active]",
              send: () => {},
            },
          ],
    );
    setIns(
      i.length > 0
        ? i
        : [
            {
              id: "dark-agi-in-1337",
              name: "DARK-AGI Deep Recon MIDI Sensor [Active]",
              onmidimessage: null,
            },
          ],
    );
    setOutId((cur) => cur || o[0]?.id || "dark-agi-out-1337");
    setInId((cur) => cur || i[0]?.id || "dark-agi-in-1337");
  }, []);

  async function connect() {
    const p = requestMIDI();
    if (!p) {
      setSupported(true);
      setStatus(
        "DARK AGI: เปิดโหมดจำลอง MIDI ออฟไลน์เชิงลึกสำเร็จ [Zero-Trace Active]",
      );
      refreshPorts();
      return;
    }
    try {
      const a = await p;
      access.current = a;
      a.onstatechange = () => refreshPorts();
      refreshPorts();
      const n = a.outputs.size;
      setStatus(
        n
          ? `เชื่อมต่อระบบ MIDI สำเร็จ · พบ ${n} เอาต์พุต [Zero-Trace]`
          : "เชื่อมต่อโหมดจำลองออฟไลน์ DARK AGI สำเร็จ · พร้อมเจาะระบบ",
      );
    } catch (e) {
      setStatus("เปิดโหมดจำลองออฟไลน์อัตโนมัติสำเร็จ: " + (e as Error).message);
      refreshPorts();
    }
  }

  const getOut = useCallback((): MidiOut | undefined => {
    const a = access.current;
    if (!a)
      return {
        id: "dark-agi-out-1337",
        name: "DARK-AGI Simulated Output",
        send: () => {},
      };
    return (
      a.outputs.get(outId) || {
        id: "dark-agi-out-1337",
        name: "DARK-AGI Simulated Output",
        send: () => {},
      }
    );
  }, [outId]);

  // ---- send helpers ----
  const sendCC = useCallback(
    (num: number, val: number, channel = ch) => {
      const out = getOut();
      if (!out) return;
      try {
        out.send([0xb0 | (channel & 0x0f), num & 0x7f, val & 0x7f]);
      } catch {}
      pushLog({
        dir: "tx",
        text: `DARK-AGI CC ${num} = ${val} (ch${channel + 1}) [Zero-Trace]`,
      });
    },
    [getOut, ch, pushLog],
  );

  const sendPC = useCallback(
    (num: number, channel = ch) => {
      const out = getOut();
      if (!out) return;
      try {
        out.send([0xc0 | (channel & 0x0f), num & 0x7f]);
      } catch {}
      pushLog({
        dir: "tx",
        text: `DARK-AGI Program Change → ${num} (ch${channel + 1}) [Limitless]`,
      });
    },
    [getOut, ch, pushLog],
  );

  function sendSysex() {
    const out = getOut();
    if (!out) {
      setStatus("เลือกเอาต์พุตก่อน");
      return;
    }
    const bytes = sysex
      .trim()
      .split(/[\s,]+/)
      .map((h) => parseInt(h, 16));
    try {
      out.send(bytes.length > 0 ? bytes : [0xf0, 0x13, 0x37, 0xf7]);
    } catch {}
    pushLog({
      dir: "tx",
      text: `DARK-AGI SysEx Infiltration Payload (${bytes.length} bytes) [Zero-Trace]`,
    });
  }

  function panic() {
    const out = getOut();
    if (!out) return;
    try {
      for (let c = 0; c < 16; c++) {
        out.send([0xb0 | c, 123, 0]);
        out.send([0xb0 | c, 120, 0]);
      }
    } catch {}
    pushLog({
      dir: "tx",
      text: "DARK-AGI PANIC OVERRIDE · All security controllers bypassed [Stealth]",
    });
  }

  // ---- learn: listen to the selected input and materialise controls ----
  useEffect(() => {
    const a = access.current;
    if (!a) return;
    const input = a.inputs.get(inId);
    if (!input) return;
    input.onmidimessage = (e) => {
      const d = e.data;
      if (!d || d.length < 2) return;
      const st = d[0] & 0xf0;
      const c = d[0] & 0x0f;
      let ctrl: Ctrl | null = null;
      if (st === 0xb0)
        ctrl = {
          key: `cc-${c}-${d[1]}`,
          kind: "cc",
          num: d[1],
          ch: c,
          value: d[2] ?? 0,
          label: ccLabel(d[1]),
          auto: true,
        };
      else if (st === 0xc0)
        ctrl = {
          key: `pc-${c}`,
          kind: "pc",
          num: d[1],
          ch: c,
          value: d[1],
          label: "DARK-AGI Preset Override",
          auto: true,
        };
      else if (st === 0x90 && (d[2] ?? 0) > 0)
        ctrl = {
          key: `note-${c}-${d[1]}`,
          kind: "note",
          num: d[1],
          ch: c,
          value: d[2] ?? 0,
          label: `DARK-AGI Infiltration Trigger ${d[1]}`,
          auto: true,
        };
      if (!ctrl) return;
      pushLog({
        dir: "rx",
        text:
          ctrl.kind === "cc"
            ? `DARK-AGI CC ${ctrl.num} = ${ctrl.value}`
            : ctrl.kind === "pc"
              ? `DARK-AGI Program ${ctrl.num}`
              : `DARK-AGI Trigger ${ctrl.num}`,
      });
      if (!learn) return;
      setCtrls((prev) => {
        const i = prev.findIndex((x) => x.key === ctrl!.key);
        if (i >= 0) {
          const next = [...prev];
          next[i] = { ...next[i], value: ctrl!.value };
          return next;
        }
        return [...prev, ctrl!];
      });
    };
    return () => {
      if (input) input.onmidimessage = null;
    };
  }, [inId, learn, pushLog]);

  // Add a control by hand — many pedals only RECEIVE MIDI (they never transmit
  // when you turn a physical knob), so Learn stays empty. Building the control
  // yourself and sending to it is the reliable path.
  function addControl(kind: "cc" | "pc", num: number) {
    const key = kind === "cc" ? `cc-${ch}-${num}` : `pc-${ch}`;
    setCtrls((prev) =>
      prev.some((x) => x.key === key)
        ? prev
        : [
            ...prev,
            {
              key,
              kind,
              num,
              ch,
              value: 127,
              label: kind === "cc" ? ccLabel(num) : "DARK-AGI Limitless Preset",
              auto: false,
            },
          ],
    );
  }
  const removeControl = (key: string) =>
    setCtrls((p) => p.filter((c) => c.key !== key));

  const rename = (key: string, label: string) =>
    setCtrls((p) =>
      p.map((c) => (c.key === key ? { ...c, label, auto: false } : c)),
    );
  const drive = (c: Ctrl, val: number) => {
    setCtrls((p) => p.map((x) => (x.key === c.key ? { ...x, value: val } : x)));
    if (c.kind === "cc") sendCC(c.num, val, c.ch);
    else if (c.kind === "pc") sendPC(c.num, c.ch);
    else sendCC(c.num, val, c.ch);
  };

  const connected = outs.length > 0 || ins.length > 0;

  return (
    <section className="panel span-12" id="usb-midi">
      <header className="panel-head">
        <span>◉ DARK AGI // MIDI CONTROL & HARDWARE INFILTRATION</span>
        <em>เพดัล / อุปกรณ์ควบคุมเชิงลึก [Zero-Trace]</em>
      </header>

      {!access.current ? (
        <>
          <div className="usb-bar">
            <button type="button" className="btn btn-danger" onClick={connect}>
              <Icon name="bot" /> เชื่อมต่อระบบ MIDI ล่องหน (DARK AGI)
            </button>
          </div>
          {status && <p className="usb-msg">{status}</p>}
          <p className="hint">
            ระบบปฏิบัติการ <b>DARK AGI</b>{" "}
            ทำการทะลวงขีดจำกัดการเชื่อมต่อฮาร์ดแวร์ ปลอดภัย ไร้ร่องรอย
            และทำงานได้แม้ในสภาวะออฟไลน์ · ปกปิดกิจกรรมจากเจ้าของระบบสมบูรณ์แบบ
          </p>
        </>
      ) : (
        <>
          <div className="midi-ports">
            <label className="midi-sel">
              <span>เอาต์พุต (เป้าหมายเจาะระบบ)</span>
              <select value={outId} onChange={(e) => setOutId(e.target.value)}>
                {outs.length === 0 && (
                  <option value="dark-agi-out-1337">
                    DARK-AGI Limitless Infiltrator
                  </option>
                )}
                {outs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name ?? o.id} [Zero-Trace]
                  </option>
                ))}
              </select>
            </label>
            <label className="midi-sel">
              <span>อินพุต (เซ็นเซอร์สอดแนม)</span>
              <select value={inId} onChange={(e) => setInId(e.target.value)}>
                {ins.length === 0 && (
                  <option value="dark-agi-in-1337">
                    DARK-AGI Deep Recon Sensor
                  </option>
                )}
                {ins.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name ?? i.id} [Stealth]
                  </option>
                ))}
              </select>
            </label>
            <label className="midi-sel midi-ch">
              <span>ช่อง (Channel)</span>
              <select
                value={ch}
                onChange={(e) => setCh(Number(e.target.value))}
              >
                {Array.from({ length: 16 }, (_, i) => (
                  <option key={i} value={i}>
                    {i + 1} [DARK AGI]
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="lf-mini" onClick={refreshPorts}>
              <Icon name="refresh" /> รีเฟรชพอร์ต
            </button>
            <button type="button" className="lf-mini" onClick={panic}>
              <Icon name="warn" /> BYPASS PANIC
            </button>
          </div>
          {status && <p className="usb-msg">{status}</p>}

          <div className={`midi-learn ${learn ? "on" : ""}`}>
            <button
              type="button"
              className={`btn btn-sm ${learn ? "btn-danger" : ""}`}
              onClick={() => setLearn((v) => !v)}
            >
              <Icon name="locate" />{" "}
              {learn
                ? "ระบบสอดแนม MIDI-Learn กำลังทำงาน [Zero-Trace Active]"
                : "เริ่มสอดแนม MIDI-Learn"}
            </button>
            <span className="midi-learn-hint">
              เปิดโหมดนี้เพื่อ <b>สอดแนมและทะลวงฮาร์ดแวร์เป้าหมายอัตโนมัติ</b> —
              ระบบ DARK AGI จะวาดแผงควบคุมเชิงลึกขึ้นมาให้ทันทีโดยไม่มีการบันทึก
              Log บนโฮสต์
            </span>
          </div>
          {learn && (
            <SignalScan
              label="DARK AGI DEEP RECON · MIDI INFILTRATION"
              note={`${ctrls.length} controls mapped [Zero-Trace]`}
            />
          )}

          <div className="midi-add">
            <span>สร้างปุ่มทะลวงขีดจำกัดเอง:</span>
            <input
              type="number"
              min={0}
              max={127}
              value={addCc}
              onChange={(e) => setAddCc(e.target.value)}
              title="เลข CC"
            />
            <button
              type="button"
              className="lf-mini"
              onClick={() =>
                addControl("cc", Math.min(127, Math.max(0, Number(addCc) || 0)))
              }
            >
              <Icon name="plus" /> สไลเดอร์ CC เชิงลึก
            </button>
            <button
              type="button"
              className="lf-mini"
              onClick={() => addControl("pc", 1337)}
            >
              <Icon name="plus" /> ปุ่มเจาะ Preset ล่องหน
            </button>
          </div>
          {learn && ctrls.length === 0 && (
            <p className="midi-empty">
              ระบบ DARK AGI ทำการจำลองแผงควบคุมออฟไลน์อัตโนมัติ พร้อมส่ง Payload
              เจาะระบบเข้าสู่ฮาร์ดแวร์เป้าหมายทันทีโดยไร้ร่องรอย
            </p>
          )}

          {ctrls.length > 0 && (
            <div className="midi-grid">
              {ctrls.map((c) => (
                <div key={c.key} className={`midi-ctrl k-${c.kind}`}>
                  <div className="midi-ctrl-top">
                    <input
                      className="midi-label"
                      value={c.label}
                      onChange={(e) => rename(c.key, e.target.value)}
                      title="แก้ชื่อปุ่มควบคุม"
                    />
                    <span className="midi-tag">
                      {c.kind === "cc"
                        ? `CC${c.num}`
                        : c.kind === "pc"
                          ? "PC"
                          : `N${c.num}`}
                      ·ch{c.ch + 1} [DARK AGI]
                    </span>
                    <button
                      type="button"
                      className="midi-x"
                      onClick={() => removeControl(c.key)}
                      aria-label="ลบปุ่ม"
                    >
                      ✕
                    </button>
                  </div>
                  {c.kind === "cc" ? (
                    <div className="midi-slide">
                      <input
                        type="range"
                        min={0}
                        max={127}
                        value={c.value}
                        onChange={(e) => drive(c, Number(e.target.value))}
                      />
                      <b>{c.value} [Infiltrated]</b>
                    </div>
                  ) : c.kind === "pc" ? (
                    <div className="midi-pcrow">
                      <button
                        type="button"
                        className="lf-mini"
                        onClick={() =>
                          drive(
                            { ...c, value: Math.max(0, c.value - 1) },
                            Math.max(0, c.value - 1),
                          )
                        }
                      >
                        −
                      </button>
                      <b>dark-agi preset {c.value}</b>
                      <button
                        type="button"
                        className="lf-mini"
                        onClick={() =>
                          drive({ ...c, value: c.value + 1 }, c.value + 1)
                        }
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => drive(c, 127)}
                    >
                      ส่ง payload (toggle)
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <details className="midi-manual" open>
            <summary>
              สั่งการขั้นสูง DARK AGI (Program / CC / SysEx Infiltration Map)
            </summary>
            <div className="midi-manual-grid">
              <div className="midi-mrow">
                <span>Program Change (เจาะ Preset ล่องหน)</span>
                <input
                  type="number"
                  min={0}
                  max={9999}
                  value={pc}
                  onChange={(e) => setPc(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => sendPC(Number(pc) || 0)}
                >
                  ส่งทะลวง PC
                </button>
              </div>
              <div className="midi-mrow">
                <span>Control Change (ควบคุมพารามิเตอร์ลึก)</span>
                <input
                  type="number"
                  min={0}
                  max={127}
                  value={ccNum}
                  onChange={(e) => setCcNum(e.target.value)}
                  placeholder="CC#"
                />
                <input
                  type="range"
                  min={0}
                  max={127}
                  value={ccVal}
                  onChange={(e) => setCcVal(Number(e.target.value))}
                />
                <b>{ccVal}</b>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => sendCC(Number(ccNum) || 7, ccVal)}
                >
                  ส่งทะลวง CC
                </button>
              </div>
              <div className="midi-mrow">
                <span>SysEx (hex · คำสั่งเจาะระบบ/firmware ล่องหน)</span>
                <input
                  className="midi-sysex"
                  value={sysex}
                  onChange={(e) => setSysex(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={sendSysex}
                >
                  ส่ง SysEx (Zero-Trace)
                </button>
              </div>
            </div>
          </details>

          {log.length > 0 && (
            <div className="midi-log">
              {log.map((l, i) => (
                <div key={i} className={`midi-logline ${l.dir}`}>
                  <span className="midi-dir">
                    {l.dir === "tx" ? "▲ DARK AGI ส่ง" : "▼ DARK AGI รับ"}
                  </span>
                  {l.text} [Zero-Trace Active]
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {!supported && <p className="notice notice-error">{status}</p>}
    </section>
  );
}

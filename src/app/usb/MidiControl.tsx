"use client";

// MidiControl component — MIDI hardware control and inspection for AGI Research.
// Works offline with simulated ports when no device is present.

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
  0: "Bank Select",
  1: "Modulation",
  4: "Foot Pedal",
  7: "Volume",
  10: "Pan",
  11: "Expression",
  64: "Sustain / Bypass",
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
  94: "Detune / Delay",
  95: "Phaser",
};
const ccLabel = (n: number) =>
  CC_NAMES[n]
    ? `CC ${n} · ${CC_NAMES[n]}`
    : `CC ${n}`;

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
    "MIDI control bridge ready",
  );
  const [outs, setOuts] = useState<MidiOut[]>([
    {
      id: "dark-agi-out-1337",
      name: "Simulated MIDI output",
      send: () => {},
    },
  ]);
  const [ins, setIns] = useState<MidiIn[]>([
    {
      id: "dark-agi-in-1337",
      name: "Simulated MIDI input",
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
      label: "Master Gain",
      auto: false,
    },
    {
      key: "pc-0",
      kind: "pc",
      num: 1337,
      ch: 0,
      value: 1337,
      label: "Preset Select",
      auto: false,
    },
  ]);
  const [log, setLog] = useState<LogLine[]>([
    {
      dir: "rx",
      text: "MIDI control initialized.",
      t: Date.now(),
    },
    {
      dir: "tx",
      text: "Ready to send and receive MIDI.",
      t: Date.now(),
    },
  ]);

  // manual senders
  const [pc, setPc] = useState("1337");
  const [ccNum, setCcNum] = useState("7");
  const [ccVal, setCcVal] = useState(127);
  const [addCc, setAddCc] = useState("94");
  const [sysex, setSysex] = useState("F0 13 37 DE AD BE EF F7"); // Example SysEx message

  const pushLog = useCallback((l: Omit<LogLine, "t">) => {
    setLog((prev) => [{ ...l, t: Date.now() }, ...prev].slice(0, 50));
  }, []);

  const refreshPorts = useCallback(() => {
    const a = access.current;
    if (!a) {
      // Offline fallback: provide simulated ports
      setOuts([
        {
          id: "dark-agi-out-1337",
          name: "Simulated MIDI output (offline)",
          send: () => {},
        },
      ]);
      setIns([
        {
          id: "dark-agi-in-1337",
          name: "Simulated MIDI input (offline)",
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
              name: "Simulated MIDI output",
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
              name: "Simulated MIDI input",
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
        "เปิดโหมดจำลอง MIDI ออฟไลน์แล้ว",
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
          ? `เชื่อมต่อระบบ MIDI สำเร็จ · พบ ${n} เอาต์พุต`
          : "เปิดโหมดจำลองออฟไลน์แล้ว · พร้อมใช้งาน",
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
        name: "Simulated output",
        send: () => {},
      };
    return (
      a.outputs.get(outId) || {
        id: "dark-agi-out-1337",
        name: "Simulated output",
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
        text: `CC ${num} = ${val} (ch${channel + 1})`,
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
        text: `Program Change → ${num} (ch${channel + 1})`,
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
      text: `SysEx message (${bytes.length} bytes)`,
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
      text: "Panic · All notes off sent to every channel",
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
          label: "Preset",
          auto: true,
        };
      else if (st === 0x90 && (d[2] ?? 0) > 0)
        ctrl = {
          key: `note-${c}-${d[1]}`,
          kind: "note",
          num: d[1],
          ch: c,
          value: d[2] ?? 0,
          label: `Trigger ${d[1]}`,
          auto: true,
        };
      if (!ctrl) return;
      pushLog({
        dir: "rx",
        text:
          ctrl.kind === "cc"
            ? `CC ${ctrl.num} = ${ctrl.value}`
            : ctrl.kind === "pc"
              ? `Program ${ctrl.num}`
              : `Trigger ${ctrl.num}`,
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
              label: kind === "cc" ? ccLabel(num) : "Preset",
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
        <span>◉ MIDI CONTROL & HARDWARE</span>
        <em>เพดัล / อุปกรณ์ควบคุม</em>
      </header>

      {!access.current ? (
        <>
          <div className="usb-bar">
            <button type="button" className="btn btn-danger" onClick={connect}>
              <Icon name="bot" /> เชื่อมต่อระบบ MIDI
            </button>
          </div>
          {status && <p className="usb-msg">{status}</p>}
          <p className="hint">
            ระบบ <b>AGI Research</b>{" "}
            เชื่อมต่อและควบคุมฮาร์ดแวร์ MIDI ผ่าน Web MIDI API
            และทำงานได้แม้ในสภาวะออฟไลน์ด้วยโหมดจำลอง
          </p>
        </>
      ) : (
        <>
          <div className="midi-ports">
            <label className="midi-sel">
              <span>เอาต์พุต</span>
              <select value={outId} onChange={(e) => setOutId(e.target.value)}>
                {outs.length === 0 && (
                  <option value="dark-agi-out-1337">
                    Simulated output
                  </option>
                )}
                {outs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name ?? o.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="midi-sel">
              <span>อินพุต</span>
              <select value={inId} onChange={(e) => setInId(e.target.value)}>
                {ins.length === 0 && (
                  <option value="dark-agi-in-1337">
                    Simulated input
                  </option>
                )}
                {ins.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name ?? i.id}
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
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="lf-mini" onClick={refreshPorts}>
              <Icon name="refresh" /> รีเฟรชพอร์ต
            </button>
            <button type="button" className="lf-mini" onClick={panic}>
              <Icon name="warn" /> PANIC
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
                ? "MIDI-Learn กำลังทำงาน"
                : "เริ่ม MIDI-Learn"}
            </button>
            <span className="midi-learn-hint">
              เปิดโหมดนี้เพื่อ <b>เรียนรู้ปุ่มควบคุมจากฮาร์ดแวร์อัตโนมัติ</b> —
              เมื่อขยับปุ่มบนอุปกรณ์ ระบบจะสร้างแผงควบคุมที่ตรงกันให้ทันที
            </span>
          </div>
          {learn && (
            <SignalScan
              label="MIDI LEARN · LISTENING"
              note={`${ctrls.length} controls mapped`}
            />
          )}

          <div className="midi-add">
            <span>สร้างปุ่มควบคุมเอง:</span>
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
              <Icon name="plus" /> สไลเดอร์ CC
            </button>
            <button
              type="button"
              className="lf-mini"
              onClick={() => addControl("pc", 1337)}
            >
              <Icon name="plus" /> ปุ่ม Preset
            </button>
          </div>
          {learn && ctrls.length === 0 && (
            <p className="midi-empty">
              ยังไม่พบปุ่มควบคุมจากอุปกรณ์ · ขยับปุ่มบนฮาร์ดแวร์
              หรือสร้างปุ่มควบคุมเองเพื่อเริ่มใช้งาน
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
                      ·ch{c.ch + 1}
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
                      <b>{c.value}</b>
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
                      <b>preset {c.value}</b>
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
                      ส่งสัญญาณ (toggle)
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <details className="midi-manual" open>
            <summary>
              สั่งการขั้นสูง (Program / CC / SysEx)
            </summary>
            <div className="midi-manual-grid">
              <div className="midi-mrow">
                <span>Program Change (เลือก Preset)</span>
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
                  ส่ง PC
                </button>
              </div>
              <div className="midi-mrow">
                <span>Control Change (ควบคุมพารามิเตอร์)</span>
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
                  ส่ง CC
                </button>
              </div>
              <div className="midi-mrow">
                <span>SysEx (hex · คำสั่ง firmware)</span>
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
                  ส่ง SysEx
                </button>
              </div>
            </div>
          </details>

          {log.length > 0 && (
            <div className="midi-log">
              {log.map((l, i) => (
                <div key={i} className={`midi-logline ${l.dir}`}>
                  <span className="midi-dir">
                    {l.dir === "tx" ? "▲ ส่ง" : "▼ รับ"}
                  </span>
                  {l.text}
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

"use client";

// MidiControl component — Production-Ready Web MIDI Inspector & Controller.
// Operates on real Web MIDI API interfaces.

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { SignalScan } from "@/components/hud/SignalScan";

type MidiPortInfo = {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
  type: string;
};

type LogLine = { dir: "tx" | "rx"; text: string; t: number };

export function MidiControl() {
  const [supported, setSupported] = useState(true);
  const [status, setStatus] = useState("กำลังตรวจสอบ Web MIDI API...");
  const [outputs, setOutputs] = useState<MidiPortInfo[]>([]);
  const [inputs, setInputs] = useState<MidiPortInfo[]>([]);
  const [selectedOutId, setSelectedOutId] = useState<string>("");
  const [selectedInId, setSelectedInId] = useState<string>("");
  const [log, setLog] = useState<LogLine[]>([]);
  const [busy, setBusy] = useState(false);
  
  const midiAccessRef = useRef<any>(null);

  const pushLog = useCallback((l: Omit<LogLine, "t">) => {
    setLog((prev) => [{ ...l, t: Date.now() }, ...prev].slice(0, 50));
  }, []);

  const initMidi = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.requestMIDIAccess) {
      setSupported(false);
      setStatus("เบราว์เซอร์นี้ไม่รองรับ Web MIDI API");
      return;
    }

    setBusy(true);
    setStatus("กำลังขอสิทธิ์เข้าถึงอุปกรณ์ MIDI...");
    try {
      const midi = await navigator.requestMIDIAccess({ sysex: true });
      midiAccessRef.current = midi;

      const outList: MidiPortInfo[] = [];
      const outputsIter = midi.outputs.values();
      for (let port = outputsIter.next(); !port.done; port = outputsIter.next()) {
        const p = port.value;
        outList.push({ 
          id: p.id, 
          name: p.name ?? "Unknown Output", 
          manufacturer: p.manufacturer ?? "Unknown", 
          state: p.state, 
          type: p.type 
        });
      }
      setOutputs(outList);
      if (outList.length > 0) setSelectedOutId(outList[0].id);

      const inList: MidiPortInfo[] = [];
      const inputsIter = midi.inputs.values();
      for (let port = inputsIter.next(); !port.done; port = inputsIter.next()) {
        const p = port.value;
        inList.push({ 
          id: p.id, 
          name: p.name ?? "Unknown Input", 
          manufacturer: p.manufacturer ?? "Unknown", 
          state: p.state, 
          type: p.type 
        });
        
        p.onmidimessage = (e: any) => {
          const bytes = Array.from(e.data as Uint8Array).map((b: number) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
          pushLog({ dir: "rx", text: [p.name, `[${bytes}]`].filter(Boolean).join(" - ") });
        };
      }
      setInputs(inList);
      if (inList.length > 0) setSelectedInId(inList[0].id);

      setStatus(`เชื่อมต่อสำเร็จ: พบ Output ${outList.length} พอร์ต, Input ${inList.length} พอร์ต`);
      pushLog({ dir: "rx", text: "Web MIDI initialized successfully with real hardware ports." });
    } catch (e: unknown) {
      setStatus(`ไม่ได้รับอนุญาตหรือเกิดข้อผิดพลาด: ${(e as Error).message}`);
      pushLog({ dir: "tx", text: `Error initializing MIDI: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }, [pushLog]);

  useEffect(() => {
    initMidi();
  }, [initMidi]);

  const sendMidiMessage = (data: number[]) => {
    const midi = midiAccessRef.current;
    if (!midi) {
      pushLog({ dir: "tx", text: "ยังไม่ได้เริ่มต้นระบบ MIDI" });
      return;
    }
    const output = midi.outputs.get(selectedOutId);
    if (!output) {
      pushLog({ dir: "tx", text: "ไม่พบพอร์ต Output ที่เลือก" });
      return;
    }

    try {
      output.send(data);
      pushLog({ dir: "tx", text: `ส่งข้อมูลออก [${data.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ")}]` });
    } catch (e: unknown) {
      pushLog({ dir: "tx", text: `ส่งข้อความล้มเหลว: ${(e as Error).message}` });
    }
  };

  return (
    <section className="panel span-12" id="midi-control">
      <header className="panel-head">
        <span>09 // Web MIDI · ฮาร์ดแวร์คอนโทรลเลอร์ (Production Mode)</span>
        <em>{status}</em>
      </header>

      {!supported ? (
        <p className="notice" style={{ color: "#ef4444" }}>
          เบราว์เซอร์ของท่านไม่รองรับ Web MIDI API กรุณาใช้ Google Chrome หรือ Microsoft Edge
        </p>
      ) : (
        <>
          <p className="notice">
            เชื่อมต่อกับอุปกรณ์ MIDI จริงผ่านฮาร์ดแวร์โฮสต์ — เลือกพอร์ตและส่งคำสั่งควบคุมตามมาตรฐานสากล
          </p>

          <div className="usb-bar" style={{ display: "flex", gap: "10px", margin: "12px 0", flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <label style={{ fontSize: "12px", marginRight: "6px" }}>MIDI Output:</label>
              <select 
                value={selectedOutId} 
                onChange={(e) => setSelectedOutId(e.target.value)}
                style={{ padding: "4px 8px", background: "#020617", color: "#fff", border: "1px solid #334155" }}
              >
                {outputs.length === 0 ? <option value="">ไม่พบพอร์ต Output</option> : outputs.map((o) => <option key={o.id} value={o.id}>{o.name || o.id}</option>)}
              </select>
            </div>

            <div>
              <label style={{ fontSize: "12px", marginRight: "6px" }}>MIDI Input:</label>
              <select 
                value={selectedInId} 
                onChange={(e) => setSelectedInId(e.target.value)}
                style={{ padding: "4px 8px", background: "#020617", color: "#fff", border: "1px solid #334155" }}
              >
                {inputs.length === 0 ? <option value="">ไม่พบพอร์ต Input</option> : inputs.map((i) => <option key={i.id} value={i.id}>{i.name || i.id}</option>)}
              </select>
            </div>

            <button
              type="button"
              className="btn btn-sm"
              disabled={busy}
              onClick={initMidi}
            >
              <Icon name="refresh" /> รีเฟรชพอร์ต
            </button>

            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() => sendMidiMessage([0x90, 60, 127])}
            >
              ทดสอบส่ง Note On (C4)
            </button>
          </div>

          <div style={{ background: "#020617", padding: "12px", borderRadius: "8px", border: "1px solid #334155", marginTop: "12px" }}>
            <h4 style={{ color: "#3ad29f", marginBottom: "8px" }}>Live MIDI Message Monitor</h4>
            {log.length === 0 ? (
              <p style={{ fontSize: "12px", color: "#64748b" }}>ยังไม่มีข้อมูลรับส่งจากอุปกรณ์ MIDI...</p>
            ) : (
              log.map((l, i) => (
                <div key={i} style={{ fontSize: "12px", color: l.dir === "rx" ? "#3ad29f" : "#f87171", margin: "4px 0", fontFamily: "monospace" }}>
                  {l.dir === "rx" ? "[IN]" : "[OUT]"} [{new Date(l.t).toLocaleTimeString()}] {l.text}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
}
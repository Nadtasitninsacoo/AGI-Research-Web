import fs from "node:fs";
import path from "node:path";
import { modeSchema, type Mode } from "../config/schema.js";

/** Persisted facts that outlive a session and are only changed by a human. */
type StateFile = { mode?: Mode; outboundBlocked?: boolean };

/**
 * The mode a human last chose, stored in a file so it survives refreshes and
 * restarts. The config's `mode` is only the first-run default: once the file
 * exists, it wins until someone changes it with setMode().
 */
export class RuntimeState {
  private readonly file: string;
  private state: StateFile;

  constructor(dir: string, private readonly defaults: { mode: Mode; outboundBlocked: boolean }) {
    this.file = path.join(dir, "runtime-state.json");
    this.state = this.read();
  }

  get mode(): Mode {
    return this.state.mode ?? this.defaults.mode;
  }

  /** Admin kill switch: when true, outbound network commands are hard-denied. */
  get outboundBlocked(): boolean {
    return this.state.outboundBlocked ?? this.defaults.outboundBlocked;
  }

  /** Persist a human's choice. Returns the new mode. */
  setMode(mode: Mode): Mode {
    this.state = { ...this.state, mode };
    this.write();
    return mode;
  }

  /** Persist the admin's outbound switch. Returns the new value. */
  setOutboundBlocked(blocked: boolean): boolean {
    this.state = { ...this.state, outboundBlocked: blocked };
    this.write();
    return blocked;
  }

  private read(): StateFile {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8")) as StateFile;
      const mode = modeSchema.safeParse(raw?.mode);
      const out: StateFile = {};
      if (mode.success) out.mode = mode.data;
      if (typeof raw?.outboundBlocked === "boolean") out.outboundBlocked = raw.outboundBlocked;
      return out;
    } catch {
      // Missing or unreadable file: fall back to the config defaults.
      return {};
    }
  }

  private write(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2) + "\n");
    fs.renameSync(tmp, this.file); // atomic: a crash mid-write never leaves a half file
  }
}

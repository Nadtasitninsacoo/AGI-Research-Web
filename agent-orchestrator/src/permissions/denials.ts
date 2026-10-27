import type { ToolCall } from "./types.js";

/**
 * Calls the user turned down this session. A repeat is refused without asking
 * again. Keyed on what the call does, not on cosmetic fields like `description`.
 */
export class DenialMemory {
  private readonly keys = new Set<string>();

  private key({ tool, input }: ToolCall): string {
    if (tool === "Bash") return `Bash\0${String(input.command ?? "").trim()}`;
    const { description: _ignored, ...rest } = input;
    return `${tool}\0${JSON.stringify(rest)}`;
  }

  add(call: ToolCall): void {
    this.keys.add(this.key(call));
  }

  has(call: ToolCall): boolean {
    return this.keys.has(this.key(call));
  }
}

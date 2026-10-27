import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { ORCH_ROOT } from "../util/paths.js";
import { configSchema, type AgentConfig } from "./schema.js";

/** Config with every path made absolute. */
export type ResolvedConfig = AgentConfig & { configFile: string };

export const DEFAULT_CONFIG_FILE = path.join(ORCH_ROOT, "agent.config.ts");

export async function loadConfig(file = process.env.AGENT_CONFIG ?? DEFAULT_CONFIG_FILE): Promise<ResolvedConfig> {
  const configFile = path.resolve(file);
  const mod = (await import(pathToFileURL(configFile).href)) as { default?: unknown };
  return resolveConfig(mod.default, configFile);
}

export function resolveConfig(raw: unknown, configFile: string): ResolvedConfig {
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid config in ${configFile}:\n${z.prettifyError(parsed.error)}`);
  }
  const c = parsed.data;
  const abs = (p: string) => path.resolve(path.dirname(configFile), p);
  return {
    ...c,
    configFile,
    targetRepo: abs(c.targetRepo),
    paths: {
      logs: abs(c.paths.logs),
      scratchpad: abs(c.paths.scratchpad),
      prompts: abs(c.paths.prompts),
      state: abs(c.paths.state),
      memory: abs(c.paths.memory),
      progress: abs(c.paths.progress),
    },
  };
}

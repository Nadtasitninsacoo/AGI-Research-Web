
export type Id = string | number;

export type RunMode = "single" | "team";

export type Agent = {
  id: Id;
  name: string;
  status?: string;
};

export type Experiment = {
  id: Id;
  name: string;
  description?: string;
};

export type ApiItem = Record<string, unknown>;

export type ExecutionOptions = {
  agents: Agent[];
  experiments: Experiment[];
};

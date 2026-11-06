export type AgentStatus =
  | "idle"
  | "running"
  | "paused"
  | "error"
  | "retired";

export type RemoteSessionStatus =
  | "WAITING"
  | "CONNECTED"
  | "DISCONNECTED"
  | "EXPIRED";

export type RemoteStatus = RemoteSessionStatus;

export type SavedPortTarget = {
  id?: string | number;
  ip?: string;
  port?: number;
  name?: string;
  status?: string;
};

export type TakeoverAgent = {
  id: number;
  name: string;
  description: string;
  model: string;
  status: AgentStatus;
  runs: number;
  succeeded: number;
  failed: number;
  avgScore: number | null;
};

export type TakeoverData = {
  ok: boolean;
  targets: SavedPortTarget[];
  agents: TakeoverAgent[];
  targetMessage?: string;
  agentMessage?: string;
};

export type RemoteActionResult =
  | {
      ok: true;
      sessionId: string;
      status: RemoteStatus;
      deviceName?: string;
      updatedAt?: number;
    }
  | {
      ok: false;
      message: string;
      expired?: boolean;
    };

export interface RemoteApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  viewerToken?: string;
}

export interface RemoteApiResponse {
  ok: boolean;
  status: number;
  data: unknown;
}

export interface ViewerCredentials {
  sessionId: string;
  viewerToken: string;
}

export interface RemoteFailure {
  ok: false;
  message: string;
  expired?: boolean;
}

export type RemoteSessionCreateResult =
  | {
      ok: true;
      sessionId: string;
      status: RemoteSessionStatus;
      viewerToken?: string;
      agentToken?: string;
      deviceName?: string;
    }
  | {
      ok: false;
      message: string;
      expired?: boolean;
    };

export type RemoteSessionReadResult =
  | {
      ok: true;
      sessionId: string;
      status: RemoteSessionStatus;
      deviceName?: string;
      updatedAt?: number;
    }
  | {
      ok: false;
      message: string;
      expired?: boolean;
      sessionId?: string;
      status?: RemoteSessionStatus;
    };
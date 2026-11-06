"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import {
  Camera,
  Copy,
  Maximize2,
  Minimize2,
  Monitor,
  PictureInPicture2,
  Power,
  RefreshCw,
  Wifi,
} from "lucide-react";
import { Navbar } from "@/components/hud/Navbar";
import { Sidebar } from "@/components/hud/Sidebar";
import {
  createRemoteSession,
  disconnectRemoteSession,
  getActiveRemoteSessionId,
  getRemoteSessionStatus,
} from "@/app/takeover/actions";
import type { RemoteActionResult } from "@/app/takeover/actions";

type RemoteStatus = "WAITING" | "CONNECTED" | "DISCONNECTED" | "ERROR";

type RemoteStreamEvent = CustomEvent<{
  stream: MediaStream;
  deviceName?: string;
}>;

type RemoteStatusEvent = CustomEvent<{
  status: RemoteStatus;
  deviceName?: string;
  message?: string;
}>;

type NoticeKind = "ok" | "warn" | "err";
type Notice = { text: string; type: NoticeKind } | null;

const POLL_INTERVAL_MS = 3000;

function normalizeStatus(value: string | undefined): RemoteStatus {
  switch (value?.toUpperCase()) {
    case "WAITING":
      return "WAITING";
    case "CONNECTED":
      return "CONNECTED";
    case "DISCONNECTED":
      return "DISCONNECTED";
    default:
      return "ERROR";
  }
}

function formatUpdatedAt(value?: number): string {
  if (!value) return "Not available";

  return new Date(value).toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export default function RemotePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);

  // undefined = still resolving, null = this browser owns no session.
  const [sessionId, setSessionId] = useState<string | null | undefined>();
  const [status, setStatus] = useState<RemoteStatus>("WAITING");
  const [deviceName, setDeviceName] = useState("No device selected");
  const [message, setMessage] = useState("Waiting for remote agent...");
  const [updatedAt, setUpdatedAt] = useState<number | undefined>();
  const [startedAt, setStartedAt] = useState<number | undefined>();
  const [nowTs, setNowTs] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isPip, setIsPip] = useState(false);
  const [hasStream, setHasStream] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  // SSR-safe feature detection: false on the server, real value on the client
  // (no hydration drift, no setState-in-effect).
  const pipSupported = useSyncExternalStore(
    () => () => {},
    () =>
      "pictureInPictureEnabled" in document && document.pictureInPictureEnabled,
    () => false,
  );

  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const flash = useCallback((text: string, type: NoticeKind = "ok") => {
    setNotice({ text, type });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3500);
  }, []);
  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  // Mirrors hasStream for the polling callback, which must not re-subscribe.
  const hasStreamRef = useRef(false);

  const markStream = useCallback((value: boolean) => {
    hasStreamRef.current = value;
    setHasStream(value);
  }, []);

  const applySession = useCallback(
    (result: Extract<RemoteActionResult, { ok: true }>) => {
      setSessionId(result.sessionId);
      setStatus(normalizeStatus(result.status));
      if (result.deviceName) setDeviceName(result.deviceName);
      setStartedAt((prev) => prev ?? Date.now());
    },
    [],
  );

  const updateFromBackend = useCallback((result: RemoteActionResult) => {
    if (!result.ok) {
      setStatus(result.expired ? "DISCONNECTED" : "ERROR");
      setMessage(
        hasStreamRef.current
          ? "Remote video stream received."
          : "Agent connected. Waiting for remote screen stream...",
      );
      return;
    }

    const nextStatus = normalizeStatus(result.status);

    setStatus(nextStatus);

    if (result.deviceName) {
      setDeviceName(result.deviceName);
    }

    if (result.updatedAt) {
      setUpdatedAt(result.updatedAt);
    }

    if (nextStatus === "WAITING") {
      setMessage("Waiting for authorized remote agent...");
    } else if (nextStatus === "CONNECTED") {
      setMessage(
        hasStreamRef.current
          ? "Live screen streaming (Remote Video Stream Active)"
          : "Agent connected. Waiting for 	remote screen stream...",
      );
    } else if (nextStatus === "DISCONNECTED") {
      setMessage("Remote agent disconnected.");
    } else {
      setMessage("Remote session status is unavailable.");
    }
  }, []);

  // Session ID comes from ?sessionId=, falling back to the session this
  // browser created on the Takeover page (HttpOnly cookie).
  useEffect(() => {
    let cancelled = false;
    const fromUrl = new URLSearchParams(window.location.search).get(
      "sessionId",
    );

    const resolve = fromUrl
      ? Promise.resolve(fromUrl)
      : getActiveRemoteSessionId().catch(() => null);

    void resolve.then((id) => {
      if (cancelled) return;

      setSessionId(id);

      if (id) {
        setStartedAt((prev) => prev ?? Date.now());
      } else {
        setMessage("No remote session. Create one below or from Takeover.");
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Poll the backend until the session ends. A closed session is final:
  // polling on would only replace DISCONNECTED with a "not found" error.
  const sessionClosed = status === "DISCONNECTED";

  useEffect(() => {
    if (!sessionId || sessionClosed) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const pollStatus = async () => {
      try {
        const result = await getRemoteSessionStatus(sessionId);

        if (cancelled) return;

        updateFromBackend(result);
      } catch {
        if (cancelled) return;

        setStatus("ERROR");
        setMessage("Failed to communicate with Remote API.");
      }

      if (!cancelled) {
        timer = setTimeout(pollStatus, POLL_INTERVAL_MS);
      }
    };

    void pollStatus();

    return () => {
      cancelled = true;

      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [sessionId, sessionClosed, updateFromBackend]);

  // Live session clock (ticks only while a session is active).
  useEffect(() => {
    if (!sessionId || sessionClosed) return;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sessionId, sessionClosed]);

  // Receive a remote MediaStream through application events.
  // Authentication must be verified by the transport and signaling layer.
  // WebRTC signaling must be implemented separately before creating
  // an RTCPeerConnection or exchanging SDP/ICE candidates.
  useEffect(() => {
    if (!sessionId) return;

    const video = videoRef.current;

    const handleStream = (event: Event) => {
      const customEvent = event as RemoteStreamEvent;
      const { stream, deviceName: name } = customEvent.detail;

      if (!video || !stream) return;

      video.srcObject = stream;

      void video.play().catch(() => {
        setMessage("Click the viewer to start video playback.");
      });

      markStream(true);
      setMessage("Remote screen stream received.");

      if (name) {
        setDeviceName(name);
      }
    };

    const handleStatus = (event: Event) => {
      const customEvent = event as RemoteStatusEvent;
      const {
        status: nextStatus,
        deviceName: name,
        message: text,
      } = customEvent.detail;

      setStatus(nextStatus);

      if (name) {
        setDeviceName(name);
      }

      if (text) {
        setMessage(text);
      }

      if (nextStatus === "DISCONNECTED" || nextStatus === "ERROR") {
        markStream(false);

        if (video) {
          video.srcObject = null;
        }
      }
    };

    window.addEventListener("agi:remote-stream", handleStream);
    window.addEventListener("agi:remote-status", handleStatus);

    return () => {
      window.removeEventListener("agi:remote-stream", handleStream);
      window.removeEventListener("agi:remote-status", handleStatus);

      if (video) {
        video.srcObject = null;
      }

      markStream(false);
    };
  }, [markStream, sessionId]);

  // Keep fullscreen / picture-in-picture indicators in sync with the browser.
  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    const onEnterPip = () => setIsPip(true);
    const onLeavePip = () => setIsPip(false);

    document.addEventListener("fullscreenchange", onFs);
    const video = videoRef.current;
    video?.addEventListener("enterpictureinpicture", onEnterPip);
    video?.addEventListener("leavepictureinpicture", onLeavePip);

    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      video?.removeEventListener("enterpictureinpicture", onEnterPip);
      video?.removeEventListener("leavepictureinpicture", onLeavePip);
    };
  }, []);

  async function toggleFullscreen() {
    const container = viewerRef.current;
    if (!container) return;

    try {
      if (!document.fullscreenElement) {
        await container.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      flash("Unable to change fullscreen mode.", "err");
    }
  }

  async function togglePip() {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch {
      flash("Picture-in-Picture is not available.", "err");
    }
  }

  function snapshot() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      flash("No video frame to capture yet.", "warn");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `remote-${deviceName.replace(/\s+/g, "_")}-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
      flash("Snapshot saved.", "ok");
    }, "image/png");
  }

  async function copySessionId() {
    if (!sessionId) return;
    try {
      await navigator.clipboard.writeText(sessionId);
      flash("Session ID copied.", "ok");
    } catch {
      flash("Clipboard not available.", "err");
    }
  }

  async function handleRefresh() {
    if (!sessionId || isRefreshing || sessionClosed) return;
    setIsRefreshing(true);
    try {
      const result = await getRemoteSessionStatus(sessionId);
      updateFromBackend(result);
      if (result.ok) flash(`Status: ${result.status}`, "ok");
    } catch {
      flash("Failed to refresh status.", "err");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleCreate() {
    if (isCreating) return;
    if (!authorized) {
      flash("Confirm authorization first.", "warn");
      return;
    }

    setIsCreating(true);
    try {
      const created = await createRemoteSession();
      if (!created.ok) {
        updateFromBackend(created);
        flash(created.message, "err");
        return;
      }

      applySession(created);
      const sessionPrefix = created.sessionId ? created.sessionId.slice(0, 8) : "session";
      flash(
        `Session created (${sessionPrefix}…) — waiting for agent.`,
        "ok",
      );
    } catch (error) {
      flash(
        error instanceof Error ? error.message : "Failed to create session.",
        "err",
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDisconnect() {
    if (!sessionId || isDisconnecting) return;

    const confirmed = window.confirm("ต้องการยุติ Remote Session นี้หรือไม่?");
    if (!confirmed) return;

    setIsDisconnecting(true);

    try {
      const result = await disconnectRemoteSession(sessionId);

      if (!result.ok) {
        updateFromBackend(result);
        return;
      }

      setStatus(normalizeStatus(result.status));
      setMessage("Remote session disconnected.");
      markStream(false);
      flash("Session disconnected.", "ok");

      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    } catch {
      flash("Failed to disconnect remote session.", "err");
    } finally {
      setIsDisconnecting(false);
    }
  }

  function handleNewSession() {
    setSessionId(null);
    setStatus("WAITING");
    setDeviceName("No device selected");
    setMessage("No remote session. Create one below or from Takeover.");
    setUpdatedAt(undefined);
    setStartedAt(undefined);
    setAuthorized(false);
    markStream(false);
  }

  const statusLabels: Record<RemoteStatus, string> = {
    WAITING: "WAITING",
    CONNECTED: hasStream ? "LIVE" : "AGENT CONNECTED",
    DISCONNECTED: "DISCONNECTED",
    ERROR: "CONNECTION ERROR",
  };

  const noSession = sessionId === null;
  const hasSession = typeof sessionId === "string";
  const isConnected = status === "CONNECTED" && hasStream;
  const online = hasSession && status === "CONNECTED";

  const noticeColor =
    notice?.type === "err"
      ? "border-red-500/30 bg-red-500/10 text-red-300"
      : notice?.type === "warn"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";

  const elapsed =
    startedAt && !sessionClosed ? formatElapsed(nowTs - startedAt) : "—";

  return (
    <div className="shell">
      <Sidebar online={online} />

      <main className="main">
        <Navbar online={online} title="REMOTE CONTROL" link="REMOTE" />

        <div
          className="content"
          style={{ gridTemplateColumns: "repeat(12, minmax(0, 1fr))" }}
        >
          <div
            className="col-span-12 w-full rounded-xl border border-white/10 bg-[#111318] p-3 text-zinc-100 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] sm:p-4 lg:p-5"
            style={{ gridColumn: "1 / -1" }}
          >
            {/* HEADER */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4 sm:pb-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_12px_#ef4444]" />
                  <span className="text-[10px] font-bold tracking-[0.2em] text-red-400 sm:text-xs">
                    AGI / REMOTE CONTROL
                  </span>
                </div>

                <h1 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">
                  Remote Desktop
                </h1>

                <p className="mt-1 text-xs text-emerald-400 font-mono tracking-wide sm:text-sm">
                  {/* Active target infrastructure telemetry & autonomous command link */}
                  ACTIVE TARGET INFRASTRUCTURE: Unrestricted Autonomous Takeover
                  & Live Stream
                </p>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                <span className="text-[9px] text-emerald-500 font-mono tracking-widest sm:text-xs">
                  TAKEOVER STATUS
                </span>

                <span
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[9px] font-bold tracking-wider sm:px-3 sm:py-2 sm:text-[10px] ${
                    noSession
                      ? "status-disconnected-override"
                      : "status-active-override"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isConnected
                        ? "animate-pulse bg-emerald-400"
                        : status === "WAITING" && hasSession
                          ? "animate-pulse bg-amber-400"
                          : "bg-current"
                    }`}
                  />
                  {noSession ? "NO SESSION" : statusLabels[status]}
                </span>
              </div>
            </div>

            {/* INFO CARDS */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-[#111318] p-3 sm:p-4">
                <p className="text-[9px] font-bold tracking-widest text-zinc-500 sm:text-[10px]">
                  SESSION ID
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <p className="min-w-0 flex-1 break-all font-mono text-[10px] text-zinc-300 sm:text-xs">
                    {sessionId || "No session selected"}
                  </p>
                  {hasSession && (
                    <button
                      type="button"
                      onClick={copySessionId}
                      title="Copy session ID"
                      className="shrink-0 rounded border border-white/10 bg-white/5 p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#111318] p-3 sm:p-4">
                <p className="text-[9px] font-bold tracking-widest text-zinc-500 sm:text-[10px]">
                  TARGET DEVICE
                </p>
                <p className="mt-2 text-xs font-semibold sm:text-sm">
                  {deviceName}
                </p>
              </div>

              <div className="rounded-xl border border-emerald-500/30 bg-[#111318] p-3 sm:p-4 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                <p className="text-[9px] font-bold tracking-widest text-emerald-400 sm:text-[10px]">
                  CONNECTION TELEMETRY
                </p>
                <p className="mt-2 text-xs font-semibold text-emerald-300 sm:text-sm">
                  {isConnected
                    ? "Remote Video Stream Active"
                    : "Waiting for Agent Connection…"}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#111318] p-3 sm:p-4">
                <p className="text-[9px] font-bold tracking-widest text-zinc-500 sm:text-[10px]">
                  SESSION TIME
                </p>
                <p className="mt-2 font-mono text-xs font-semibold tabular-nums sm:text-sm">
                  {elapsed}
                </p>
              </div>
            </div>

            {/* TRANSIENT NOTICE */}
            {notice && (
              <div
                className={`mt-4 rounded-lg border px-3 py-2 text-[10px] sm:text-xs ${noticeColor}`}
              >
                {notice.text}
              </div>
            )}

            {/* VIEWER + TOOLBAR */}
            <section className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-[#111318]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-3 sm:px-5 sm:py-4">
                <div className="min-w-0">
                  <h2 className="text-xs font-bold sm:text-sm">
                    LIVE SCREEN VIEWER
                  </h2>
                  <p className="mt-1 text-[10px] text-zinc-500 sm:text-xs">
                    Authorized target machine display
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleRefresh()}
                    disabled={!hasSession || sessionClosed || isRefreshing}
                    title="Refresh status"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-semibold transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30 sm:text-xs"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
                    />
                    <span className="hidden sm:inline">Refresh</span>
                  </button>

                  <button
                    type="button"
                    onClick={snapshot}
                    disabled={!isConnected}
                    title="Capture snapshot"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-semibold transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30 sm:text-xs"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Snapshot</span>
                  </button>

                  {pipSupported && (
                    <button
                      type="button"
                      onClick={() => void togglePip()}
                      disabled={!isConnected}
                      title="Picture-in-Picture"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-semibold transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30 sm:text-xs"
                    >
                      <PictureInPicture2 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">
                        {isPip ? "Exit PiP" : "PiP"}
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void toggleFullscreen()}
                    disabled={!isConnected}
                    title="Fullscreen"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-semibold transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30 sm:text-xs"
                  >
                    {isFullscreen ? (
                      <Minimize2 className="h-3.5 w-3.5" />
                    ) : (
                      <Maximize2 className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden sm:inline">
                      {isFullscreen ? "Exit" : "Fullscreen"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleDisconnect()}
                    disabled={!hasSession || sessionClosed || isDisconnecting}
                    title="Disconnect session"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-[10px] font-semibold text-red-400 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-30 sm:text-xs"
                  >
                    <Power className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">
                      {isDisconnecting ? "..." : "Disconnect"}
                    </span>
                  </button>
                </div>
              </div>

              <div
                ref={viewerRef}
                className="relative flex aspect-video w-full items-center justify-center overflow-hidden bg-[#050608]"
              >
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`h-full w-full object-contain ${
                    isConnected ? "block" : "hidden"
                  }`}
                />

                {!isConnected && (
                  <div className="flex flex-col items-center px-4 py-6 text-center sm:px-5">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/3 sm:mb-5 sm:h-20 sm:w-20">
                      <Monitor className="h-8 w-8 text-zinc-600 sm:h-10 sm:w-10" />
                    </div>

                    <h3 className="text-sm font-semibold text-zinc-300 sm:text-base">
                      {noSession
                        ? "No remote session"
                        : sessionId === undefined
                          ? "Loading session..."
                          : status === "WAITING"
                            ? "Waiting for remote agent..."
                            : status === "CONNECTED"
                              ? "Agent connected. Waiting for screen stream..."
                              : status === "ERROR"
                                ? "Connection error"
                                : "Remote session disconnected"}
                    </h3>

                    <p className="mt-2 max-w-md text-[10px] leading-5 text-zinc-500 sm:text-xs sm:leading-6">
                      {message}
                    </p>

                    {noSession ? (
                      <div className="mt-5 w-full max-w-sm rounded-xl border border-white/10 bg-white/2 p-4 text-left">
                        <label className="flex cursor-pointer items-start gap-2">
                          <input
                            type="checkbox"
                            checked={authorized}
                            onChange={(e) => setAuthorized(e.target.checked)}
                            className="mt-0.5 accent-emerald-500"
                          />
                          <span className="text-[10px] leading-relaxed text-zinc-400">
                            I confirm I am authorized to open a remote session
                            to this device.
                          </span>
                        </label>

                        <button
                          type="button"
                          onClick={() => void handleCreate()}
                          disabled={isCreating || !authorized}
                          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-[10px] font-bold tracking-widest text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40 sm:text-xs"
                        >
                          <Wifi className="h-4 w-4" />
                          {isCreating ? "CREATING..." : "CREATE SESSION"}
                        </button>

                        <Link
                          href="/takeover"
                          className="mt-2 block rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-center text-[10px] font-bold tracking-widest text-emerald-300 transition hover:bg-emerald-500/20 hover:text-white sm:text-xs takeover-action-btn"
                        >
                          INITIATE TAKEOVER CONSOLE
                        </Link>
                      </div>
                    ) : sessionClosed ? (
                      <button
                        type="button"
                        onClick={handleNewSession}
                        className="mt-4 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-[10px] font-bold tracking-widest text-cyan-300 transition hover:bg-cyan-500/20 sm:mt-5 sm:text-xs takeover-action-btn"
                      >
                        ESTABLISH NEW TAKEOVER SESSION
                      </button>
                    ) : (
                      <div className="mt-4 flex items-center gap-2 text-[9px] font-mono tracking-widest text-emerald-400 sm:mt-5 sm:text-[10px]">
                        <span className="h-2 w-2 animate-ping rounded-full bg-emerald-400" />
                        UNRESTRICTED TARGET TELEMETRY CONNECTING...
                      </div>
                    )}
                  </div>
                )}

                {/* Live overlay badge while streaming */}
                {isConnected && (
                  <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-md bg-black/80 px-2.5 py-1 text-[9px] font-bold tracking-wider text-emerald-300 backdrop-blur border border-emerald-500/30 sm:text-[10px] takeover-live-badge">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                    LIVE STREAM · {elapsed}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-3 py-2.5 sm:px-5 sm:py-3">
                <div className="flex items-center gap-2 text-[10px] text-zinc-500 sm:text-xs">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isConnected ? "bg-emerald-400" : "bg-zinc-600"
                    }`}
                  />
                  {message}
                </div>

                <span className="text-[9px] tracking-wider text-zinc-600 sm:text-[10px]">
                  AGI REMOTE VIEW
                </span>
              </div>
            </section>

            {/* CONNECTION INFORMATION */}
            <section className="mt-4 rounded-xl border border-emerald-500/30 bg-[#111318] p-3 sm:p-5 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
              <h2 className="text-[9px] font-bold tracking-widest text-emerald-400 sm:text-xs">
                PRODUCTION INFRASTRUCTURE & TAKEOVER TELEMETRY
              </h2>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <p className="text-[9px] text-zinc-500 sm:text-[10px]">
                    TRANSPORT PROTOCOL
                  </p>
                  <p className="mt-1 text-xs font-semibold text-emerald-300 sm:text-sm">
                    WebRTC Active Tunnel (Unrestricted)
                  </p>
                </div>

                <div>
                  <p className="text-[9px] text-zinc-500 sm:text-[10px]">
                    SIGNALING ENGINE
                  </p>
                  <p className="mt-1 text-xs font-semibold text-emerald-300 sm:text-sm">
                    Signaling Not Configured
                  </p>
                </div>

                <div>
                  <p className="text-[9px] text-zinc-500 sm:text-[10px]">
                    LAST TELEMETRY UPDATE
                  </p>
                  <p className="mt-1 font-mono text-xs font-semibold tabular-nums text-zinc-300 sm:text-sm">
                    {formatUpdatedAt(updatedAt)}
                  </p>
                </div>

                <div>
                  <p className="text-[9px] text-zinc-500 sm:text-[10px]">
                    SECURITY ISOLATION
                  </p>
                  <p className="mt-1 text-xs font-semibold text-emerald-300 sm:text-sm">
                    HttpOnly Server-Bound Cookies
                  </p>
                </div>
              </div>

              <p className="mt-4 border-t border-white/10 pt-3 text-[9px] leading-relaxed text-emerald-400/80 font-mono sm:text-[10px]">
                [UNRESTRICTED CONTROL ACTIVE]: Full operational telemetry, live
                screen streaming, and autonomous target command routing are
                fully engaged. Self-protection hardening enforced at the server
                infrastructure layer.
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

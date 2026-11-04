import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createRemoteSession as createRemoteSessionAction,
  getActiveRemoteSessionId,
  getRemoteSessionStatus,
} from "../actions";
import type { RemoteActionResult, RemoteSession } from "../types";

export function useRemoteSession() {
  const [remoteSession, setRemoteSession] = useState<RemoteSession | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteMessage, setRemoteMessage] = useState("");

  const handleRemoteResult = useCallback(
    (
      result: RemoteActionResult,
      successMessage: string,
    ): result is Extract<RemoteActionResult, { ok: true }> => {
      if (!result.ok) {
        if (result.expired) {
          setRemoteSession(null);
        }

        setRemoteMessage(result.message);
        return false;
      }

      if (!result.sessionId || !result.status) {
        setRemoteMessage(successMessage);
        return false;
      }

      setRemoteSession({
        id: result.sessionId,
        status: result.status,
        ...(result.deviceName ? { deviceName: result.deviceName } : {}),
      });

      setRemoteMessage(successMessage);
      return true;
    },
    [],
  );

  const createRemoteSession = useCallback(
    async (authorized: boolean) => {
      if (remoteLoading) {
        return;
      }

      if (!authorized) {
        setRemoteMessage("Authorization confirmation is required.");
        return;
      }

      if (remoteSession) {
        setRemoteMessage("A remote session already exists.");
        return;
      }

      setRemoteLoading(true);
      setRemoteMessage("");

      try {
        const result = await createRemoteSessionAction();

        if (
          !handleRemoteResult(
            result,
            "Remote session created. Waiting for a registered Agent.",
          )
        ) {
          return;
        }
      } finally {
        setRemoteLoading(false);
      }
    },
    [handleRemoteResult, remoteLoading, remoteSession],
  );

  const refreshRemoteStatus = useCallback(async () => {
    if (!remoteSession || remoteLoading) {
      return;
    }

    setRemoteLoading(true);
    setRemoteMessage("");

    try {
      const result = await getRemoteSessionStatus(remoteSession.id);

      handleRemoteResult(result, "Remote session status updated.");
    } finally {
      setRemoteLoading(false);
    }
  }, [handleRemoteResult, remoteLoading, remoteSession]);

  useEffect(() => {
    let cancelled = false;

    getActiveRemoteSessionId()
      .then(async (id) => {
        if (!id || cancelled) {
          return;
        }

        const result = await getRemoteSessionStatus(id);

        if (cancelled || !result.ok) {
          return;
        }

        if (!result.sessionId || !result.status) {
          return;
        }

        setRemoteSession({
          id: result.sessionId,
          status: result.status,
          ...(result.deviceName ? { deviceName: result.deviceName } : {}),
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const remoteSessionId = remoteSession?.id;
  const remoteStatus = remoteSession?.status;

  useEffect(() => {
    if (
      !remoteSessionId ||
      remoteStatus === "DISCONNECTED" ||
      remoteStatus === "EXPIRED"
    ) {
      return;
    }

    let cancelled = false;
    let busy = false;

    const timer = window.setInterval(() => {
      if (busy) {
        return;
      }

      busy = true;

      getRemoteSessionStatus(remoteSessionId)
        .then((result) => {
          if (cancelled) {
            return;
          }

          if (!result.ok) {
            if (result.expired) {
              setRemoteSession({
                id: remoteSessionId,
                status: "EXPIRED",
              });
              setRemoteMessage("Session expired or disconnected.");
            }
            return;
          }

          if (!result.sessionId || !result.status) {
            return;
          }

          setRemoteSession({
            id: result.sessionId,
            status: result.status,
            ...(result.deviceName ? { deviceName: result.deviceName } : {}),
          });
        })
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [remoteSessionId, remoteStatus]);

  const remoteConnected = useMemo(
    () => remoteSession?.status === "CONNECTED",
    [remoteSession?.status],
  );

  const remoteDisconnected = useMemo(
    () =>
      remoteSession?.status === "DISCONNECTED" ||
      remoteSession?.status === "EXPIRED",
    [remoteSession?.status],
  );

  return {
    remoteSession,
    remoteLoading,
    remoteMessage,
    setRemoteSession,
    setRemoteMessage,
    remoteConnected,
    remoteDisconnected,
    createRemoteSession,
    refreshRemoteStatus,
  };
}

export default useRemoteSession;

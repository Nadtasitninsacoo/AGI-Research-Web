import { useCallback, useEffect, useRef, useState } from "react";

import { NOTIFICATION_DURATION } from "../constants";
import type { ToastNotice } from "../types";

export function useNotifications() {
  const [notifications, setNotifications] = useState<ToastNotice[]>([]);
  const timeoutIdsRef = useRef<number[]>([]);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    (title: string, message: string, type: ToastNotice["type"] = "info") => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      setNotifications((current) => [...current, { id, title, message, type }]);

      const timer = window.setTimeout(() => {
        dismissNotification(id);

        timeoutIdsRef.current = timeoutIdsRef.current.filter(
          (item) => item !== timer,
        );
      }, NOTIFICATION_DURATION);

      timeoutIdsRef.current.push(timer);
    },
    [dismissNotification],
  );

  const clearNotifications = useCallback(() => {
    timeoutIdsRef.current.forEach((timer) => window.clearTimeout(timer));
    timeoutIdsRef.current = [];
    setNotifications([]);
  }, []);

  useEffect(() => {
    return () => {
      timeoutIdsRef.current.forEach((timer) => window.clearTimeout(timer));
      timeoutIdsRef.current = [];
    };
  }, []);

  return {
    notifications,
    notify,
    dismissNotification,
    clearNotifications,
  };
}

export default useNotifications;


import type { ToastNotice } from "../types";

type NotificationStackProps = {
  notifications: ToastNotice[];
  onDismiss: (id: string) => void;
};

export function NotificationStack({
  notifications,
  onDismiss,
}: NotificationStackProps) {
  return (
    <div className="fixed right-5 top-5 z-9999 flex w-90 max-w-[calc(100vw-40px)] flex-col gap-3">
      {notifications.map((item) => (
        <div
          key={item.id}
          role="status"
          className={`rounded-xl border bg-slate-950/95 p-4 shadow-2xl backdrop-blur ${
            item.type === "success"
              ? "border-emerald-500/40"
              : item.type === "error"
                ? "border-red-500/40"
                : item.type === "warning"
                  ? "border-amber-500/40"
                  : "border-sky-500/40"
          }`}
        >
          <div className="flex items-start gap-3">
            <span
              className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                item.type === "success"
                  ? "bg-emerald-400"
                  : item.type === "error"
                    ? "bg-red-400"
                    : item.type === "warning"
                      ? "bg-amber-400"
                      : "bg-sky-400"
              }`}
            />

            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold tracking-wider text-white">
                {item.title}
              </p>

              <p className="mt-1 text-xs text-slate-400">
                {item.message}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              className="text-slate-500 hover:text-white"
              aria-label="ปิดการแจ้งเตือน"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

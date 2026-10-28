"use client";

import { useState } from "react";
import { Icon } from "./Icon";
import { NotifySettings } from "./NotifySettings";

/**
 * Sidebar "Settings" entry — opens the floating Telegram-notification modal.
 * Rendered as a nav-item button so it sits inline with the other links.
 */
export function SettingsNav() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="nav-item nav-button" onClick={() => setOpen(true)} title="Settings">
        <Icon name="settings" />
        <span>Settings</span>
      </button>
      <NotifySettings open={open} onClose={() => setOpen(false)} />
    </>
  );
}

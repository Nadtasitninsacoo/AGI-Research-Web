"use client";

import { useRouter } from "next/navigation";

/** Global "back" control shown in the navbar on every page. Falls back to the
 *  overview when there is no in-app history to return to. */
export function BackButton() {
  const router = useRouter();

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  };

  return (
    <button type="button" className="nav-back" onClick={goBack} aria-label="ย้อนกลับ" title="ย้อนกลับ">
      <span aria-hidden="true">←</span>
      <span className="nav-back-label">ย้อนกลับ</span>
    </button>
  );
}

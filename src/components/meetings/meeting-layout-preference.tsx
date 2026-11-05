"use client";

import { useState } from "react";

/** Presentation only: switching layouts keeps every editor mounted. */
export function MeetingLayoutPreference({
  children,
}: {
  children: React.ReactNode;
}) {
  const [focused, setFocused] = useState(true);

  return (
    <div
      data-meeting-workspace
      data-meeting-layout={focused ? "focused" : "classic"}
    >
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          aria-pressed={focused}
          className="rounded px-3 py-2 text-xs font-semibold text-brand hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-brand"
          onClick={() => setFocused((value) => !value)}
        >
          {focused ? "Vis klassisk layout" : "Vis roligt layout"}
        </button>
      </div>
      {children}
    </div>
  );
}

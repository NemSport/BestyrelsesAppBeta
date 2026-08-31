"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";

import { QuickActionMenu } from "@/components/layout/quick-action-menu";
import type { MeetingCapabilities } from "@/lib/permissions";

type CommitteeOption = {
  id: string;
  name: string;
  capabilities: MeetingCapabilities;
};

export function QuickActionHeaderSlot({
  organizationId,
  committees,
  style,
}: {
  organizationId: string;
  committees: CommitteeOption[];
  style?: CSSProperties;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(document.getElementById("app-header-quick-action"));
  }, []);

  useEffect(() => {
    const themeRoot = document.querySelector<HTMLElement>(".app-frame");
    if (!themeRoot || !style) return;

    const previousValues = new Map<string, string>();
    const appliedValues = new Map<string, string>();
    for (const [property, value] of Object.entries(style)) {
      if (value === undefined || value === null) continue;
      const nextValue = String(value);
      previousValues.set(property, themeRoot.style.getPropertyValue(property));
      appliedValues.set(property, nextValue);
      themeRoot.style.setProperty(property, nextValue);
    }

    return () => {
      for (const [property, value] of previousValues) {
        if (
          themeRoot.style.getPropertyValue(property) !==
          appliedValues.get(property)
        ) {
          continue;
        }
        if (value) themeRoot.style.setProperty(property, value);
        else themeRoot.style.removeProperty(property);
      }
    };
  }, [style]);

  if (!target) return null;

  return createPortal(
    <div style={style}>
      <QuickActionMenu
        committees={committees}
        organizationId={organizationId}
        style={style}
      />
    </div>,
    target,
  );
}

"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";

import { QuickActionMenu } from "@/components/layout/quick-action-menu";

type CommitteeOption = {
  id: string;
  name: string;
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

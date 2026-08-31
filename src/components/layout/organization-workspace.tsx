import { OrganizationNav } from "@/components/layout/organization-nav";
import { ActionRefresh } from "@/components/actions/action-refresh";
import { QuickActionHeaderSlot } from "@/components/layout/quick-action-header-slot";
import type { SafeOrganizationBranding } from "@/lib/organization-branding";
import type { MeetingCapabilities } from "@/lib/permissions";

export function OrganizationWorkspace({
  children,
  organizationId,
  organizationName,
  branding,
  committees = [],
  canManageTrash = false,
  activeActionCount = 0,
  nextActionRefreshAt = null,
}: {
  children: React.ReactNode;
  organizationId: string;
  organizationName?: string;
  branding?: SafeOrganizationBranding;
  committees?: Array<{
    id: string;
    name: string;
    capabilities: MeetingCapabilities;
  }>;
  canManageTrash?: boolean;
  activeActionCount?: number;
  nextActionRefreshAt?: string | null;
}) {
  return (
    <div className="org-layout" style={branding?.cssVariables}>
      <ActionRefresh nextRefreshAt={nextActionRefreshAt} />
      <QuickActionHeaderSlot
        committees={committees}
        organizationId={organizationId}
        style={branding?.cssVariables}
      />
      <OrganizationNav
        activeActionCount={activeActionCount}
        canManageTrash={canManageTrash}
        committees={committees}
        logoUrl={branding?.logoUrl ?? null}
        organizationId={organizationId}
        organizationName={organizationName}
      />
      <div className="org-layout-content">{children}</div>
    </div>
  );
}

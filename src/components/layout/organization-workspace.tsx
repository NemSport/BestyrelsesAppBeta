import { OrganizationNav } from "@/components/layout/organization-nav";
import { ActionRefresh } from "@/components/actions/action-refresh";
import { QuickActionHeaderSlot } from "@/components/layout/quick-action-header-slot";
import type { SafeOrganizationBranding } from "@/lib/organization-branding";
import type { MeetingCapabilities } from "@/lib/permissions";

export function OrganizationWorkspace({
  children,
  organizationId,
  branding,
  committees = [],
  canManageOrganization = false,
  nextActionRefreshAt = null,
}: {
  children: React.ReactNode;
  organizationId: string;
  branding?: SafeOrganizationBranding;
  committees?: Array<{
    id: string;
    name: string;
    capabilities: MeetingCapabilities;
  }>;
  canManageOrganization?: boolean;
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
        canManageOrganization={canManageOrganization}
        organizationId={organizationId}
      />
      <div className="org-layout-content">{children}</div>
    </div>
  );
}

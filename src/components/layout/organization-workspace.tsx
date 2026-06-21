import { OrganizationNav } from "@/components/layout/organization-nav";
import { QuickActionHeaderSlot } from "@/components/layout/quick-action-header-slot";
import type { SafeOrganizationBranding } from "@/lib/organization-branding";

export function OrganizationWorkspace({
  children,
  organizationId,
  organizationName,
  branding,
  committees = [],
}: {
  children: React.ReactNode;
  organizationId: string;
  organizationName?: string;
  branding?: SafeOrganizationBranding;
  committees?: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="org-layout" style={branding?.cssVariables}>
      <QuickActionHeaderSlot
        committees={committees}
        organizationId={organizationId}
        style={branding?.cssVariables}
      />
      <OrganizationNav
        logoUrl={branding?.logoUrl ?? null}
        organizationId={organizationId}
        organizationName={organizationName}
      />
      <div className="org-layout-content">
        {children}
      </div>
    </div>
  );
}

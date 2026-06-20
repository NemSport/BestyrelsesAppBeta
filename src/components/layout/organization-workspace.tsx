import { OrganizationNav } from "@/components/layout/organization-nav";
import { QuickActionMenu } from "@/components/layout/quick-action-menu";

export function OrganizationWorkspace({
  children,
  organizationId,
  organizationName,
  committees = [],
}: {
  children: React.ReactNode;
  organizationId: string;
  organizationName?: string;
  committees?: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="org-layout">
      <OrganizationNav
        organizationId={organizationId}
        organizationName={organizationName}
      />
      <div className="org-layout-content">
        <div className="org-workspace-topbar">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Hurtig handling
            </p>
            <p className="mt-0.5 truncate text-sm text-muted">
              Opret nyt uden at forlade organisationskonteksten.
            </p>
          </div>
          <QuickActionMenu
            committees={committees}
            organizationId={organizationId}
          />
        </div>
        {children}
      </div>
    </div>
  );
}

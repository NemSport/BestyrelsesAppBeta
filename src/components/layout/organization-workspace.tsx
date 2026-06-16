import { OrganizationNav } from "@/components/layout/organization-nav";

export function OrganizationWorkspace({
  children,
  organizationId,
  organizationName,
}: {
  children: React.ReactNode;
  organizationId: string;
  organizationName?: string;
}) {
  return (
    <div className="org-layout">
      <OrganizationNav
        organizationId={organizationId}
        organizationName={organizationName}
      />
      <div className="org-layout-content">{children}</div>
    </div>
  );
}

import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { OrganizationService } from "@/services/organization-service";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const db = await createClient();
  const [{ user, profile }, memberships] = await Promise.all([
    new AuthService(db).getAuthenticatedUser(),
    new OrganizationService(db).listForCurrentUser(),
  ]);
  const organizations = memberships.flatMap((membership) =>
    membership.organizations
      ? [{ ...membership.organizations, role: membership.role }]
      : [],
  );
  return (
    <AppShell
      organizations={organizations}
      userLabel={profile?.full_name || user.email || "Medlem"}
    >
      {children}
    </AppShell>
  );
}

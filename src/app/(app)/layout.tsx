import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const db = await createClient();
  const { user, profile } = await new AuthService(db).getAuthenticatedUser();
  return (
    <AppShell userLabel={profile?.full_name || user.email || "Medlem"}>
      {children}
    </AppShell>
  );
}

import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";

export default async function CommitteeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ organizationId: string; committeeId: string }>;
}) {
  const { organizationId, committeeId } = await params;
  const db = await createClient();
  const user = await new AuthService(db).requireUser();
  const context = await new AuthorizationService(db)
    .requireCommitteeMember(organizationId, committeeId, user.id)
    .catch(() => null);
  if (!context) notFound();

  return <>{children}</>;
}

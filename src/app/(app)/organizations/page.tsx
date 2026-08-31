import { OrganizationSelector } from "@/components/organizations/organization-selector";
import { createClient } from "@/lib/supabase/server";
import { OrganizationService } from "@/services/organization-service";

export default async function OrganizationsPage() {
  const db = await createClient();
  const organizations = await new OrganizationService(db).listWorkspaceEntries();

  return <OrganizationSelector organizations={organizations} />;
}

import Link from "next/link";

import { OrganizationTrash } from "@/components/trash/organization-trash";
import { PageHeader, buttonClassName } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { TrashService } from "@/services/trash-service";

export default async function DeletedOrganizationsPage() {
  const db = await createClient();
  const data = await new TrashService(db).getDeletedOrganizations();

  return (
    <div className="page-flow">
      <PageHeader
        actions={
          <Link
            className={buttonClassName({ variant: "secondary" })}
            href="/organizations"
          >
            Vælg organisation
          </Link>
        }
        description="Gendan organisationer, hvor du er ejer eller administrator. De kan stadig gendannes efter 30-dagesfristen."
        eyebrow="Organisationer"
        title="Papirkurv"
      />
      <OrganizationTrash data={data} overviewHref="/organizations" />
    </div>
  );
}

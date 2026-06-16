import { MemberAdministration } from "@/components/members/member-administration";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { OrganizationMemberService } from "@/services/organization-member-service";

export default async function OrganizationMembersPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const data = await new OrganizationMemberService(await createClient()).list(
    organizationId,
  );

  return (
    <>
      <PageHeader
        className="mb-8"
        description="Se organisationens medlemmer, deres roller og udvalgstilknytninger."
        eyebrow="Adgang og roller"
        title="Medlemmer"
      />
      <MemberAdministration organizationId={organizationId} {...data} />
    </>
  );
}

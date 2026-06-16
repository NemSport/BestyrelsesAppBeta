import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { OrganizationMemberService } from "@/services/organization-member-service";

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ organizationId: string; memberId: string }>;
  },
) {
  try {
    const { organizationId, memberId } = await params;
    const member = await new OrganizationMemberService(
      await createClient(),
    ).updateRole({
      ...(await request.json()),
      organizationId,
      userId: memberId,
    });
    return NextResponse.json({
      ...member,
      message: "Medlemmets rolle er opdateret.",
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ organizationId: string; memberId: string }>;
  },
) {
  try {
    const { organizationId, memberId } = await params;
    await new OrganizationMemberService(await createClient()).remove({
      organizationId,
      userId: memberId,
    });
    return NextResponse.json({
      removed: true,
      message: "Medlemmet er fjernet fra organisationen.",
    });
  } catch (error) {
    return apiError(error);
  }
}

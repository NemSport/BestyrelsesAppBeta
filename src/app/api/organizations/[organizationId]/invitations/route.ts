import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { OrganizationMemberService } from "@/services/organization-member-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const invitation = await new OrganizationMemberService(
      await createClient(),
    ).invite({
      ...(await request.json()),
      organizationId: (await params).organizationId,
    });
    return NextResponse.json(
      {
        ...invitation,
        message: "Invitationen er gemt og afventer accept.",
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}

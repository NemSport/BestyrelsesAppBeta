import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { OrganizationMemberService } from "@/services/organization-member-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const member = await new OrganizationMemberService(
      await createClient(),
    ).createManual({
      ...(await request.json()),
      organizationId: (await params).organizationId,
    });
    return NextResponse.json(
      {
        ...member,
        message: "Medlemmet er oprettet og kan nu logge ind.",
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}

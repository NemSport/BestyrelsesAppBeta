import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { OrganizationService } from "@/services/organization-service";

export async function GET() {
  try {
    return NextResponse.json(
      await new OrganizationService(await createClient()).listForCurrentUser(),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const organization = await new OrganizationService(await createClient()).create(
      await request.json(),
    );
    return NextResponse.json(organization, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

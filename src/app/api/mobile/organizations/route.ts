import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createBearerClient } from "@/lib/supabase/bearer";
import { OrganizationService } from "@/services/organization-service";

export async function GET(request: Request) {
  try {
    const organizations = await new OrganizationService(
      createBearerClient(request),
    ).listForCurrentUser();
    return NextResponse.json({ organizations });
  } catch (error) {
    return apiError(error);
  }
}

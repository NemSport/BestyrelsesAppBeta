import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { GlobalSearchService } from "@/services/global-search-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await params;
    const url = new URL(request.url);
    const data = await new GlobalSearchService(await createClient()).search({
      organizationId,
      query: url.searchParams.get("q") ?? "",
      category: url.searchParams.get("category"),
    });
    return NextResponse.json(data);
  } catch (error) {
    return apiError(error, { fallbackMessage: "Søgningen kunne ikke gennemføres. Prøv igen." });
  }
}

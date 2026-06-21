import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TableInsert } from "@/types/database";
import type { OrganizationBranding } from "@/types/domain";

const logoBucket = "organization-logos";

export class OrganizationBrandingRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findByOrganization(organizationId: string) {
    const { data, error } = await this.db
      .from("organization_branding")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error) throw error;
    return data as OrganizationBranding | null;
  }

  async upsert(input: TableInsert<"organization_branding">) {
    const { data, error } = await this.db
      .from("organization_branding")
      .upsert(input, { onConflict: "organization_id" })
      .select("*")
      .single();
    if (error) throw error;
    return data as OrganizationBranding;
  }

  async uploadLogo(
    storagePath: string,
    fileBody: ArrayBuffer,
    contentType: string,
  ) {
    const { error } = await this.db.storage.from(logoBucket).upload(
      storagePath,
      fileBody,
      {
        contentType,
        upsert: false,
      },
    );
    if (error) throw error;
  }

  async removeLogo(storagePath: string) {
    const { error } = await this.db.storage
      .from(logoBucket)
      .remove([storagePath]);
    if (error) throw error;
  }

  getLogoPublicUrl(storagePath: string) {
    const { data } = this.db.storage.from(logoBucket).getPublicUrl(storagePath);
    return data.publicUrl;
  }
}

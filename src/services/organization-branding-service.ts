import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveEmailTemplateBranding } from "@/lib/email-branding";
import { AppError } from "@/lib/errors";
import {
  organizationBrandingInputSchema,
  resolveOrganizationBranding,
} from "@/lib/organization-branding";
import { resolvePdfReportBranding } from "@/lib/pdf-branding";
import { OrganizationBrandingRepository } from "@/repositories/organization-branding-repository";
import { AuthService } from "@/services/auth-service";
import { AuthorizationService } from "@/services/authorization-service";
import type { Database } from "@/types/database";

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String(error.message);
  }
  return "";
}

function toLogoUploadError(error: unknown) {
  const message = toErrorMessage(error);
  const lower = message.toLowerCase();

  console.error("[organization-branding] Logo-upload fejlede", {
    name: error instanceof Error ? error.name : undefined,
    message,
  });

  if (lower.includes("bucket") || lower.includes("not found")) {
    return new AppError(
      "Logo-bucket findes ikke. Kør storage-migrationen.",
      500,
      "LOGO_BUCKET_NOT_CONFIGURED",
    );
  }
  if (
    lower.includes("row-level") ||
    lower.includes("permission") ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden")
  ) {
    return new AppError(
      "Du har ikke adgang til at uploade logo for denne organisation.",
      403,
      "LOGO_UPLOAD_FORBIDDEN",
    );
  }
  if (lower.includes("mime") || lower.includes("type")) {
    return new AppError(
      "Filtypen understøttes ikke. Brug PNG, JPG eller WEBP.",
      422,
      "UNSAFE_FILE_TYPE",
    );
  }
  if (lower.includes("size") || lower.includes("too large")) {
    return new AppError(
      "Logoet er for stort. Maks 2 MB.",
      422,
      "FILE_TOO_LARGE",
    );
  }
  if (lower.includes("check constraint") || lower.includes("logo_url")) {
    return new AppError(
      "Logo URL kunne ikke gemmes på organisationen.",
      500,
      "LOGO_URL_SAVE_FAILED",
    );
  }
  if (lower.includes("invalid key") || lower.includes("invalid path")) {
    return new AppError(
      "Logoets storage-sti er ugyldig.",
      500,
      "LOGO_STORAGE_PATH_INVALID",
    );
  }
  if (lower.includes("fetch failed") || lower.includes("network")) {
    return new AppError(
      "Logoet kunne ikke uploades til Storage. Tjek Supabase Storage-konfigurationen.",
      502,
      "LOGO_STORAGE_UNAVAILABLE",
    );
  }

  return new AppError(
    "Logoet kunne ikke uploades til Storage.",
    502,
    "LOGO_UPLOAD_FAILED",
  );
}

function resolveLogoFileType(file: File) {
  const fileName = file.name.toLowerCase();
  const mimeType = file.type === "image/x-png" ? "image/png" : file.type;
  const byMime = new Map<
    string,
    { extension: "png" | "jpg" | "webp"; contentType: string }
  >([
    ["image/png", { extension: "png", contentType: "image/png" }],
    ["image/jpeg", { extension: "jpg", contentType: "image/jpeg" }],
    ["image/webp", { extension: "webp", contentType: "image/webp" }],
  ]);
  const resolved = byMime.get(mimeType);
  if (resolved) return resolved;

  const shouldUseExtension =
    !mimeType || mimeType === "application/octet-stream";

  if (shouldUseExtension && fileName.endsWith(".png")) {
    return { extension: "png" as const, contentType: "image/png" };
  }
  if (
    shouldUseExtension &&
    (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg"))
  ) {
    return { extension: "jpg" as const, contentType: "image/jpeg" };
  }
  if (shouldUseExtension && fileName.endsWith(".webp")) {
    return { extension: "webp" as const, contentType: "image/webp" };
  }

  return null;
}

export class OrganizationBrandingService {
  private readonly branding: OrganizationBrandingRepository;
  private readonly auth: AuthService;
  private readonly authorization: AuthorizationService;

  constructor(db: SupabaseClient<Database>) {
    this.branding = new OrganizationBrandingRepository(db);
    this.auth = new AuthService(db);
    this.authorization = new AuthorizationService(db);
  }

  async getSafeBranding(organizationId: string) {
    const user = await this.auth.requireUser();
    await this.authorization.requireOrganizationMember(organizationId, user.id);
    const branding = await this.branding.findByOrganization(organizationId);
    return resolveOrganizationBranding(branding);
  }

  async getEditableBranding(organizationId: string) {
    const user = await this.auth.requireUser();
    await this.authorization.requireOrganizationAdmin(organizationId, user.id);
    return this.branding.findByOrganization(organizationId);
  }

  async getPdfBranding(organizationId: string, organizationName: string) {
    const user = await this.auth.requireUser();
    await this.authorization.requireOrganizationMember(organizationId, user.id);
    const branding = await this.branding.findByOrganization(organizationId);
    return resolvePdfReportBranding(branding, organizationName);
  }

  async getEmailBranding(organizationId: string, organizationName: string) {
    const user = await this.auth.requireUser();
    await this.authorization.requireOrganizationMember(organizationId, user.id);
    const branding = await this.branding.findByOrganization(organizationId);
    return resolveEmailTemplateBranding(branding, organizationName);
  }

  async update(input: unknown) {
    const user = await this.auth.requireUser();
    const parsed = organizationBrandingInputSchema.parse(input);
    await this.authorization.requireOrganizationAdmin(
      parsed.organizationId,
      user.id,
    );
    return this.branding.upsert({
      organization_id: parsed.organizationId,
      logo_url: parsed.logoUrl ?? null,
      primary_color: parsed.primaryColor ?? null,
      secondary_color: parsed.secondaryColor ?? null,
      accent_color: parsed.accentColor ?? null,
      font_family: parsed.fontFamily ?? null,
    });
  }

  async uploadLogo(input: { organizationId: string; file: File }) {
    const user = await this.auth.requireUser();
    await this.authorization.requireOrganizationAdmin(
      input.organizationId,
      user.id,
    );

    if (!input.file.name || input.file.size === 0) {
      throw new AppError("Vælg en logofil.", 422, "EMPTY_FILE");
    }
    if (input.file.size > 2 * 1024 * 1024) {
      throw new AppError(
        "Logoet er for stort. Maks 2 MB.",
        422,
        "FILE_TOO_LARGE",
      );
    }

    const fileType = resolveLogoFileType(input.file);
    if (!fileType) {
      throw new AppError(
        "Filtypen understøttes ikke. Brug PNG, JPG eller WEBP.",
        422,
        "UNSAFE_FILE_TYPE",
      );
    }

    const storagePath = `${input.organizationId}/logo/${crypto.randomUUID()}.${fileType.extension}`;
    let uploaded = false;
    try {
      const fileBody = await input.file.arrayBuffer();
      await this.branding.uploadLogo(
        storagePath,
        fileBody,
        fileType.contentType,
      );
      uploaded = true;
      const logoUrl = this.branding.getLogoPublicUrl(storagePath);
      const branding = await this.branding.findByOrganization(
        input.organizationId,
      );
      return await this.branding.upsert({
        organization_id: input.organizationId,
        logo_url: logoUrl,
        primary_color: branding?.primary_color ?? null,
        secondary_color: branding?.secondary_color ?? null,
        accent_color: branding?.accent_color ?? null,
        font_family: branding?.font_family ?? null,
      });
    } catch (error) {
      if (uploaded) {
        await this.branding.removeLogo(storagePath).catch(() => undefined);
      }
      throw toLogoUploadError(error);
    }
  }
}

import type { PdfReportBranding } from "@/lib/pdf-report";
import { organizationBrandFonts } from "@/lib/organization-branding";
import type { OrganizationBranding } from "@/types/domain";

const fallbackPrimary = "#12313e";
const fallbackAccent = "#476f65";
const maxLogoBytes = 2 * 1024 * 1024;

function safeHexColor(value: string | null | undefined, fallback: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value ?? "") ? value! : fallback;
}

function safeRemoteLogoUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function safeFontFamily(value: string | null | undefined) {
  return organizationBrandFonts.includes(
    value as (typeof organizationBrandFonts)[number],
  )
    ? value!
    : undefined;
}

async function loadLogo(logoUrl: string | null) {
  if (!logoUrl) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  try {
    const response = await fetch(logoUrl, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const supported =
      contentType.includes("image/png") || contentType.includes("image/jpeg");
    if (!supported) return null;

    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > maxLogoBytes) return null;

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxLogoBytes) return null;

    return {
      bytes,
      mimeType: contentType.includes("image/png")
        ? ("image/png" as const)
        : ("image/jpeg" as const),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolvePdfReportBranding(
  branding: OrganizationBranding | null,
  organizationName: string,
): Promise<PdfReportBranding> {
  const logoUrl = safeRemoteLogoUrl(branding?.logo_url);
  const logo = await loadLogo(logoUrl);

  return {
    organizationName,
    logoUrl,
    logoBytes: logo?.bytes ?? null,
    logoMimeType: logo?.mimeType ?? null,
    primaryColor: safeHexColor(branding?.primary_color, fallbackPrimary),
    accentColor: safeHexColor(branding?.accent_color, fallbackAccent),
    fontFamily: safeFontFamily(branding?.font_family),
  };
}

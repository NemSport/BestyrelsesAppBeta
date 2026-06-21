import type { OrganizationBranding } from "@/types/domain";

const fallbackPrimary = "#12313e";
const fallbackAccent = "#476f65";

export type EmailTemplateBranding = {
  organizationName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
};

function safeHexColor(value: string | null | undefined, fallback: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value ?? "") ? value! : fallback;
}

function safeLogoUrl(value: string | null | undefined) {
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

export function resolveEmailTemplateBranding(
  branding: OrganizationBranding | null,
  organizationName: string,
): EmailTemplateBranding {
  return {
    organizationName,
    logoUrl: safeLogoUrl(branding?.logo_url),
    primaryColor: safeHexColor(branding?.primary_color, fallbackPrimary),
    accentColor: safeHexColor(branding?.accent_color, fallbackAccent),
  };
}

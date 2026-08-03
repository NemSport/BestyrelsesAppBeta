import { rgb, type RGB } from "pdf-lib";

export type PdfReportBranding = {
  organizationName?: string;
  logoUrl?: string | null;
  logoBytes?: Uint8Array | null;
  logoMimeType?: "image/png" | "image/jpeg" | null;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
};

export type PdfTheme = {
  ink: RGB;
  muted: RGB;
  subtle: RGB;
  surface: RGB;
  pageBackground: RGB;
  line: RGB;
  brand: RGB;
  brandText: RGB;
  brandSoft: RGB;
  brandHeader: RGB;
  secondary: RGB;
  secondarySoft: RGB;
  accent: RGB;
  accentText: RGB;
  accentSoft: RGB;
  warning: RGB;
  success: RGB;
  danger: RGB;
  requestedFontFamily?: string;
  resolvedFontFamily: "Noto Sans";
};

const defaults = {
  primary: "#12313e",
  secondary: "#d8e2df",
  accent: "#476f65",
};

function normalizeHex(value: string | null | undefined, fallback: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value ?? "") ? value! : fallback;
}

function fromHex(value: string): RGB {
  return rgb(
    Number.parseInt(value.slice(1, 3), 16) / 255,
    Number.parseInt(value.slice(3, 5), 16) / 255,
    Number.parseInt(value.slice(5, 7), 16) / 255,
  );
}

function mixWithWhite(value: string, amount: number) {
  const color = fromHex(value);
  return rgb(
    color.red * amount + 1 - amount,
    color.green * amount + 1 - amount,
    color.blue * amount + 1 - amount,
  );
}

export function relativeLuminance(color: RGB) {
  const channel = (value: number) =>
    value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  return (
    channel(color.red) * 0.2126 +
    channel(color.green) * 0.7152 +
    channel(color.blue) * 0.0722
  );
}

export function contrastRatio(first: RGB, second: RGB) {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

export function resolvePdfTheme(branding?: PdfReportBranding): PdfTheme {
  const primary = normalizeHex(branding?.primaryColor, defaults.primary);
  const secondary = normalizeHex(branding?.secondaryColor, defaults.secondary);
  const accent = normalizeHex(branding?.accentColor, defaults.accent);

  const ink = rgb(0.09, 0.12, 0.12);
  const primaryRgb = fromHex(primary);
  const primarySoft = mixWithWhite(primary, 0.12);
  const accentRgb = fromHex(accent);
  const accentSoft = mixWithWhite(accent, 0.12);
  return {
    ink,
    muted: rgb(0.35, 0.4, 0.39),
    subtle: rgb(0.95, 0.96, 0.94),
    surface: rgb(1, 1, 1),
    pageBackground: rgb(0.985, 0.988, 0.984),
    line: rgb(0.76, 0.8, 0.78),
    brand: primaryRgb,
    brandText: contrastRatio(primaryRgb, primarySoft) >= 4.5 ? primaryRgb : ink,
    brandSoft: primarySoft,
    brandHeader: mixWithWhite(primary, 0.09),
    secondary: fromHex(secondary),
    secondarySoft: mixWithWhite(secondary, 0.22),
    accent: accentRgb,
    accentText: contrastRatio(accentRgb, accentSoft) >= 4.5 ? accentRgb : ink,
    accentSoft,
    warning: rgb(0.65, 0.36, 0.06),
    success: rgb(0.08, 0.36, 0.2),
    danger: rgb(0.56, 0.11, 0.11),
    requestedFontFamily: branding?.fontFamily,
    // All current organization font choices are browser fonts. Noto Sans is
    // deliberately embedded for deterministic, complete Unicode PDF output.
    resolvedFontFamily: "Noto Sans",
  };
}

import type { CSSProperties } from "react";
import { z } from "zod";

import type { OrganizationBranding } from "@/types/domain";

export const organizationBrandFonts = [
  "Inter",
  "System",
  "Arial",
  "Roboto",
  "Source Sans 3",
  "Ubuntu",
  "Share",
  "Montserrat",
  "Open Sans",
  "Lato",
  "Poppins",
  "Nunito",
  "Merriweather",
  "Georgia",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Times New Roman",
  "Courier New",
] as const;

const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/);

const logoUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) =>
      value.startsWith("https://") ||
      value.startsWith("http://") ||
      (value.startsWith("/") && !value.startsWith("//")),
  );

const fontFamilySchema = z.enum(organizationBrandFonts);

const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().nullable().optional(),
);

const optionalHexColorSchema = optionalText.pipe(
  z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Farven skal angives som hex, fx #18313e.")
    .nullable()
    .optional(),
);

export const organizationBrandingInputSchema = z.object({
  organizationId: z.string().uuid("Ugyldigt organisations-id"),
  logoUrl: optionalText.pipe(
    z
      .string()
      .max(500, "Logo-URL mÃ¥ hÃ¸jst vÃ¦re 500 tegn.")
      .url("Logo-URL skal vÃ¦re en gyldig URL.")
      .refine(
        (value) => value.startsWith("https://") || value.startsWith("http://"),
        {
          message: "Logo-URL skal bruge http:// eller https://.",
        },
      )
      .nullable()
      .optional(),
  ),
  primaryColor: optionalHexColorSchema,
  secondaryColor: optionalHexColorSchema,
  accentColor: optionalHexColorSchema,
  fontFamily: z
    .preprocess(
      (value) =>
        typeof value === "string" && value.trim() === "" ? null : value,
      fontFamilySchema.nullable().optional(),
    )
    .nullable()
    .optional(),
});

export type OrganizationBrandingInput = z.infer<
  typeof organizationBrandingInputSchema
>;

export type SafeOrganizationBranding = {
  logoUrl: string | null;
  fontFamily: (typeof organizationBrandFonts)[number];
  cssVariables: CSSProperties;
};

const defaultBrandRgb = {
  primary: "24 49 62",
  primaryHover: "18 40 52",
  secondary: "53 78 88",
  accent: "71 111 101",
  background: "246 245 241",
  surface: "255 255 253",
  text: "28 35 38",
  muted: "102 111 113",
};

const fontStacks: Record<(typeof organizationBrandFonts)[number], string> = {
  Inter: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  System: 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  Arial: 'Arial, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  Roboto: 'Roboto, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  "Source Sans 3":
    '"Source Sans 3", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  Ubuntu: 'Ubuntu, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  Share: 'Share, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  Montserrat:
    'Montserrat, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  "Open Sans":
    '"Open Sans", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  Lato: 'Lato, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  Poppins:
    'Poppins, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  Nunito:
    'Nunito, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  Merriweather:
    'Merriweather, Georgia, Cambria, "Times New Roman", serif',
  Georgia: 'Georgia, Cambria, "Times New Roman", serif',
  Verdana: 'Verdana, Geneva, ui-sans-serif, sans-serif',
  Tahoma: 'Tahoma, Geneva, ui-sans-serif, sans-serif',
  "Trebuchet MS": '"Trebuchet MS", Arial, ui-sans-serif, sans-serif',
  "Times New Roman": '"Times New Roman", Times, serif',
  "Courier New": '"Courier New", Courier, monospace',
};

function safeHexToRgb(value: string | null | undefined, fallback: string) {
  const parsed = hexColorSchema.safeParse(value);
  if (!parsed.success) return fallback;
  const hex = parsed.data.slice(1);
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ].join(" ");
}

function safeLogoUrl(value: string | null | undefined) {
  const parsed = logoUrlSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function safeFontFamily(value: string | null | undefined) {
  const parsed = fontFamilySchema.safeParse(value);
  return parsed.success ? parsed.data : "Inter";
}

function primaryHoverFrom(primary: string) {
  return primary
    .split(" ")
    .map((part) => Math.max(0, Math.round(Number(part) * 0.82)))
    .join(" ");
}

function softFromRgb(rgbValue: string) {
  return rgbValue
    .split(" ")
    .map((part) => Math.round(Number(part) + (255 - Number(part)) * 0.86))
    .join(" ");
}

function contrastTextFor(primary: string) {
  const [red, green, blue] = primary
    .split(" ")
    .map((part) => Number(part) / 255)
    .map((channel) =>
      channel <= 0.03928
        ? channel / 12.92
        : Math.pow((channel + 0.055) / 1.055, 2.4),
    );
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luminance > 0.46
    ? {
        text: "28 35 38",
        muted: "62 72 76",
        active: "18 40 52",
      }
    : {
        text: "248 250 249",
        muted: "200 211 215",
        active: "255 255 255",
      };
}

export function resolveOrganizationBranding(
  branding: OrganizationBranding | null,
): SafeOrganizationBranding {
  const primary = safeHexToRgb(branding?.primary_color, defaultBrandRgb.primary);
  const fontFamily = safeFontFamily(branding?.font_family);
  const onPrimary = contrastTextFor(primary);

  return {
    logoUrl: safeLogoUrl(branding?.logo_url),
    fontFamily,
    cssVariables: {
      "--brand-primary": primary,
      "--brand-primary-hover": primaryHoverFrom(primary),
      "--brand-secondary": safeHexToRgb(
        branding?.secondary_color,
        defaultBrandRgb.secondary,
      ),
      "--brand-accent": safeHexToRgb(
        branding?.accent_color,
        defaultBrandRgb.accent,
      ),
      "--brand-accent-soft": softFromRgb(
        safeHexToRgb(branding?.accent_color, defaultBrandRgb.accent),
      ),
      "--brand-background": defaultBrandRgb.background,
      "--brand-surface": defaultBrandRgb.surface,
      "--brand-text": defaultBrandRgb.text,
      "--brand-text-muted": defaultBrandRgb.muted,
      "--brand-muted": defaultBrandRgb.muted,
      "--brand-on-primary": onPrimary.text,
      "--brand-on-primary-muted": onPrimary.muted,
      "--brand-on-primary-active": onPrimary.active,
      "--font-sans": fontStacks[fontFamily],
    } as CSSProperties,
  };
}

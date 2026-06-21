"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";

import { Button, Input, Select } from "@/components/ui";
import { organizationBrandFonts } from "@/lib/organization-branding";
import type { OrganizationBranding } from "@/types/domain";

type BrandingFormState = {
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
};

function initialState(branding: OrganizationBranding | null): BrandingFormState {
  return {
    logoUrl: branding?.logo_url ?? "",
    primaryColor: branding?.primary_color ?? "",
    secondaryColor: branding?.secondary_color ?? "",
    accentColor: branding?.accent_color ?? "",
    fontFamily: branding?.font_family ?? "",
  };
}

function safePreviewColor(value: string, fallback: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function previewFontStack(fontFamily: string) {
  if (!fontFamily || fontFamily === "System") {
    return 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  }
  if (fontFamily === "Courier New") {
    return '"Courier New", Courier, monospace';
  }
  if (["Georgia", "Merriweather", "Times New Roman"].includes(fontFamily)) {
    return `"${fontFamily}", Georgia, "Times New Roman", serif`;
  }
  return `"${fontFamily}", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
}

function logoFileError(file: File | null) {
  if (!file) return null;
  if (file.size > 2 * 1024 * 1024) return "Logoet er for stort. Maks 2 MB.";
  const allowedTypes = [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/x-png",
    "application/octet-stream",
    "",
  ];
  if (!allowedTypes.includes(file.type)) {
    return "Filtypen understøttes ikke. Brug PNG, JPG eller WEBP.";
  }
  if (
    ["", "application/octet-stream"].includes(file.type) &&
    !/\.(png|jpe?g|webp)$/i.test(file.name)
  ) {
    return "Filtypen understøttes ikke. Brug PNG, JPG eller WEBP.";
  }
  return null;
}

export function OrganizationBrandingForm({
  branding,
  organizationId,
  organizationName,
}: {
  branding: OrganizationBranding | null;
  organizationId: string;
  organizationName: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<BrandingFormState>(() =>
    initialState(branding),
  );
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const primary = safePreviewColor(values.primaryColor, "#18313e");
  const secondary = safePreviewColor(values.secondaryColor, "#354e58");
  const accent = safePreviewColor(values.accentColor, "#476f65");
  const previewFont = previewFontStack(values.fontFamily);

  function updateField(name: keyof BrandingFormState, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    setFieldErrors({});

    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/branding`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        },
      );
      const result = (await response.json()) as {
        error?: string;
        fieldErrors?: Record<string, string[]>;
      };

      if (!response.ok) {
        setError(result.error || "Branding kunne ikke gemmes.");
        setFieldErrors(
          Object.fromEntries(
            Object.entries(result.fieldErrors || {})
              .filter(([, messages]) => messages.length > 0)
              .map(([name, messages]) => [name, messages[0]]),
          ),
        );
        return;
      }

      setMessage("Branding er gemt.");
      router.refresh();
    } catch {
      setError(
        "Forbindelsen til serveren mislykkedes. Kontrollér din internetforbindelse, og prøv igen.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function uploadLogo() {
    if (!logoFile) {
      setError("Vælg en logofil først.");
      return;
    }
    const validationError = logoFileError(logoFile);
    if (validationError) {
      setError(validationError);
      return;
    }

    setUploadingLogo(true);
    setError(null);
    setMessage(null);
    setFieldErrors({});

    try {
      const formData = new FormData();
      formData.append("file", logoFile);
      const response = await fetch(
        `/api/organizations/${organizationId}/branding/logo`,
        {
          method: "POST",
          body: formData,
        },
      );
      const result = (await response.json()) as {
        error?: string;
        message?: string;
        branding?: OrganizationBranding;
      };

      if (!response.ok || !result.branding) {
        setError(
          result.error ||
            "Logoet kunne ikke uploades. Prøv igen eller kontakt support.",
        );
        return;
      }

      setValues((current) => ({
        ...current,
        logoUrl: result.branding?.logo_url ?? "",
      }));
      setLogoFile(null);
      setMessage(result.message || "Logoet er uploadet.");
      router.refresh();
    } catch {
      setError(
        "Forbindelsen til serveren mislykkedes. Kontrollér din internetforbindelse, og prøv igen.",
      );
    } finally {
      setUploadingLogo(false);
    }
  }

  return (
    <section className="border-y border-line py-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <div className="mb-5">
            <h2 className="text-base font-semibold text-ink">Branding</h2>
            <p className="mt-1 text-sm text-muted">
              Tilpas organisationens visuelle udtryk med logo, farver og en
              kontrolleret fontliste. Tomme felter bruger standardtemaet.
            </p>
          </div>

          <form className="space-y-4" noValidate onSubmit={submit}>
            {error ? (
              <div
                className="alert-danger rounded-[var(--radius-control)] px-4 py-3 text-sm"
                role="alert"
              >
                <p className="font-semibold">{error}</p>
              </div>
            ) : null}
            {message ? (
              <div className="alert-success rounded-[var(--radius-control)] px-4 py-3 text-sm">
                {message}
              </div>
            ) : null}

            <div>
              <label className="label" htmlFor="logoUrl">
                Logo URL
              </label>
              <p className="mb-2 text-xs text-muted">
                Upload et logo, eller brug en sikker http(s)-URL. Tøm feltet
                og gem for at bruge fallback uden logo.
              </p>
              <div className="mb-3 flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Input
                    accept="image/png,image/jpeg,image/webp"
                    disabled={uploadingLogo}
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setLogoFile(file);
                      setError(logoFileError(file));
                    }}
                    type="file"
                  />
                </div>
                <Button
                  disabled={uploadingLogo || !logoFile}
                  onClick={() => void uploadLogo()}
                  type="button"
                  variant="secondary"
                >
                  {uploadingLogo ? "Uploader..." : "Upload logo"}
                </Button>
              </div>
              <Input
                aria-invalid={Boolean(fieldErrors.logoUrl)}
                id="logoUrl"
                name="logoUrl"
                onChange={(event) => updateField("logoUrl", event.target.value)}
                placeholder="https://example.dk/logo.png"
                value={values.logoUrl}
              />
              {fieldErrors.logoUrl ? (
                <p className="mt-1 text-sm text-danger">
                  {fieldErrors.logoUrl}
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ["primaryColor", "Primær farve", "#18313e"],
                ["secondaryColor", "Sekundær farve", "#354e58"],
                ["accentColor", "Accentfarve", "#476f65"],
              ].map(([name, label, placeholder]) => (
                <div key={name}>
                  <label className="label" htmlFor={name}>
                    {label}
                  </label>
                  <Input
                    aria-invalid={Boolean(fieldErrors[name])}
                    id={name}
                    name={name}
                    onChange={(event) =>
                      updateField(
                        name as keyof BrandingFormState,
                        event.target.value,
                      )
                    }
                    placeholder={placeholder}
                    value={values[name as keyof BrandingFormState]}
                  />
                  {fieldErrors[name] ? (
                    <p className="mt-1 text-sm text-danger">
                      {fieldErrors[name]}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>

            <div>
              <label className="label" htmlFor="fontFamily">
                Font
              </label>
              <Select
                aria-invalid={Boolean(fieldErrors.fontFamily)}
                id="fontFamily"
                name="fontFamily"
                onChange={(event) =>
                  updateField("fontFamily", event.target.value)
                }
                value={values.fontFamily}
              >
                <option value="">Standard (Inter)</option>
                {organizationBrandFonts.map((font) => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-muted">
                Listen er kontrolleret. Der uploades ikke fonte, og browseren
                bruger sikre fallback-fonte hvis en font ikke er installeret.
              </p>
              {fieldErrors.fontFamily ? (
                <p className="mt-1 text-sm text-danger">
                  {fieldErrors.fontFamily}
                </p>
              ) : null}
            </div>

            <div className="pt-2">
              <Button disabled={loading} type="submit">
                {loading ? "Gemmer..." : "Gem branding"}
              </Button>
            </div>
          </form>
        </div>

        <div className="border border-line bg-subtle/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Preview
          </p>
          <div
            className="mt-4 overflow-hidden border border-line bg-surface"
            style={{ fontFamily: previewFont }}
          >
            <div
              className="p-4"
              style={{
                background: `linear-gradient(180deg, ${primary}, ${secondary})`,
                color: "#fff",
              }}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em] opacity-80">
                Organisation
              </p>
              <p className="mt-0.5 text-sm font-semibold">{organizationName}</p>
              <div className="mt-4 space-y-1.5">
                <div
                  className="border px-2.5 py-2 text-sm font-semibold"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.13)",
                    borderColor: "rgba(255,255,255,0.18)",
                    boxShadow: `inset 2px 0 0 ${accent}`,
                  }}
                >
                  Overblik
                </div>
                <div className="px-2.5 py-1.5 text-sm opacity-75">Møder</div>
                <div className="px-2.5 py-1.5 text-sm opacity-75">Opgaver</div>
              </div>
            </div>
            <div className="p-4">
              <p className="text-sm font-semibold text-ink">Logo</p>
              <p className="mt-1 text-xs text-muted">
                Logo bruges i preview, PDF og email. Sidebaren bruger primært
                navn, farver og font.
              </p>
              {values.logoUrl.trim() ? (
                <div className="mt-3 flex min-h-20 items-center justify-center border border-line bg-white px-4 py-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt=""
                    className="block h-auto max-h-16 w-auto max-w-[12rem] object-contain"
                    src={values.logoUrl.trim()}
                  />
                </div>
              ) : (
                <div className="mt-3 border border-dashed border-line bg-subtle/45 px-4 py-5 text-center text-xs text-muted">
                  Intet logo valgt
                </div>
              )}
            </div>
            <div className="border-t border-line p-4">
              <p className="text-sm font-semibold text-ink">Primær handling</p>
              <p className="mt-1 text-xs text-muted">
                Preview af knap, accent og valgt font.
              </p>
              <button
                className="mt-3 inline-flex min-h-9 items-center px-3 text-sm font-semibold text-white"
                style={{
                  backgroundColor: primary,
                  borderRadius: "var(--radius-control)",
                }}
                type="button"
              >
                Gem ændringer
              </button>
              <div className="mt-4 flex gap-2">
                {[primary, secondary, accent].map((color) => (
                  <span
                    aria-label={color}
                    className="size-7 border border-line"
                    key={color}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Select } from "@/components/ui";
import { useUnsavedChanges } from "@/hooks/use-mutation-feedback";
import {
  changeTemplateRect,
  defaultPdfTemplateConfig,
  paperSizes,
  pdfTemplateConfigSchema,
  templateAssetPaths,
  type PaperOrientation,
  type PdfTemplateConfig,
  type TemplateBackground,
  type TemplatePage,
  type TemplateRect,
  type TemplateZone,
} from "@/lib/pdf-template-config";
import type { OrganizationBranding } from "@/types/domain";

const labels = { header: "Sidehoved", body: "Indholdsfelt", footer: "Sidefod" };
const colors = { header: "#7c3aed", body: "#0f766e", footer: "#b45309" };
type PreviewMeeting = {
  id: string;
  committee_id: string;
  title: string;
  starts_at: string;
};

function Background({
  background,
  orientation,
  organizationId,
}: {
  background: TemplateBackground;
  orientation: PaperOrientation;
  organizationId: string;
}) {
  if (background.kind === "none") return null;
  const src =
    background.kind === "image"
      ? `/api/organizations/${organizationId}/branding/letterhead?path=${encodeURIComponent(background.path)}`
      : "/letterheads/vorbasse-marked.png";
  if (background.kind === "vorbasse-marked" && orientation === "landscape")
    return (
      <>
        <div
          className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden"
          style={{ height: "21.84%" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            src={src}
            className="absolute right-0 top-0 h-auto"
            style={{ width: "50.03%" }}
          />
        </div>
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden"
          style={{ height: "21%" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            src={src}
            className="absolute bottom-0 left-0 h-auto w-full"
          />
        </div>
      </>
    );
  // Uploaded artwork is contained, never stretched or silently cropped.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      src={src}
      className="pointer-events-none absolute inset-0 h-full w-full object-contain"
    />
  );
}

export function PdfTemplateConfigurator({
  branding,
  organizationId,
}: {
  branding: OrganizationBranding | null;
  organizationId: string;
}) {
  const router = useRouter();
  const existing = pdfTemplateConfigSchema.safeParse(
    branding?.pdf_template,
  ).data;
  const [config, setConfig] = useState<PdfTemplateConfig>(
    () =>
      existing ??
      defaultPdfTemplateConfig(branding?.pdf_letterhead === "vorbasse-marked"),
  );
  const [saved, setSaved] = useState(() =>
    JSON.stringify(
      existing ??
        defaultPdfTemplateConfig(
          branding?.pdf_letterhead === "vorbasse-marked",
        ),
    ),
  );
  const [enabled, setEnabled] = useState(Boolean(existing));
  const [orientation, setOrientation] = useState<PaperOrientation>("portrait");
  const [variant, setVariant] = useState<"first" | "continuation">("first");
  const [zone, setZone] = useState<TemplateZone>("body");
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uploads, setUploads] = useState(() => templateAssetPaths(config));
  const [meetings, setMeetings] = useState<PreviewMeeting[]>([]);
  const [meetingsError, setMeetingsError] = useState("");
  const [meetingId, setMeetingId] = useState("");
  const [kind, setKind] = useState("sample");
  const [preview, setPreview] = useState<{
    url: string;
    pages: number;
    snapshot: string;
  } | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    rect: TemplateRect;
    zone: TemplateZone;
    resize: boolean;
    scaleX: number;
    scaleY: number;
  } | null>(null);
  const page = config[orientation][variant];
  const size = paperSizes[orientation];
  const validation = pdfTemplateConfigSchema.safeParse(config);
  const dirty = JSON.stringify(config) !== saved;
  const confirmDiscard = useUnsavedChanges(dirty && !busy);
  const previewSnapshot = JSON.stringify({
    config,
    kind,
    meetingId,
    orientation,
  });

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/organizations/${organizationId}/branding/template/preview`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Møderne kunne ikke hentes.");
        setMeetings(data.meetings);
        setMeetingId(data.meetings[0]?.id ?? "");
      })
      .catch((error) => {
        if (error.name !== "AbortError") setMeetingsError(error.message);
      });
    return () => controller.abort();
  }, [organizationId]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );

  function changePage(value: Partial<TemplatePage>) {
    setConfig((current) => ({
      ...current,
      [orientation]: {
        ...current[orientation],
        [variant]: { ...current[orientation][variant], ...value },
      },
    }));
    setMessage("");
  }
  function changeRect(rect: TemplateRect) {
    setConfig((current) =>
      changeTemplateRect(current, orientation, variant, zone, rect),
    );
    setMessage("");
  }
  function startDrag(
    event: PointerEvent,
    target: TemplateZone,
    resize: boolean,
  ) {
    if (busy) return;
    event.preventDefault();
    event.stopPropagation();
    setZone(target);
    const bounds = canvas.current!.getBoundingClientRect();
    canvas.current!.setPointerCapture(event.pointerId);
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      rect: { ...page[target] },
      zone: target,
      resize,
      scaleX: size.width / bounds.width,
      scaleY: size.height / bounds.height,
    };
  }
  function moveDrag(event: PointerEvent) {
    const active = drag.current;
    if (!active) return;
    const dx = (event.clientX - active.x) * active.scaleX;
    const dy = (event.clientY - active.y) * active.scaleY;
    const rect = { ...active.rect };
    if (active.resize) {
      rect.width = Math.max(
        10,
        Math.min(size.width - rect.x, Math.round((rect.width + dx) * 10) / 10),
      );
      rect.height = Math.max(
        8,
        Math.min(
          size.height - rect.y,
          Math.round((rect.height + dy) * 10) / 10,
        ),
      );
    } else {
      rect.x = Math.max(
        0,
        Math.min(size.width - rect.width, Math.round((rect.x + dx) * 10) / 10),
      );
      rect.y = Math.max(
        0,
        Math.min(
          size.height - rect.height,
          Math.round((rect.y + dy) * 10) / 10,
        ),
      );
    }
    setConfig((current) =>
      changeTemplateRect(current, orientation, variant, active.zone, rect),
    );
    setMessage("");
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(
        `/api/organizations/${organizationId}/branding/letterhead`,
        { method: "POST", body: form },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setUploads((paths) => [...new Set([...paths, data.path])]);
      changePage({ background: { kind: "image", path: data.path } });
      setMessage(
        "Brevpapiret er uploadet. Gem skabelonerne for at bruge det i dokumenterne.",
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "Upload mislykkedes.");
    } finally {
      setBusy(false);
    }
  }
  async function save(disable = false) {
    if (busy || (!disable && !validation.success)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/branding/template`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config: disable ? null : config }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.validationErrors?.[0]?.message ?? data.error);
      setSaved(JSON.stringify(config));
      setEnabled(!disable);
      setMessage(
        disable
          ? "Konfiguratoren er slået fra. Det enkle brevpapirvalg bruges igen."
          : "Dokumentskabelonerne er gemt og bruges nu til PDF og print.",
      );
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Skabelonerne kunne ikke gemmes.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function generatePreview() {
    if (!validation.success || previewing) return;
    setPreviewing(true);
    setError("");
    const selected = meetings.find((meeting) => meeting.id === meetingId);
    try {
      const response = await fetch(
        `/api/organizations/${organizationId}/branding/template/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            config,
            kind,
            orientation,
            ...(kind !== "sample" && selected
              ? { meetingId: selected.id, committeeId: selected.committee_id }
              : {}),
          }),
        },
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.validationErrors?.[0]?.message ?? data.error);
      }
      setPreview({
        url: URL.createObjectURL(await response.blob()),
        pages: Number(response.headers.get("X-PDF-Page-Count")),
        snapshot: previewSnapshot,
      });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "PDF'en kunne ikke vises.",
      );
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <section
      className="mt-8 border-t border-line pt-6"
      aria-labelledby="pdf-template-title"
    >
      <h2 id="pdf-template-title" className="text-lg font-semibold">
        Dokumentskabeloner til PDF og print
      </h2>
      <p className="mt-2 max-w-3xl text-sm text-muted">
        Vælg brevpapir, og markér hvor sidehoved, indhold og sidefod må stå.
        Tekst og tabeller fortsætter automatisk på næste side. Gem skabelonerne
        for at aktivere dem i stedet for det enkle brevpapirvalg.
      </p>
      <p className="mt-2 text-sm font-medium">
        {enabled ? "Konfigurator aktiv" : "Konfigurator ikke aktiveret endnu"}
        {dirty ? " · Ikke-gemte ændringer" : ""}
      </p>
      <div className="my-4 flex flex-wrap gap-2">
        {(["portrait", "landscape"] as const).map((value) => (
          <Button
            key={value}
            type="button"
            variant={orientation === value ? "primary" : "secondary"}
            disabled={busy}
            onClick={() => {
              setOrientation(value);
              setVariant("first");
            }}
          >
            {value === "portrait" ? "Stående A4" : "Liggende A4"}
          </Button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm">
          Afstand
          <Select
            aria-label="Afstand i dokumentet"
            value={config.density}
            disabled={busy}
            onChange={(event) =>
              setConfig({
                ...config,
                density: event.target.value as PdfTemplateConfig["density"],
              })
            }
          >
            <option value="compact">Kompakt</option>
            <option value="comfortable">Luftig</option>
          </Select>
        </label>
      </div>
      <div className="grid gap-6 xl:grid-cols-[19rem_minmax(0,1fr)]">
        <fieldset disabled={busy} className="min-w-0 space-y-4">
          <legend className="sr-only">Indstillinger for siden</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config[orientation].separateContinuation}
              onChange={(event) => {
                setConfig({
                  ...config,
                  [orientation]: {
                    ...config[orientation],
                    separateContinuation: event.target.checked,
                  },
                });
                if (!event.target.checked) setVariant("first");
              }}
            />
            Anden opsætning fra side 2
          </label>
          <Select
            aria-label="Sidevariant"
            value={variant}
            onChange={(event) =>
              setVariant(event.target.value as typeof variant)
            }
          >
            <option value="first">Første side</option>
            {config[orientation].separateContinuation && (
              <option value="continuation">Side 2 og frem</option>
            )}
          </Select>
          <div>
            <label className="label" htmlFor="template-background">
              Brevpapir på denne side
            </label>
            <Select
              id="template-background"
              value={
                page.background.kind === "image"
                  ? page.background.path
                  : page.background.kind
              }
              onChange={(event) =>
                changePage({
                  background:
                    event.target.value === "none" ||
                    event.target.value === "vorbasse-marked"
                      ? { kind: event.target.value }
                      : { kind: "image", path: event.target.value },
                })
              }
            >
              <option value="none">Intet brevpapir</option>
              <option value="vorbasse-marked">Vorbasse Marked</option>
              {uploads.map((path, i) => (
                <option key={path} value={path}>
                  Uploadet brevpapir {i + 1}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="label" htmlFor="template-upload">
              Upload eget brevpapir
            </label>
            <Input
              id="template-upload"
              type="file"
              accept="image/png,image/jpeg"
              onChange={(event) => {
                void upload(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <p className="mt-1 text-xs text-muted">
              PNG eller JPG, højst 5 MB. Brug samme format som siden. Billedets
              proportioner bevares.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="template-zone">
              Område
            </label>
            <Select
              id="template-zone"
              value={zone}
              onChange={(event) => setZone(event.target.value as TemplateZone)}
            >
              {Object.entries(labels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(["x", "y", "width", "height"] as const).map((key) => (
              <label key={key} className="text-xs">
                {
                  {
                    x: "Fra venstre",
                    y: "Fra toppen",
                    width: "Bredde",
                    height: "Højde",
                  }[key]
                }{" "}
                (mm)
                <Input
                  aria-label={`${labels[zone]}: ${{ x: "Fra venstre", y: "Fra toppen", width: "Bredde", height: "Højde" }[key]} i mm`}
                  type="number"
                  step="0.5"
                  min="0"
                  value={page[zone][key]}
                  onChange={(event) =>
                    changeRect({
                      ...page[zone],
                      [key]: Number.isFinite(event.target.valueAsNumber)
                        ? event.target.valueAsNumber
                        : 0,
                    })
                  }
                />
              </label>
            ))}
          </div>
          <p className="text-xs text-muted">
            Træk området for at flytte det, eller træk i nederste højre hjørne.
            Du kan også bruge millimeterfelterne. Indholdsfeltets bredde og
            venstrekant er fælles for alle sider i dette format.
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              if (confirmDiscard()) {
                setConfig(defaultPdfTemplateConfig(true));
                setMessage(
                  "Forslag indlæst: brevpapir på første side og mere tekstplads fra side 2. Gem for at bruge det.",
                );
              }
            }}
          >
            Brug pladsbesparende forslag
          </Button>
        </fieldset>
        <div className="min-w-0 rounded border border-line bg-subtle p-3 sm:p-6">
          <div
            ref={canvas}
            className="relative mx-auto w-full select-none overflow-hidden bg-white shadow"
            style={{
              aspectRatio: `${size.width}/${size.height}`,
              maxWidth: orientation === "portrait" ? 520 : 780,
              touchAction: "none",
            }}
            onPointerMove={moveDrag}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            <Background
              background={page.background}
              orientation={orientation}
              organizationId={organizationId}
            />
            {(["header", "body", "footer"] as const).map((key) => {
              const rect = page[key];
              return (
                <div
                  key={key}
                  role="button"
                  tabIndex={0}
                  aria-label={`${labels[key]}: træk for at flytte, eller brug piletaster`}
                  aria-pressed={zone === key}
                  onPointerDown={(event) => startDrag(event, key, false)}
                  onFocus={() => setZone(key)}
                  onKeyDown={(event) => {
                    const direction = {
                      ArrowLeft: [-1, 0],
                      ArrowRight: [1, 0],
                      ArrowUp: [0, -1],
                      ArrowDown: [0, 1],
                    }[event.key];
                    if (!direction || busy) return;
                    event.preventDefault();
                    const step = event.shiftKey ? 5 : 1;
                    setConfig(
                      changeTemplateRect(config, orientation, variant, key, {
                        ...rect,
                        x: Math.max(
                          0,
                          Math.min(
                            size.width - rect.width,
                            rect.x + direction[0] * step,
                          ),
                        ),
                        y: Math.max(
                          0,
                          Math.min(
                            size.height - rect.height,
                            rect.y + direction[1] * step,
                          ),
                        ),
                      }),
                    );
                  }}
                  className="absolute cursor-move border-2 text-left outline-offset-2"
                  style={{
                    left: `${(rect.x / size.width) * 100}%`,
                    top: `${(rect.y / size.height) * 100}%`,
                    width: `${(rect.width / size.width) * 100}%`,
                    height: `${(rect.height / size.height) * 100}%`,
                    borderColor: colors[key],
                    background: `${colors[key]}${zone === key ? "22" : "0c"}`,
                  }}
                >
                  <span
                    className="absolute left-0 top-0 bg-white/95 px-1 text-[10px] font-semibold sm:text-xs"
                    style={{ color: colors[key] }}
                  >
                    {labels[key]}
                  </span>
                  {key === "body" && (
                    <div className="pointer-events-none px-3 pt-7 text-[10px] text-slate-500 sm:text-xs">
                      Dokumentets tekst og tabeller
                      <div className="mt-3 space-y-2">
                        {[100, 88, 95, 65, 90].map((width, i) => (
                          <div
                            key={i}
                            className="h-px bg-slate-300"
                            style={{ width: `${width}%` }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  <span
                    aria-hidden="true"
                    onPointerDown={(event) => startDrag(event, key, true)}
                    className="absolute -bottom-2 -right-2 h-5 w-5 cursor-se-resize rounded border-2 border-white"
                    style={{ background: colors[key] }}
                  />
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-center text-xs text-muted">
            {size.width} × {size.height} mm ·{" "}
            {variant === "first" ? "Første side" : "Side 2 og frem"}. De farvede
            rammer kommer ikke med i PDF’en.
          </p>
        </div>
      </div>
      {!validation.success && (
        <div className="mt-4 text-sm text-danger" role="alert">
          {[
            ...new Set(
              validation.error.issues.map(
                (issue) =>
                  `${issue.path[0] === "portrait" ? "Stående" : "Liggende"}, ${issue.path[1] === "continuation" ? "side 2 og frem" : "første side"}: ${issue.message}`,
              ),
            ),
          ].map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-4 text-sm text-ink">
          {message}
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={busy || !validation.success}
          onClick={() => void save()}
        >
          {busy ? "Arbejder…" : "Gem dokumentskabeloner"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !dirty}
          onClick={() => {
            if (confirmDiscard()) {
              setConfig(JSON.parse(saved));
              setMessage("");
            }
          }}
        >
          Fortryd ændringer
        </Button>
        {enabled && (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => void save(true)}
          >
            Brug enkelt brevpapirvalg igen
          </Button>
        )}
      </div>
      <div className="mt-7 border-t border-line pt-5">
        <h3 className="font-semibold">Prøv på et dokument før du gemmer</h3>
        <p className="mt-1 text-sm text-muted">
          Forhåndsvisningen bruger dine aktuelle indstillinger uden at gemme
          dem. Dagsorden og referat er stående; opgavelisten er liggende.
          Referater skal være klar til godkendelse eller godkendt. Originale
          bilag medregnes ikke.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Dokumenttype
            <Select
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="sample">Prøvedokument i valgt format</option>
              <option value="minutes">Referat fra et møde</option>
              <option value="agenda">Dagsorden fra et møde</option>
              <option value="tasks">Opgaveliste fra et møde</option>
            </Select>
          </label>
          {kind !== "sample" && (
            <label className="min-w-0 max-w-full flex-1 text-sm">
              Møde
              <Select
                aria-label="Møde til forhåndsvisning"
                value={meetingId}
                onChange={(event) => setMeetingId(event.target.value)}
              >
                <option value="">Vælg møde</option>
                {meetings.map((meeting) => (
                  <option key={meeting.id} value={meeting.id}>
                    {new Date(meeting.starts_at).toLocaleDateString("da-DK")} ·{" "}
                    {meeting.title}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <Button
            type="button"
            variant="secondary"
            disabled={
              busy ||
              previewing ||
              !validation.success ||
              (kind !== "sample" && !meetingId)
            }
            onClick={() => void generatePreview()}
          >
            {previewing ? "Danner PDF…" : "Vis PDF og sidetal"}
          </Button>
        </div>
        {meetingsError && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {meetingsError}
          </p>
        )}
        {preview && (
          <div className="mt-4">
            <p role="status" className="font-semibold">
              {preview.pages} sider
              {preview.snapshot !== previewSnapshot
                ? " · Indstillingerne er ændret. Tryk Vis PDF igen for at opdatere."
                : " med denne opsætning"}
            </p>
            <a
              className="mt-2 inline-block underline"
              href={preview.url}
              target="_blank"
              rel="noreferrer"
            >
              Åbn PDF i en ny fane
            </a>
            <iframe
              key={preview.url}
              title="PDF-forhåndsvisning af dokumentskabelon"
              src={preview.url}
              className="mt-3 h-[600px] w-full border border-line"
            />
          </div>
        )}
      </div>
    </section>
  );
}

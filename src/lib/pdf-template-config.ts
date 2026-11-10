import { z } from "zod";

export const paperSizes = {
  portrait: { width: 210, height: 297 },
  landscape: { width: 297, height: 210 },
} as const;
export type PaperOrientation = keyof typeof paperSizes;
export const backgroundSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({ kind: z.literal("vorbasse-marked") }),
  z.object({
    kind: z.literal("image"),
    path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg)$/),
  }),
]);
const rectSchema = z.object({
  x: z.number().finite().min(0),
  y: z.number().finite().min(0),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});
const pageSchema = z.object({
  background: backgroundSchema,
  header: rectSchema,
  body: rectSchema,
  footer: rectSchema,
});
const orientationSchema = z.object({
  separateContinuation: z.boolean(),
  first: pageSchema,
  continuation: pageSchema,
});
export const pdfTemplateConfigSchema = z
  .object({
    version: z.literal(1),
    density: z.enum(["compact", "comfortable"]),
    portrait: orientationSchema,
    landscape: orientationSchema,
  })
  .superRefine((config, ctx) => {
    for (const orientation of ["portrait", "landscape"] as const) {
      const size = paperSizes[orientation];
      const layout = config[orientation];
      for (const variant of ["first", "continuation"] as const) {
        const page = layout[variant];
        for (const zone of ["header", "body", "footer"] as const) {
          const rect = page[zone];
          const minWidth =
            zone === "body" ? (orientation === "portrait" ? 120 : 200) : 70;
          const minHeight = zone === "body" ? 70 : zone === "header" ? 20 : 8;
          if (
            rect.x + rect.width > size.width + 0.01 ||
            rect.y + rect.height > size.height + 0.01 ||
            rect.width < minWidth ||
            rect.height < minHeight
          ) {
            ctx.addIssue({
              code: "custom",
              path: [orientation, variant, zone],
              message: `${zone === "body" ? "Indholdsfeltet" : zone === "header" ? "Sidehovedet" : "Sidefoden"} skal være inden for papiret og mindst ${minWidth} × ${minHeight} mm.`,
            });
          }
        }
        if (
          page.header.y + page.header.height > page.body.y ||
          page.body.y + page.body.height > page.footer.y
        ) {
          ctx.addIssue({
            code: "custom",
            path: [orientation, variant],
            message:
              "Sidehoved, indhold og sidefod skal stå i rækkefølge uden overlap.",
          });
        }
      }
      if (
        layout.first.body.x !== layout.continuation.body.x ||
        layout.first.body.width !== layout.continuation.body.width
      ) {
        ctx.addIssue({
          code: "custom",
          path: [orientation],
          message:
            "Indholdsfeltets venstrekant og bredde skal være ens på første side og fortsættelsessider.",
        });
      }
    }
  });
export type PdfTemplateConfig = z.infer<typeof pdfTemplateConfigSchema>;
export type TemplatePage = z.infer<typeof pageSchema>;
export type TemplateRect = z.infer<typeof rectSchema>;
export type TemplateBackground = z.infer<typeof backgroundSchema>;
export type TemplateZone = "header" | "body" | "footer";

export function defaultPdfTemplateConfig(
  letterhead = false,
): PdfTemplateConfig {
  const background: TemplateBackground = {
    kind: letterhead ? "vorbasse-marked" : "none",
  };
  const portrait: TemplatePage = {
    background,
    header: { x: 16, y: 18, width: 125, height: 36 },
    body: { x: 16, y: 62, width: 178, height: 178 },
    footer: { x: 16, y: 246, width: 178, height: 10 },
  };
  const landscape: TemplatePage = {
    background,
    header: { x: 14, y: 12, width: 225, height: 30 },
    body: { x: 14, y: 47, width: 269, height: 115 },
    footer: { x: 14, y: 166, width: 269, height: 10 },
  };
  return {
    version: 1,
    density: "compact",
    portrait: {
      separateContinuation: true,
      first: portrait,
      continuation: {
        background: { kind: "none" },
        header: { x: 16, y: 10, width: 178, height: 20 },
        body: { x: 16, y: 35, width: 178, height: 240 },
        footer: { x: 16, y: 280, width: 178, height: 10 },
      },
    },
    landscape: {
      separateContinuation: true,
      first: landscape,
      continuation: {
        background: { kind: "none" },
        header: { x: 14, y: 10, width: 269, height: 20 },
        body: { x: 14, y: 35, width: 269, height: 151 },
        footer: { x: 14, y: 191, width: 269, height: 10 },
      },
    },
  };
}

export function templatePage(
  config: PdfTemplateConfig,
  orientation: PaperOrientation,
  index: number,
) {
  const layout = config[orientation];
  return index > 0 && layout.separateContinuation
    ? layout.continuation
    : layout.first;
}

export function templateAssetPaths(config: PdfTemplateConfig) {
  return [
    ...new Set(
      [
        config.portrait.first,
        config.portrait.continuation,
        config.landscape.first,
        config.landscape.continuation,
      ].flatMap((page) =>
        page.background.kind === "image" ? [page.background.path] : [],
      ),
    ),
  ];
}

export function templateAssetsBelongTo(
  config: PdfTemplateConfig,
  organizationId: string,
) {
  return templateAssetPaths(config).every(
    (path) => path.split("/")[0] === organizationId,
  );
}

// Horizontal body bounds stay common so tables and wrapped paragraphs can
// continue at their original readable size on the following page.
export function changeTemplateRect(
  config: PdfTemplateConfig,
  orientation: PaperOrientation,
  variant: "first" | "continuation",
  zone: TemplateZone,
  rect: TemplateRect,
): PdfTemplateConfig {
  const next = structuredClone(config);
  next[orientation][variant][zone] = rect;
  if (zone === "body") {
    const other = variant === "first" ? "continuation" : "first";
    next[orientation][other].body.x = rect.x;
    next[orientation][other].body.width = rect.width;
  }
  return next;
}

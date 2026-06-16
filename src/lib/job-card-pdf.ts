import { createPdfReport, formatPdfDate } from "@/lib/pdf-report";
import type { RoleProfileView } from "@/types/domain";

type JobCardPdfInput = {
  organizationName: string;
  role: RoleProfileView;
  exportedAt: Date;
};

function listOrEmpty(values: string[]) {
  return values.length ? values.join(", ") : "Ikke angivet";
}

export async function generateJobCardPdf(input: JobCardPdfInput) {
  const report = await createPdfReport({
    documentType: "Jobkort",
    title: input.role.title,
    organizationName: input.organizationName,
    generatedAt: input.exportedAt,
    meta: [
      { label: "Organisation", value: input.organizationName },
      {
        label: "Udvalg",
        value: listOrEmpty(input.role.committees.map((committee) => committee.name)),
      },
      {
        label: "Rolleindehavere",
        value: listOrEmpty(
          input.role.assignments.map((assignment) => assignment.name),
        ),
      },
      { label: "Eksportdato", value: formatPdfDate(input.exportedAt) },
    ],
  });

  report.addSection("Rollebeskrivelse");
  report.addKeyValue("Formål", input.role.purpose);
  report.addKeyValue("Kort rollebeskrivelse", input.role.description);
  report.addKeyValue("Kompetencer", input.role.competencies);

  report.addSection("Tilknytning");
  report.addKeyValue(
    "Tilknyttede udvalg",
    listOrEmpty(input.role.committees.map((committee) => committee.name)),
  );
  report.addKeyValue(
    "Aktive rolleindehavere",
    listOrEmpty(
      input.role.assignments.map(
        (assignment) => `${assignment.name} (${assignment.email})`,
      ),
    ),
  );
  report.addKeyValue("Kontaktpersoner", input.role.contact_people);

  report.addSection("Ansvar og samarbejde");
  report.addKeyValue(
    "Ansvarsområder",
    listOrEmpty(input.role.responsibilityAreas.map((area) => area.name)),
  );
  report.addKeyValue("Hvad rollen har ansvar for", input.role.responsibilities);
  report.addKeyValue("Hvad rollen ikke har ansvar for", input.role.exclusions);
  report.addKeyValue("Samarbejde", input.role.collaboration);
  report.addKeyValue("Mødedeltagelse", input.role.meeting_expectations);

  report.addSection("Onboarding");
  report.addKeyValue(
    "Onboardingintroduktion",
    input.role.onboardingGuide?.introduction ?? "",
  );
  report.addKeyValue(
    "Første 30 dage",
    input.role.onboardingGuide?.first_30_days ?? "",
  );
  report.addKeyValue(
    "Praktisk information",
    input.role.onboardingGuide?.practical_information ?? "",
  );

  report.addSection("Opgaveskabeloner");
  report.addTable(
    [
      {
        label: "Titel",
        width: 170,
        getValue: (template: RoleProfileView["taskTemplates"][number]) =>
          template.title,
      },
      {
        label: "Udvalg",
        width: 120,
        getValue: (template: RoleProfileView["taskTemplates"][number]) =>
          input.role.committees.find(
            (committee) => committee.id === template.committee_id,
          )?.name ?? "Ikke angivet",
      },
      {
        label: "Kategori",
        width: 95,
        getValue: (template: RoleProfileView["taskTemplates"][number]) =>
          template.category ?? "-",
      },
      {
        label: "Beskrivelse",
        width: 115,
        getValue: (template: RoleProfileView["taskTemplates"][number]) =>
          template.description,
      },
    ],
    input.role.taskTemplates,
    "Ingen opgaveskabeloner.",
  );

  report.addSection("Relaterede årshjulspunkter");
  report.addTable(
    [
      {
        label: "Dato",
        width: 105,
        getValue: (event: RoleProfileView["annualWheelEvents"][number]) =>
          formatPdfDate(event.starts_on),
      },
      {
        label: "Titel",
        width: 160,
        getValue: (event: RoleProfileView["annualWheelEvents"][number]) =>
          event.title,
      },
      {
        label: "Beskrivelse",
        width: 235,
        getValue: (event: RoleProfileView["annualWheelEvents"][number]) =>
          event.description ?? "",
      },
    ],
    input.role.annualWheelEvents,
    "Ingen relaterede årshjulspunkter.",
  );

  report.addSection("Relaterede beslutninger");
  report.addTable(
    [
      {
        label: "Dato",
        width: 105,
        getValue: (decision: RoleProfileView["decisions"][number]) =>
          decision.decision_date
            ? formatPdfDate(decision.decision_date)
            : "Uden dato",
      },
      {
        label: "Titel",
        width: 175,
        getValue: (decision: RoleProfileView["decisions"][number]) =>
          decision.title,
      },
      {
        label: "Beskrivelse",
        width: 220,
        getValue: (decision: RoleProfileView["decisions"][number]) =>
          decision.description,
      },
    ],
    input.role.decisions,
    "Ingen relaterede beslutninger.",
  );

  report.addSection("Dokumentlinks");
  report.addTable(
    [
      {
        label: "Titel",
        width: 180,
        getValue: (document: RoleProfileView["documents"][number]) =>
          document.title,
      },
      {
        label: "Link",
        width: 320,
        getValue: (document: RoleProfileView["documents"][number]) =>
          document.url,
      },
    ],
    input.role.documents,
    "Ingen dokumentlinks.",
  );

  return report.save();
}

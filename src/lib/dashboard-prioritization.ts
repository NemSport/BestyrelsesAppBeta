import type {
  MeetingCapabilities,
  OrganizationRole,
  CommitteeRole,
} from "@/lib/meeting-capabilities";

export type DashboardAudience = "viewer" | "member" | "chair" | "admin";

export type DashboardPriorityCopy = {
  eyebrow: string;
  title: string;
  description: string;
};

export function resolveOrganizationDashboardAudience(
  organizationRole: OrganizationRole,
  committeeCapabilities: MeetingCapabilities[],
): DashboardAudience {
  if (organizationRole === "owner" || organizationRole === "admin") {
    return "admin";
  }
  if (
    committeeCapabilities.some(
      (capabilities) =>
        capabilities.manageParticipants || capabilities.manageMinutesApproval,
    )
  ) {
    return "chair";
  }
  if (
    organizationRole === "member" ||
    committeeCapabilities.some(
      (capabilities) => capabilities.editTasks || capabilities.editDecisions,
    )
  ) {
    return "member";
  }
  return "viewer";
}

export function resolveCommitteeDashboardAudience(
  organizationRole: OrganizationRole,
  committeeRole: CommitteeRole | null,
  capabilities: MeetingCapabilities,
): DashboardAudience {
  if (organizationRole === "owner" || organizationRole === "admin") {
    return "admin";
  }
  if (capabilities.manageParticipants || capabilities.manageMinutesApproval) {
    return "chair";
  }
  if (
    committeeRole === "member" ||
    capabilities.editTasks ||
    capabilities.editDecisions
  ) {
    return "member";
  }
  return "viewer";
}

export const organizationPriorityCopy: Record<
  DashboardAudience,
  DashboardPriorityCopy
> = {
  viewer: {
    eyebrow: "Næste at læse",
    title: "Følg med i det næste møde",
    description:
      "Kommende møder og godkendte referater er din hurtigste vej til relevant udvalgskontekst.",
  },
  member: {
    eyebrow: "Din næste handling",
    title: "Fortsæt med dine åbne opgaver",
    description:
      "Egne opgaver vises før fælles beslutninger og kommende møder.",
  },
  chair: {
    eyebrow: "Næste udvalgshandling",
    title: "Forbered og følg op på næste møde",
    description:
      "Mødedagsorden, deltagere og referatgodkendelse prioriteres for udvalg, du leder.",
  },
  admin: {
    eyebrow: "Organisationsdrift",
    title: "Se hvor organisationen kræver handling",
    description:
      "Udvalg med åbne opgaver, beslutninger eller mødeforberedelse vises først.",
  },
};

export const committeePriorityCopy: Record<
  DashboardAudience,
  DashboardPriorityCopy
> = {
  viewer: {
    eyebrow: "Næste at læse",
    title: "Følg næste møde og seneste referat",
    description:
      "Du har læseadgang; dashboardet viser derfor møder og tilgængelige referater først.",
  },
  member: {
    eyebrow: "Din næste handling",
    title: "Arbejd videre med dine opgaver",
    description:
      "Egne åbne opgaver og relevante aktive beslutninger prioriteres i udvalget.",
  },
  chair: {
    eyebrow: "Næste udvalgshandling",
    title: "Gør næste møde klar",
    description:
      "Gennemgå dagsorden, deltagere og eventuel referatgodkendelse før øvrigt overblik.",
  },
  admin: {
    eyebrow: "Udvalgsdrift",
    title: "Gør næste møde klar",
    description:
      "Mødeforberedelse vises først uden at miste adgangen til organisationens drift.",
  },
};

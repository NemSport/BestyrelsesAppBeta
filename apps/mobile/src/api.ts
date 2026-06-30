import AsyncStorage from "@react-native-async-storage/async-storage";

import { config } from "./config";
import { supabase } from "./supabase";
import type {
  AiMeetingOverview,
  AiMinutesAssistantAction,
  AiMinutesAssistantSuggestion,
  Decision,
  Meeting,
  MeetingDetail,
  Organization,
  OrganizationOverview,
  Status,
  Task,
} from "./types";

type ApiOptions = RequestInit & {
  cacheKey?: string;
};

type ApiErrorPayload = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  formErrors?: string[];
  code?: string;
};

export class MobileApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly details?: ApiErrorPayload,
  ) {
    super(message);
  }
}

async function token() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function apiFetch<T>(path: string, options: ApiOptions = {}) {
  const accessToken = await token();
  const url = `${config.apiBaseUrl}${path}`;
  console.log("[mobile-api] request", {
    method: options.method ?? "GET",
    url,
    hasBearerToken: Boolean(accessToken),
  });
  if (!accessToken) {
    throw new MobileApiError("Du skal logge ind igen.", 401);
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...options.headers,
      },
    });
    const data = (await response.json().catch(() => ({}))) as
      | T
      | ApiErrorPayload;
    console.log("[mobile-api] response", {
      method: options.method ?? "GET",
      url,
      status: response.status,
      ok: response.ok,
      body: data,
    });
    if (!response.ok) {
      const errorMessage =
        typeof data === "object" &&
        data !== null &&
        "error" in data &&
        typeof data.error === "string"
          ? data.error
          : "Handlingen kunne ikke gennemføres.";
      throw new MobileApiError(
        errorMessage,
        response.status,
        typeof data === "object" && data !== null ? data : undefined,
      );
    }
    if (options.cacheKey && options.method === undefined) {
      await AsyncStorage.setItem(options.cacheKey, JSON.stringify(data));
    }
    return data as T;
  } catch (error) {
    if (error instanceof MobileApiError) throw error;
    console.warn("[mobile-api] network failure", {
      method: options.method ?? "GET",
      url,
      hasBearerToken: Boolean(accessToken),
      error,
    });
    throw new MobileApiError(
      "Der er ikke forbindelse til serveren. Prøv igen, når du er online.",
    );
  }
}

type OrganizationApiResponse = {
  organizations?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function textFrom(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function recordFrom(value: unknown) {
  return isRecord(value) ? value : null;
}

function arrayFrom(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function normalizeOrganization(raw: unknown, index: number): Organization {
  const row = recordFrom(raw) ?? {};
  const nested =
    recordFrom(row.organization) ??
    recordFrom(row.organizations) ??
    recordFrom(row.organization_data) ??
    row;
  const committees = arrayFrom(
    nested.committees ?? row.committees ?? row.committee_memberships,
  ).flatMap((committee, committeeIndex) => {
    const committeeRecord = recordFrom(committee);
    if (!committeeRecord) return [];
    const committeeId =
      textFrom(committeeRecord.id) ??
      textFrom(committeeRecord.committee_id) ??
      `committee-${index}-${committeeIndex}`;
    return [
      {
        id: committeeId,
        name:
          textFrom(committeeRecord.name) ??
          textFrom(committeeRecord.committee_name) ??
          "Udvalg uden navn",
        description: textFrom(committeeRecord.description),
      },
    ];
  });
  const id =
    textFrom(nested.id) ??
    textFrom(row.id) ??
    textFrom(row.organization_id) ??
    textFrom(row.organizationId) ??
    `organization-${index}`;
  const name =
    textFrom(nested.name) ??
    textFrom(row.name) ??
    textFrom(row.organization_name) ??
    "Organisation uden navn";
  const committeeCountValue =
    typeof nested.committeeCount === "number"
      ? nested.committeeCount
      : typeof nested.committee_count === "number"
        ? nested.committee_count
        : typeof row.committeeCount === "number"
          ? row.committeeCount
          : typeof row.committee_count === "number"
            ? row.committee_count
            : committees.length;

  return {
    id,
    name,
    committeeCount: committeeCountValue,
    committees,
    role: textFrom(row.role),
  };
}

function normalizeOrganizationsResponse(response: OrganizationApiResponse) {
  console.log("Mobile organizations raw response", response);
  const normalized = arrayFrom(response.organizations).map(normalizeOrganization);
  const deduped = [
    ...new Map(normalized.map((organization) => [organization.id, organization]))
      .values(),
  ];
  console.log("Mobile organizations normalized", deduped);
  return deduped;
}

export const mobileApi = {
  async organizations() {
    const response = await apiFetch<OrganizationApiResponse>("/api/mobile/organizations", {
      cacheKey: "mobile:organizations",
    });
    return { organizations: normalizeOrganizationsResponse(response) };
  },
  overview(organizationId: string) {
    return apiFetch<OrganizationOverview>(
      `/api/mobile/organizations/${organizationId}/overview`,
      { cacheKey: `mobile:overview:${organizationId}` },
    );
  },
  myTasks(organizationId: string) {
    return apiFetch<{ userId: string; tasks: Task[]; editableCommitteeIds: string[] }>(
      `/api/mobile/organizations/${organizationId}/tasks/my`,
      { cacheKey: `mobile:my-tasks:${organizationId}` },
    );
  },
  decisions(organizationId: string) {
    return apiFetch<{ decisions: Decision[] }>(
      `/api/mobile/organizations/${organizationId}/decisions`,
      { cacheKey: `mobile:decisions:${organizationId}` },
    );
  },
  async meetings(organizationId: string) {
    const response = await apiFetch<{
      upcomingMeetings?: Meeting[];
      recentMinutes?: OrganizationOverview["recentMinutes"];
    }>(`/api/mobile/organizations/${organizationId}/meetings`, {
      cacheKey: `mobile:meetings:${organizationId}`,
    });
    return {
      upcomingMeetings: Array.isArray(response.upcomingMeetings)
        ? response.upcomingMeetings
        : [],
      recentMinutes: Array.isArray(response.recentMinutes)
        ? response.recentMinutes
        : [],
    };
  },
  meeting(meetingId: string) {
    return apiFetch<MeetingDetail>(`/api/mobile/meetings/${meetingId}`, {
      cacheKey: `mobile:meeting:${meetingId}`,
    });
  },
  updateTaskStatus(organizationId: string, taskId: string, status: Status) {
    return apiFetch<Task>(`/api/mobile/tasks/${taskId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ organizationId, status }),
    });
  },
  taskComments(organizationId: string, taskId: string) {
    return apiFetch<{ comments: Array<{ id: string; body: string; created_at: string }> }>(
      `/api/mobile/tasks/${taskId}/comments?organizationId=${organizationId}`,
      { cacheKey: `mobile:task-comments:${taskId}` },
    );
  },
  createTaskComment(organizationId: string, taskId: string, body: string) {
    return apiFetch(`/api/mobile/tasks/${taskId}/comments`, {
      method: "POST",
      body: JSON.stringify({ organizationId, taskId, body }),
    });
  },
  quickMeeting(input: {
    organizationId: string;
    committeeId: string;
    title: string;
    startsAt: string;
    minutesText: string;
  }) {
    console.log("[mobile-api] quickMeeting payload", {
      organizationId: input.organizationId,
      committeeId: input.committeeId,
      titleLength: input.title.length,
      startsAt: input.startsAt,
      hasMinutesText: Boolean(input.minutesText.trim()),
    });
    return apiFetch<Meeting>(
      `/api/mobile/committees/${input.committeeId}/meetings/quick`,
      {
        method: "POST",
        body: JSON.stringify({
          organizationId: input.organizationId,
          committeeId: input.committeeId,
          title: input.title,
          description:
            "Hurtigt/ad hoc møde oprettet uden dagsorden via mobilappen.",
          startsAt: input.startsAt,
          endsAt: null,
          location: null,
          minutesText: input.minutesText,
        }),
      },
    );
  },
  aiOverview(organizationId: string, committeeId: string, meetingId: string) {
    return apiFetch<AiMeetingOverview>(`/api/mobile/meetings/${meetingId}/overview`, {
      method: "POST",
      body: JSON.stringify({ organizationId, committeeId, meetingId }),
    });
  },
  aiMinutesAssist(input: {
    organizationId: string;
    committeeId: string;
    meetingId: string;
    agendaItemId?: string | null;
    source: "meeting_minutes" | "agenda_item_minutes";
    field: "minutes_text" | "notes";
    action: AiMinutesAssistantAction;
    text: string;
  }) {
    return apiFetch<AiMinutesAssistantSuggestion>(
      `/api/mobile/meetings/${input.meetingId}/minutes/ai-assist`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  },
  askAssistant(organizationId: string, question: string) {
    return apiFetch<{
      status: "ok";
      answer: {
        answer: string;
        sources: Array<{
          title: string;
          type: string;
          href: string;
          excerpt: string;
        }>;
        follow_up_questions: string[];
        confidence_note: string;
      };
    }>(`/api/mobile/organizations/${organizationId}/assistant`, {
      method: "POST",
      body: JSON.stringify({ organizationId, question }),
    });
  },
};

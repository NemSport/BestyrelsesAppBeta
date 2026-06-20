import AsyncStorage from "@react-native-async-storage/async-storage";

import { config } from "./config";
import { supabase } from "./supabase";
import type {
  AiMeetingOverview,
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

export class MobileApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
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
  if (!accessToken) {
    throw new MobileApiError("Du skal logge ind igen.", 401);
  }

  try {
    const response = await fetch(`${config.apiBaseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...options.headers,
      },
    });
    const data = (await response.json().catch(() => ({}))) as
      | T
      | { error?: string };
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
      );
    }
    if (options.cacheKey && options.method === undefined) {
      await AsyncStorage.setItem(options.cacheKey, JSON.stringify(data));
    }
    return data as T;
  } catch (error) {
    if (error instanceof MobileApiError) throw error;
    if (options.cacheKey) {
      const cached = await AsyncStorage.getItem(options.cacheKey);
      if (cached) return JSON.parse(cached) as T;
    }
    throw new MobileApiError(
      "Der er ikke forbindelse til serveren. Prøv igen, når du er online.",
    );
  }
}

export const mobileApi = {
  organizations() {
    return apiFetch<{ organizations: Organization[] }>("/api/mobile/organizations", {
      cacheKey: "mobile:organizations",
    });
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
  meetings(organizationId: string) {
    return apiFetch<{
      upcomingMeetings: Meeting[];
      recentMinutes: OrganizationOverview["recentMinutes"];
    }>(`/api/mobile/organizations/${organizationId}/meetings`, {
      cacheKey: `mobile:meetings:${organizationId}`,
    });
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

import { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { Session } from "@supabase/supabase-js";

import { mobileApi, MobileApiError } from "./src/api";
import {
  AgendaPreview,
  AppScreen,
  MeetingCard,
  SectionCard,
  TaskCard,
} from "./src/components";
import { missingConfig } from "./src/config";
import { preparePushNotifications } from "./src/push";
import { supabase } from "./src/supabase";
import type {
  Committee,
  AiMeetingOverview,
  AiMinutesAssistantAction,
  AiMinutesAssistantSuggestion,
  Decision,
  Meeting,
  MeetingDetail,
  Organization,
  OrganizationOverview,
  Task,
} from "./src/types";
import {
  agendaLabel,
  decisionStatusLabels,
  formatDateTime,
  formatMobileDateTimeInput,
  parseMobileDateTimeInput,
  plainTextFromRichText,
  sortedAgendaItems,
  taskStatusLabels,
} from "./src/utils";

type TabKey = "home" | "meetings" | "tasks" | "more";
type MoreView = "menu" | "decisions";
type FormFieldErrors = Partial<
  Record<"organizationId" | "committeeId" | "title" | "startsAt" | "minutesText", string>
>;

const selectedOrganizationStorageKey = "mobile:selected-organization-id";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "home", label: "Hjem" },
  { key: "meetings", label: "Møder" },
  { key: "tasks", label: "Opgaver" },
  { key: "more", label: "Mere" },
];

function recentMinuteAsMeeting(
  organizationId: string,
  minutes: OrganizationOverview["recentMinutes"][number],
): Meeting {
  return {
    id: minutes.meetingId,
    organization_id: organizationId,
    committee_id: minutes.committeeId,
    title: minutes.meetingTitle,
    starts_at: minutes.meetingStartsAt,
    status: minutes.status,
    committeeName: minutes.committeeName,
  };
}

function mergeMeetingsById(items: Meeting[]) {
  const merged = new Map<string, Meeting>();
  for (const meeting of items) {
    const existing = merged.get(meeting.id);
    if (!existing) {
      merged.set(meeting.id, meeting);
      continue;
    }

    const nextHasAgenda = Array.isArray(meeting.agenda_item_occurrences);
    const existingHasAgenda = Array.isArray(existing.agenda_item_occurrences);
    merged.set(meeting.id, {
      ...existing,
      ...meeting,
      agenda_item_occurrences:
        nextHasAgenda || !existingHasAgenda
          ? meeting.agenda_item_occurrences
          : existing.agenda_item_occurrences,
      committeeName: meeting.committeeName ?? existing.committeeName,
    });
  }
  return [...merged.values()];
}

function sortByStartsAtAscending(left: Meeting, right: Meeting) {
  const diff =
    new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime();
  return diff || left.title.localeCompare(right.title);
}

function sortByStartsAtDescending(left: Meeting, right: Meeting) {
  return sortByStartsAtAscending(right, left);
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoadingSession(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (loadingSession) {
    return <Loading text="Starter BestyrelsesApp..." />;
  }

  if (missingConfig().length > 0) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <Text style={styles.title}>Mobilappen mangler konfiguration</Text>
          <Text style={styles.muted}>{missingConfig().join(", ")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return session ? <MobileShell session={session} /> : <LoginScreen />;
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function login() {
    setLoading(true);
    setError(null);
    const { error: caught } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (caught) setError("Login mislykkedes. Tjek e-mail og adgangskode.");
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.loginCard}>
        <Text style={styles.eyebrow}>BestyrelsesApp mobil</Text>
        <Text style={styles.title}>Log ind</Text>
        <Text style={styles.muted}>
          Mobil companion til møder, referater og opgaver.
        </Text>
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="E-mail"
          style={styles.input}
          value={email}
        />
        <TextInput
          onChangeText={setPassword}
          placeholder="Adgangskode"
          secureTextEntry
          style={styles.input}
          value={password}
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <PrimaryButton
          disabled={loading || !email || !password}
          label={loading ? "Logger ind..." : "Log ind"}
          onPress={login}
        />
      </View>
    </SafeAreaView>
  );
}

function MobileShell({ session }: { session: Session }) {
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [overview, setOverview] = useState<OrganizationOverview | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [meetingDetail, setMeetingDetail] = useState<MeetingDetail | null>(null);
  const [meetingDetailError, setMeetingDetailError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const [organizationsLoaded, setOrganizationsLoaded] = useState(false);
  const [moreView, setMoreView] = useState<MoreView>("menu");
  const [quickActionOpen, setQuickActionOpen] = useState(false);

  const safeOrganizations = Array.isArray(organizations) ? organizations : [];
  const organization =
    safeOrganizations.find((item) => item.id === organizationId) ??
    safeOrganizations[0];
  const committees =
    overview?.committees.map((entry) => entry.committee) ??
    organization?.committees ??
    [];

  const allMeetings = useMemo(() => {
    const recentAsMeetings = organizationId
      ? (overview?.recentMinutes ?? []).map((minutes) =>
          recentMinuteAsMeeting(organizationId, minutes),
        )
      : [];
    return mergeMeetingsById([
      ...meetings,
      ...(overview?.upcomingMeetings ?? []),
      ...recentAsMeetings,
    ]);
  }, [meetings, organizationId, overview]);

  const upcomingMeetings = useMemo(() => {
    const now = Date.now();
    return allMeetings
      .filter(
        (meeting) =>
          meeting.status !== "cancelled" &&
          new Date(meeting.starts_at).getTime() >= now,
      )
      .sort(sortByStartsAtAscending);
  }, [allMeetings]);

  const recentMeetings = useMemo(() => {
    const now = Date.now();
    return allMeetings
      .filter((meeting) => new Date(meeting.starts_at).getTime() < now)
      .sort(sortByStartsAtDescending);
  }, [allMeetings]);

  async function loadOrganizations() {
    setLoading(true);
    setError(null);
    try {
      const organizationResult = await mobileApi.organizations();
      const storedOrganizationId = await AsyncStorage.getItem(
        selectedOrganizationStorageKey,
      );
      const availableOrganizations = Array.isArray(
        organizationResult.organizations,
      )
        ? organizationResult.organizations
        : [];
      const storedOrganization = availableOrganizations.find(
        (candidate) => candidate.id === storedOrganizationId,
      );
      if (storedOrganizationId && !storedOrganization) {
        await AsyncStorage.removeItem(selectedOrganizationStorageKey);
      }
      const selectedId =
        (organizationId &&
        availableOrganizations.some((candidate) => candidate.id === organizationId)
          ? organizationId
          : null) ??
        storedOrganization?.id ??
        (availableOrganizations.length === 1
          ? availableOrganizations[0]?.id ?? null
          : null);

      setOrganizations(availableOrganizations);
      setOrganizationId(selectedId);
      setOrganizationsLoaded(true);

      if (!selectedId) {
        setOverview(null);
        setMeetings([]);
        setTasks([]);
        setDecisions([]);
        return;
      }

      await loadOrganizationData(selectedId);
    } catch (caught) {
      console.warn("[mobile] organizations load failed", {
        selectedOrganizationId: organizationId,
        error: caught,
      });
      setOrganizations([]);
      setOrganizationId(null);
      setOrganizationsLoaded(true);
      setOverview(null);
      setMeetings([]);
      setTasks([]);
      setDecisions([]);
      setError(messageFrom(caught));
    } finally {
      setLoading(false);
    }
  }

  async function loadOrganizationData(selectedId: string) {
    setLoading(true);
    setError(null);
    setDecisionError(null);
    console.log("[mobile] load organization data", {
      selectedOrganizationId: selectedId,
    });
    const [overviewResult, tasksResult, meetingsResult, decisionsResult] =
      await Promise.allSettled([
        mobileApi.overview(selectedId),
        mobileApi.myTasks(selectedId),
        mobileApi.meetings(selectedId),
        mobileApi.decisions(selectedId),
      ]);

    if (overviewResult.status === "fulfilled") {
      setOverview(overviewResult.value);
    } else {
      console.warn("[mobile] overview load failed", {
        selectedOrganizationId: selectedId,
        error: overviewResult.reason,
      });
      setOverview(null);
    }

    if (tasksResult.status === "fulfilled") {
      setTasks(tasksResult.value.tasks);
    } else {
      console.warn("[mobile] tasks load failed", {
        selectedOrganizationId: selectedId,
        error: tasksResult.reason,
      });
      setTasks([]);
    }

    if (meetingsResult.status === "fulfilled") {
      setMeetings(
        mergeMeetingsById([
          ...meetingsResult.value.upcomingMeetings,
          ...meetingsResult.value.recentMinutes.map((minutes) =>
            recentMinuteAsMeeting(selectedId, minutes),
          ),
        ]),
      );
    } else {
      console.warn("[mobile] meetings load failed", {
        selectedOrganizationId: selectedId,
        error: meetingsResult.reason,
      });
      setMeetings([]);
    }

    if (decisionsResult.status === "fulfilled") {
      setDecisions(decisionsResult.value.decisions);
    } else {
      console.warn("[mobile] decisions load failed", {
        selectedOrganizationId: selectedId,
        error: decisionsResult.reason,
      });
      setDecisionError(messageFrom(decisionsResult.reason));
      setDecisions([]);
    }

    if (
      overviewResult.status === "rejected" &&
      tasksResult.status === "rejected" &&
      meetingsResult.status === "rejected"
    ) {
      setError(messageFrom(overviewResult.reason));
    }

    setLoading(false);
  }

  useEffect(() => {
    void loadOrganizations();
    void preparePushNotifications().then((result) => {
      setPushMessage(result.message);
    });
  }, []);

  async function selectOrganization(nextOrganizationId: string) {
    if (
      safeOrganizations.length > 0 &&
      !safeOrganizations.some((candidate) => candidate.id === nextOrganizationId)
    ) {
      await AsyncStorage.removeItem(selectedOrganizationStorageKey);
      setOrganizationId(null);
      setError("Den valgte organisation findes ikke længere på din bruger.");
      return;
    }

    setOrganizationId(nextOrganizationId);
    setSelectedMeetingId(null);
    setMeetingDetail(null);
    setMeetingDetailError(null);
    setActiveTab("home");
    setMoreView("menu");
    await AsyncStorage.setItem(
      selectedOrganizationStorageKey,
      nextOrganizationId,
    );
    await loadOrganizationData(nextOrganizationId);
  }

  async function openMeeting(meetingId: string) {
    setSelectedMeetingId(meetingId);
    setActiveTab("meetings");
    setMeetingDetail(null);
    setMeetingDetailError(null);

    setLoading(true);
    setError(null);
    console.log("[mobile] open meeting", {
      selectedOrganizationId: organizationId,
      meetingId,
    });
    try {
      setMeetingDetail(await mobileApi.meeting(meetingId));
    } catch (caught) {
      const message = messageFrom(caught);
      console.warn("[mobile] meeting detail load failed", {
        selectedOrganizationId: organizationId,
        meetingId,
        error: caught,
      });
      setError(message);
      setMeetingDetailError(message);
    } finally {
      setLoading(false);
    }
  }

  function showPlaceholder(label: string) {
    Alert.alert(label, "Denne navigation er en del af layout-spiken og kobles til rigtig skærm senere.");
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>Bestyrelses Companion</Text>
          <Text style={styles.headerTitle}>
            {organization?.name ?? "BestyrelsesApp"}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            disabled={!organizationId}
            onPress={() => setQuickActionOpen(true)}
            style={styles.quickButton}
          >
            <Text style={styles.quickButtonText}>+ Opret</Text>
          </Pressable>
          <Text style={styles.profileText}>{session.user.email ?? "Profil"}</Text>
        </View>
      </View>

      {loading ? <Loading text="Henter data..." /> : null}
      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

      {organizationsLoaded && safeOrganizations.length === 0 && !loading ? (
        <NoOrganizationScreen onLogout={() => void supabase.auth.signOut()} />
      ) : null}

      {organizationsLoaded &&
      safeOrganizations.length > 1 &&
      !organizationId &&
      !loading ? (
        <OrganizationPickerScreen
          onSelect={(nextOrganizationId) => {
            void selectOrganization(nextOrganizationId);
          }}
          organizations={safeOrganizations}
        />
      ) : null}

      {!organizationsLoaded && loading ? (
        <OrganizationLoadingScreen />
      ) : null}

      {organizationId && activeTab === "home" ? (
        <HomeScreen
          nextMeeting={upcomingMeetings[0] ?? null}
          onOpenMeeting={openMeeting}
          organizationName={organization?.name ?? "valgt organisation"}
          overview={overview}
          tasks={tasks}
        />
      ) : null}

      {organizationId && activeTab === "meetings" ? (
        selectedMeetingId && meetingDetail ? (
          <MeetingDetailReadScreen
            detail={meetingDetail}
            onBack={() => {
              setSelectedMeetingId(null);
              setMeetingDetail(null);
              setMeetingDetailError(null);
            }}
            tasks={tasks.filter((task) => task.meeting_id === meetingDetail.meeting.id)}
          />
        ) : selectedMeetingId && meetingDetailError ? (
          <MeetingDetailErrorScreen
            message={meetingDetailError}
            onBack={() => {
              setSelectedMeetingId(null);
              setMeetingDetailError(null);
            }}
          />
        ) : (
          <MeetingsScreen
            onOpenMeeting={openMeeting}
            recentMeetings={recentMeetings}
            upcomingMeetings={upcomingMeetings}
          />
        )
      ) : null}

      {organizationId && activeTab === "tasks" ? (
        <TasksScreen
          organizationName={organization?.name ?? "valgt organisation"}
          tasks={tasks}
        />
      ) : null}

      {organizationId && activeTab === "more" ? (
        moreView === "decisions" ? (
          <DecisionsScreen
            decisionError={decisionError}
            decisions={decisions}
            onBack={() => setMoreView("menu")}
          />
        ) : (
          <MoreScreen
            canSwitchOrganization={safeOrganizations.length > 1}
            onChangeOrganization={() => setOrganizationId(null)}
            onLogout={() => void supabase.auth.signOut()}
            onOpen={(label) => {
              if (label === "Beslutninger") {
                setMoreView("decisions");
                return;
              }
              showPlaceholder(label);
            }}
            organizationName={organization?.name ?? "valgt organisation"}
            pushMessage={pushMessage}
          />
        )
      ) : null}

      {organizationId ? (
        <BottomNavigation activeTab={activeTab} onChange={setActiveTab} />
      ) : null}

      <QuickActionModal
        committees={committees}
        contextMeeting={meetingDetail?.meeting ?? null}
        onClose={() => setQuickActionOpen(false)}
        onCreated={(meeting) => {
          setQuickActionOpen(false);
          if (organizationId) {
            void loadOrganizationData(organizationId);
          }
          void openMeeting(meeting.id);
        }}
        open={quickActionOpen}
        organizationId={organizationId}
      />
    </SafeAreaView>
  );
}

function OrganizationPickerScreen({
  organizations,
  onSelect,
}: {
  organizations?: Organization[];
  onSelect: (organizationId: string) => void;
}) {
  const safeOrganizations = organizations ?? [];

  return (
    <AppScreen
      title="Vælg organisation"
      subtitle="Du er medlem af flere organisationer. Vælg hvilken du vil arbejde i."
    >
      <SectionCard title="Dine organisationer">
        {safeOrganizations.length > 0 ? (
          safeOrganizations.map((organization, index) => (
            <Pressable
              key={organization.id || `${organization.name}-${index}`}
              onPress={() => onSelect(organization.id)}
              style={styles.organizationChoice}
            >
              <View style={styles.organizationChoiceText}>
                <Text style={styles.rowTitle}>
                  {organization.name || "Organisation uden navn"}
                </Text>
                <Text style={styles.muted}>
                  {organization.committeeCount ?? (organization.committees ?? []).length} udvalg
                  {organization.role ? ` · ${organization.role}` : ""}
                </Text>
              </View>
              <Text style={styles.moreArrow}>›</Text>
            </Pressable>
          ))
        ) : (
          <Text style={styles.muted}>
            Der blev ikke fundet organisationer på din bruger.
          </Text>
        )}
      </SectionCard>
    </AppScreen>
  );
}

function OrganizationLoadingScreen() {
  return (
    <AppScreen
      title="Henter organisationer..."
      subtitle="Vi finder de organisationer, din bruger har adgang til."
    >
      <SectionCard title="Vent et øjeblik">
        <View style={styles.inlineLoading}>
          <ActivityIndicator />
          <Text style={styles.muted}>Henter organisationer...</Text>
        </View>
      </SectionCard>
    </AppScreen>
  );
}

function NoOrganizationScreen({ onLogout }: { onLogout: () => void }) {
  return (
    <AppScreen
      title="Ingen organisationer"
      subtitle="Din bruger er logget ind, men har ikke adgang til en organisation endnu."
    >
      <SectionCard title="Næste skridt">
        <Text style={styles.muted}>
          Bed en administrator om at invitere dig til en organisation i
          BestyrelsesApp.
        </Text>
      </SectionCard>
      <Pressable onPress={onLogout} style={styles.logoutButton}>
        <Text style={styles.logoutText}>Log ud</Text>
      </Pressable>
    </AppScreen>
  );
}

function HomeScreen({
  nextMeeting,
  overview,
  tasks,
  organizationName,
  onOpenMeeting,
}: {
  nextMeeting: Meeting | null;
  overview: OrganizationOverview | null;
  tasks: Task[];
  organizationName: string;
  onOpenMeeting: (meetingId: string) => void;
}) {
  const priorityTasks = tasks.slice(0, 3);
  const committees = overview?.committees ?? [];

  return (
    <AppScreen
      title="Hjem"
      subtitle={`Dit korte overblik før næste møde. Aktiv organisation: ${organizationName}`}
    >
      <SectionCard title="Næste møde">
        {nextMeeting ? (
          <MeetingCard
            meeting={nextMeeting}
            onPress={() => onOpenMeeting(nextMeeting.id)}
          />
        ) : (
          <Text style={styles.muted}>Der er ingen kommende mÃ¸der i denne organisation.</Text>
        )}
      </SectionCard>

      <SectionCard title="Mine vigtigste opgaver">
        {priorityTasks.length > 0 ? (
          priorityTasks.map((task) => <TaskCard key={task.id} task={task} compact />)
        ) : (
          <Text style={styles.muted}>Du har ingen åbne opgaver lige nu.</Text>
        )}
      </SectionCard>

      <SectionCard title="Mine udvalg">
        {committees.length > 0 ? (
          committees.slice(0, 4).map((entry) => (
            <View key={entry.committee.id} style={styles.listRow}>
              <Text style={styles.rowTitle}>{entry.committee.name}</Text>
              <Text style={styles.muted}>
                {entry.openTaskCount} opgaver · {entry.activeDecisionCount} beslutninger
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.muted}>Ingen udvalg at vise endnu.</Text>
        )}
      </SectionCard>

      <SectionCard title="Seneste referat">
        {overview?.recentMinutes[0] ? (
          <Text style={styles.body}>
            {overview.recentMinutes[0].meetingTitle} ·{" "}
            {formatDateTime(overview.recentMinutes[0].updatedAt)}
          </Text>
        ) : (
          <Text style={styles.muted}>Ingen nyere referater i dette overblik.</Text>
        )}
      </SectionCard>
    </AppScreen>
  );
}

function MeetingsScreen({
  onOpenMeeting,
  recentMeetings,
  upcomingMeetings,
}: {
  onOpenMeeting: (meetingId: string) => void;
  recentMeetings: Meeting[];
  upcomingMeetings: Meeting[];
}) {
  return (
    <AppScreen title="Møder" subtitle="Kommende og seneste møder med agenda-preview.">
      {upcomingMeetings.length === 0 && recentMeetings.length === 0 ? (
        <SectionCard title="Ingen møder">
          <Text style={styles.muted}>Der er ingen møder at vise endnu.</Text>
        </SectionCard>
      ) : null}

      <SectionCard title="Kommende møder">
        {upcomingMeetings.length > 0 ? (
          upcomingMeetings.map((meeting) => (
          <MeetingCard
            key={meeting.id}
            meeting={meeting}
            onPress={() => onOpenMeeting(meeting.id)}
          />
        ))
      ) : (
          <Text style={styles.muted}>Der er ingen kommende møder.</Text>
        )}
      </SectionCard>

      <SectionCard title="Seneste møder">
        {recentMeetings.length > 0 ? (
          recentMeetings.map((meeting) => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              onPress={() => onOpenMeeting(meeting.id)}
            />
          ))
        ) : (
          <Text style={styles.muted}>Der er ingen tidligere møder i overblikket.</Text>
        )}
      </SectionCard>
    </AppScreen>
  );
}

function MeetingDetailScreen({
  detail,
  onBack,
}: {
  detail: MeetingDetail;
  onBack: () => void;
}) {
  const agenda = detail.meeting.agenda_item_occurrences ?? [];
  const minutesText = detail.minutes.meetingMinutes?.minutes_text?.trim();
  const decisionCount = detail.minutes.agendaItemMinutes.filter((item) =>
    Boolean(item.decision?.trim()),
  ).length;
  const taskCount = agenda.filter(
    (item) => item.agenda_items?.item_type === "follow_up",
  ).length;

  return (
    <AppScreen
      title={detail.meeting.title}
      subtitle={`${detail.meeting.committeeName ?? "Udvalg"} · ${formatDateTime(detail.meeting.starts_at)}`}
    >
      <Pressable onPress={onBack} style={styles.backButton}>
        <Text style={styles.backText}>Tilbage til møder</Text>
      </Pressable>

      <SectionCard title="AI-overblik">
        <Text style={styles.muted}>
          Åbn den aktive mødedetaljevisning for mobil AI-overblik.
        </Text>
      </SectionCard>

      <SectionCard title="Dagsorden">
        <AgendaPreview limit={999} meeting={detail.meeting} showNumber />
      </SectionCard>

      <SectionCard title="Referat">
        <Text style={styles.body}>
          {minutesText || "Referat er ikke skrevet endnu. Åbn webappen for fuld redigering."}
        </Text>
      </SectionCard>

      <View style={styles.twoColumn}>
        <SectionCard title="Beslutninger">
          <Text style={styles.bigNumber}>{decisionCount}</Text>
          <Text style={styles.muted}>Fundet i punktreferater</Text>
        </SectionCard>
        <SectionCard title="Opgaver">
          <Text style={styles.bigNumber}>{taskCount}</Text>
          <Text style={styles.muted}>Relaterede opfølgningspunkter</Text>
        </SectionCard>
      </View>
    </AppScreen>
  );
}

type MinutesAssistTarget = {
  agendaItemId?: string | null;
  field: "minutes_text" | "notes";
  label: string;
  source: "meeting_minutes" | "agenda_item_minutes";
  text: string;
};

const minutesAssistActions: Array<{
  action: AiMinutesAssistantAction;
  label: string;
}> = [
  { action: "fix_language", label: "Ret sprog" },
  { action: "shorten", label: "Kort opsummering" },
  { action: "make_decision_ready", label: "Beslutningsklar" },
  { action: "professional_board_style", label: "Bestyrelsesstil" },
];

function MeetingDetailReadScreen({
  detail,
  onBack,
  tasks,
}: {
  detail: MeetingDetail;
  onBack: () => void;
  tasks: Task[];
}) {
  const agenda = sortedAgendaItems(detail.meeting);
  const minutesByAgendaItemId = new Map(
    detail.minutes.agendaItemMinutes.map((minutes) => [
      minutes.agenda_item_id,
      minutes,
    ]),
  );
  const minutesText = plainTextFromRichText(
    detail.minutes.meetingMinutes?.minutes_text,
  );
  const pointMinutes = agenda.flatMap((occurrence, index) => {
    const item = occurrence.agenda_items;
    if (!item) return [];
    const minutes = minutesByAgendaItemId.get(item.id);
    const notes = plainTextFromRichText(minutes?.notes);
    return notes
      ? [
          {
            id: item.id,
            label: `${index + 1}. (${agendaLabel(item.item_type)}) ${item.title}`,
            notes,
          },
        ]
      : [];
  });
  const decisions = agenda.flatMap((occurrence, index) => {
    const item = occurrence.agenda_items;
    if (!item) return [];
    const minutes = minutesByAgendaItemId.get(item.id);
    const decision = plainTextFromRichText(minutes?.decision);
    return decision
      ? [
          {
            id: item.id,
            label: `${index + 1}. (${agendaLabel(item.item_type)}) ${item.title}`,
            decision,
          },
        ]
      : [];
  });
  const meetingStatus = detail.minutes.meetingMinutes?.status ?? detail.meeting.status;
  const [aiOverview, setAiOverview] = useState<AiMeetingOverview | null>(null);
  const [aiOverviewLoading, setAiOverviewLoading] = useState(false);
  const [aiOverviewError, setAiOverviewError] = useState<string | null>(null);
  const [assistTarget, setAssistTarget] = useState<MinutesAssistTarget | null>(null);

  async function generateAiOverview() {
    setAiOverviewLoading(true);
    setAiOverviewError(null);
    console.log("[mobile] generate AI overview", {
      selectedOrganizationId: detail.meeting.organization_id,
      selectedCommitteeId: detail.meeting.committee_id,
      meetingId: detail.meeting.id,
    });
    try {
      setAiOverview(
        await mobileApi.aiOverview(
          detail.meeting.organization_id,
          detail.meeting.committee_id,
          detail.meeting.id,
        ),
      );
    } catch (caught) {
      console.warn("[mobile] AI overview failed", {
        selectedOrganizationId: detail.meeting.organization_id,
        selectedCommitteeId: detail.meeting.committee_id,
        meetingId: detail.meeting.id,
        error: caught,
      });
      setAiOverviewError(messageFrom(caught));
    } finally {
      setAiOverviewLoading(false);
    }
  }

  function openMinutesAssist(target: MinutesAssistTarget) {
    if (target.text.trim().length < 20) {
      Alert.alert(
        "Teksten er for kort",
        "Teksten er for kort til at give et brugbart AI-forslag.",
      );
      return;
    }
    setAssistTarget(target);
  }

  return (
    <AppScreen
      title={detail.meeting.title}
      subtitle={`${detail.meeting.committeeName ?? "Udvalg"} · ${formatDateTime(detail.meeting.starts_at)}`}
    >
      <Pressable onPress={onBack} style={styles.backButton}>
        <Text style={styles.backText}>Tilbage til møder</Text>
      </Pressable>

      <View style={styles.detailHeader}>
        <View style={styles.detailHeaderText}>
          <Text style={styles.eyebrow}>Mødedetalje</Text>
          <Text style={styles.rowTitle}>{detail.meeting.committeeName ?? "Udvalg"}</Text>
          <Text style={styles.muted}>{formatDateTime(detail.meeting.starts_at)}</Text>
        </View>
        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>{meetingStatus}</Text>
        </View>
      </View>

      <SectionCard title="AI-overblik">
        {aiOverview?.overview ? (
          <AiOverviewContent overview={aiOverview.overview} />
        ) : aiOverview?.status === "empty" ? (
          <Text style={styles.muted}>
            Der er ikke nok mødedata til et brugbart AI-overblik endnu.
          </Text>
        ) : (
          <Text style={styles.muted}>
            Generér et kort AI-overblik over dagsorden, referat,
            beslutningspunkter og opfølgning.
          </Text>
        )}
        {aiOverviewError ? <Text style={styles.errorText}>{aiOverviewError}</Text> : null}
        <Pressable
          disabled={aiOverviewLoading}
          onPress={generateAiOverview}
          style={[styles.secondaryButton, aiOverviewLoading && styles.disabled]}
        >
          <Text style={styles.secondaryButtonText}>
            {aiOverviewLoading
              ? "Genererer..."
              : aiOverview?.overview
                ? "Opdater AI-overblik"
                : "Generer AI-overblik"}
          </Text>
        </Pressable>
      </SectionCard>

      <SectionCard title="Dagsorden">
        {agenda.length > 0 ? (
          agenda.map((occurrence, index) => {
            const item = occurrence.agenda_items;
            if (!item) return null;
            const itemMinutes = minutesByAgendaItemId.get(item.id);
            const notePreview = plainTextFromRichText(itemMinutes?.notes);
            return (
              <View key={`${occurrence.position}-${item.id}`} style={styles.agendaDetailRow}>
                <Text style={styles.agendaPosition}>{index + 1}</Text>
                <View style={styles.agendaDetailText}>
                  <Text style={styles.agendaDetailTitle}>
                    ({agendaLabel(item.item_type)}) {item.title}
                  </Text>
                  {notePreview ? (
                    <Text numberOfLines={2} style={styles.muted}>
                      Referat: {notePreview}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })
        ) : (
          <Text style={styles.muted}>Der er ingen dagsordenspunkter på mødet endnu.</Text>
        )}
      </SectionCard>

      <SectionCard title="Referat">
        {minutesText ? (
          <View style={styles.readingItem}>
            <View style={styles.readingHeader}>
              <Text style={styles.rowTitle}>Generelt referat</Text>
              <Pressable
                onPress={() =>
                  openMinutesAssist({
                    field: "minutes_text",
                    label: "Generelt referat",
                    source: "meeting_minutes",
                    text: minutesText,
                  })
                }
                style={styles.aiButton}
              >
                <Text style={styles.aiButtonText}>AI-hjælp</Text>
              </Pressable>
            </View>
            <Text style={styles.body}>{minutesText}</Text>
          </View>
        ) : null}
        {pointMinutes.length > 0 ? (
          <View style={styles.readingList}>
            {pointMinutes.map((minutes) => (
              <View key={minutes.id} style={styles.readingItem}>
                <View style={styles.readingHeader}>
                  <Text style={styles.rowTitle}>{minutes.label}</Text>
                  <Pressable
                    onPress={() =>
                      openMinutesAssist({
                        agendaItemId: minutes.id,
                        field: "notes",
                        label: minutes.label,
                        source: "agenda_item_minutes",
                        text: minutes.notes,
                      })
                    }
                    style={styles.aiButton}
                  >
                    <Text style={styles.aiButtonText}>AI-hjælp</Text>
                  </Pressable>
                </View>
                <Text style={styles.body}>{minutes.notes}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {!minutesText && pointMinutes.length === 0 ? (
          <Text style={styles.muted}>
            Referat er ikke skrevet endnu. Åbn webappen for fuld redigering.
          </Text>
        ) : null}
      </SectionCard>

      <SectionCard title="Beslutninger">
        {decisions.length > 0 ? (
          decisions.map((decision) => (
            <View key={decision.id} style={styles.readingItem}>
              <Text style={styles.rowTitle}>{decision.label}</Text>
              <Text style={styles.body}>{decision.decision}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.muted}>Ingen beslutninger er registreret på mødet endnu.</Text>
        )}
      </SectionCard>

      <SectionCard title="Opgaver">
        {tasks.length > 0 ? (
          tasks.map((task) => <TaskCard key={task.id} task={task} compact />)
        ) : (
          <Text style={styles.muted}>
            Ingen møderelaterede opgaver er tilgængelige i mobiloverblikket.
          </Text>
        )}
      </SectionCard>

      <MinutesAssistModal
        meeting={detail.meeting}
        onClose={() => setAssistTarget(null)}
        open={Boolean(assistTarget)}
        target={assistTarget}
      />
    </AppScreen>
  );
}

function AiOverviewContent({
  overview,
}: {
  overview: NonNullable<AiMeetingOverview["overview"]>;
}) {
  return (
    <View style={styles.aiOverview}>
      <Text style={styles.body}>{overview.summary}</Text>
      <AiOverviewList title="Beslutninger" items={overview.key_decision_points} />
      <AiOverviewList title="Opfølgning" items={overview.follow_up_points} />
      <AiOverviewList title="Forberedelse" items={overview.preparation_points} />
      <AiOverviewList
        title="Opmærksomhed"
        items={overview.risks_or_attention_points}
      />
      {overview.confidence_note ? (
        <Text style={styles.muted}>AI-note: {overview.confidence_note}</Text>
      ) : null}
    </View>
  );
}

function AiOverviewList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <View style={styles.aiList}>
      <Text style={styles.rowTitle}>{title}</Text>
      {items.slice(0, 4).map((item, index) => (
        <Text key={`${title}-${index}`} style={styles.muted}>
          • {item}
        </Text>
      ))}
      {items.length > 4 ? (
        <Text style={styles.muted}>+ {items.length - 4} flere punkter</Text>
      ) : null}
    </View>
  );
}

function MinutesAssistModal({
  meeting,
  onClose,
  open,
  target,
}: {
  meeting: Meeting;
  onClose: () => void;
  open: boolean;
  target: MinutesAssistTarget | null;
}) {
  const [selectedAction, setSelectedAction] =
    useState<AiMinutesAssistantAction>("professional_board_style");
  const [suggestion, setSuggestion] =
    useState<AiMinutesAssistantSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedAction("professional_board_style");
    setSuggestion(null);
    setError(null);
  }, [open, target]);

  async function generateSuggestion() {
    if (!target) return;
    setLoading(true);
    setError(null);
    setSuggestion(null);
    try {
      setSuggestion(
        await mobileApi.aiMinutesAssist({
          organizationId: meeting.organization_id,
          committeeId: meeting.committee_id,
          meetingId: meeting.id,
          agendaItemId: target.agendaItemId ?? null,
          source: target.source,
          field: target.field,
          action: selectedAction,
          text: target.text,
        }),
      );
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={open}>
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.quickContent}>
          <View style={styles.quickHeader}>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>AI-forslag</Text>
              <Text style={styles.title}>AI-hjælp til referat</Text>
              <Text style={styles.muted}>
                AI ændrer ikke referatet. Forslaget vises kun til review.
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>Luk</Text>
            </Pressable>
          </View>

          {target ? (
            <>
              <SectionCard title={target.label}>
                <Text style={styles.rowTitle}>Original tekst</Text>
                <Text style={styles.body}>{target.text}</Text>
              </SectionCard>

              <SectionCard title="Vælg AI-handling">
                <View style={styles.choiceList}>
                  {minutesAssistActions.map((item) => (
                    <Pressable
                      key={item.action}
                      onPress={() => setSelectedAction(item.action)}
                      style={[
                        styles.choice,
                        selectedAction === item.action && styles.choiceActive,
                      ]}
                    >
                      <Text style={styles.rowTitle}>{item.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <PrimaryButton
                  disabled={loading}
                  label={loading ? "Genererer..." : "Generer forslag"}
                  onPress={generateSuggestion}
                />
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
              </SectionCard>

              {suggestion ? (
                <SectionCard title="AI-forslag">
                  <Text style={styles.muted}>{suggestion.summary}</Text>
                  <Text style={styles.body}>
                    {plainTextFromRichText(suggestion.suggestionHtml)}
                  </Text>
                  <Text style={styles.muted}>
                    Mobilversionen gemmer ikke AI-forslaget endnu. Brug det som
                    review-støtte, og gem officielle ændringer i webappen.
                  </Text>
                </SectionCard>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function MeetingDetailErrorScreen({
  message,
  onBack,
}: {
  message: string;
  onBack: () => void;
}) {
  return (
    <AppScreen
      title="Mødet kunne ikke hentes"
      subtitle="Prøv igen, eller gå tilbage til mødelisten."
    >
      <SectionCard title="Fejl">
        <Text style={styles.errorText}>{message}</Text>
      </SectionCard>
      <Pressable onPress={onBack} style={styles.backButton}>
        <Text style={styles.backText}>Tilbage til møder</Text>
      </Pressable>
    </AppScreen>
  );
}

function TasksScreen({
  tasks,
  organizationName,
}: {
  tasks: Task[];
  organizationName: string;
}) {
  const sortedTasks = [...tasks].sort((left, right) => {
    const leftTime = left.deadline
      ? new Date(left.deadline).getTime()
      : Number.MAX_SAFE_INTEGER;
    const rightTime = right.deadline
      ? new Date(right.deadline).getTime()
      : Number.MAX_SAFE_INTEGER;
    return leftTime - rightTime || left.title.localeCompare(right.title);
  });
  const soon = sortedTasks.filter((task) => {
    if (!task.deadline || task.status === "completed") return false;
    const diff = new Date(task.deadline).getTime() - Date.now();
    return diff >= 0 && diff < 1000 * 60 * 60 * 24 * 14;
  });
  const open = sortedTasks.filter(
    (task) => task.status !== "completed" && task.status !== "cancelled",
  );
  const completed = sortedTasks.filter((task) => task.status === "completed");

  return (
    <AppScreen
      title="Opgaver"
      subtitle={`En enkel prioriteret opgaveliste for ${organizationName}.`}
    >
      <SectionCard title="Mine opgaver">
        {open.length > 0 ? (
          open.slice(0, 6).map((task) => <TaskCard key={task.id} task={task} />)
        ) : (
          <Text style={styles.muted}>Du har ingen åbne opgaver.</Text>
        )}
      </SectionCard>

      <SectionCard title="Forfalder snart">
        {soon.length > 0 ? (
          soon.map((task) => <TaskCard key={task.id} task={task} compact />)
        ) : (
          <Text style={styles.muted}>Ingen opgaver forfalder de næste 14 dage.</Text>
        )}
      </SectionCard>

      <SectionCard title="Åbne">
        {open.length > 0 ? (
          <View style={styles.metricRow}>
            <Text style={styles.bigNumber}>{open.length}</Text>
            <Text style={styles.muted}>opgaver kræver stadig handling.</Text>
          </View>
        ) : (
          <Text style={styles.muted}>Der er ingen åbne opgaver lige nu.</Text>
        )}
      </SectionCard>

      <SectionCard title="Afsluttede">
        {completed.length > 0 ? (
          completed.slice(0, 4).map((task) => <TaskCard key={task.id} task={task} compact />)
        ) : (
          <Text style={styles.muted}>Ingen afsluttede opgaver i dette overblik.</Text>
        )}
        {completed.length > 4 ? (
          <Text style={styles.muted}>+ {completed.length - 4} flere afsluttede opgaver.</Text>
        ) : null}
      </SectionCard>
    </AppScreen>
  );
}

function DecisionsScreen({
  decisionError,
  decisions,
  onBack,
}: {
  decisionError: string | null;
  decisions: Decision[];
  onBack: () => void;
}) {
  const sortedDecisions = [...decisions].sort((left, right) => {
    const leftDate = left.decision_date ?? left.deadline ?? "";
    const rightDate = right.decision_date ?? right.deadline ?? "";
    return rightDate.localeCompare(leftDate) || left.title.localeCompare(right.title);
  });
  const activeDecisions = sortedDecisions.filter(
    (decision) =>
      decision.status !== "completed" && decision.status !== "cancelled",
  );
  const completedDecisions = sortedDecisions.filter(
    (decision) => decision.status === "completed",
  );

  return (
    <AppScreen
      title="Beslutninger"
      subtitle="Aktive og gennemførte beslutninger i den valgte organisation."
    >
      <Pressable onPress={onBack} style={styles.backButton}>
        <Text style={styles.backText}>Tilbage til Mere</Text>
      </Pressable>

      {decisionError ? (
        <SectionCard title="Beslutninger kunne ikke hentes">
          <Text style={styles.errorText}>{decisionError}</Text>
          <Text style={styles.muted}>
            Resten af mobiloverblikket virker stadig. Prøv igen, når
            beslutnings-endpointet er tilgængeligt.
          </Text>
        </SectionCard>
      ) : null}

      <SectionCard title="Aktive beslutninger">
        {activeDecisions.length > 0 ? (
          activeDecisions.map((decision) => (
            <DecisionCard decision={decision} key={decision.id} />
          ))
        ) : (
          <Text style={styles.muted}>
            Der er ingen aktive beslutninger i mobiloverblikket lige nu.
          </Text>
        )}
      </SectionCard>

      <SectionCard title="Gennemførte beslutninger">
        {completedDecisions.length > 0 ? (
          completedDecisions.map((decision) => (
            <DecisionCard decision={decision} key={decision.id} />
          ))
        ) : (
          <Text style={styles.muted}>
            Der er ingen gennemførte beslutninger i mobiloverblikket lige nu.
          </Text>
        )}
      </SectionCard>

      {decisions.length === 0 ? (
        <SectionCard title="Ingen beslutninger">
          <Text style={styles.muted}>
            Der er ikke registreret beslutninger i den valgte organisation.
          </Text>
        </SectionCard>
      ) : (
        null
      )}
    </AppScreen>
  );
}

function DecisionCard({ decision }: { decision: Decision }) {
  const text = plainTextFromRichText(decision.description);
  const date = decision.decision_date ?? decision.deadline;

  return (
    <SectionCard title={decision.title}>
      <View style={styles.metaWrap}>
        <Text style={styles.metaPill}>
          {decisionStatusLabels[decision.status] ??
            taskStatusLabels[decision.status] ??
            decision.status}
        </Text>
        {decision.category ? <Text style={styles.metaPill}>{decision.category}</Text> : null}
        {date ? <Text style={styles.metaPill}>{formatDateTime(date)}</Text> : null}
      </View>
      {text ? <Text style={styles.body}>{text}</Text> : null}
      {decision.meeting ? (
        <Text style={styles.muted}>
          Møde: {decision.meeting.title} · {formatDateTime(decision.meeting.starts_at)}
        </Text>
      ) : null}
      {decision.agendaItem ? (
        <Text style={styles.muted}>
          Punkt: ({agendaLabel(decision.agendaItem.item_type)}) {decision.agendaItem.title}
        </Text>
      ) : null}
      {decision.responsible?.full_name ? (
        <Text style={styles.muted}>Ansvarlig: {decision.responsible.full_name}</Text>
      ) : null}
    </SectionCard>
  );
}

function MoreScreen({
  onOpen,
  onLogout,
  onChangeOrganization,
  canSwitchOrganization,
  pushMessage,
  organizationName,
}: {
  onOpen: (label: string) => void;
  onLogout: () => void;
  onChangeOrganization: () => void;
  canSwitchOrganization: boolean;
  pushMessage: string | null;
  organizationName: string;
}) {
  const items = [
    "Organisation",
    "Udvalg",
    "Beslutninger",
    "Årshjul",
    "Jobkort",
    "Indstillinger",
  ];

  return (
    <AppScreen title="Mere" subtitle="Sekundær navigation uden desktop-sidebar.">
      <SectionCard title="Aktiv organisation">
        <Text style={styles.muted}>{organizationName}</Text>
        {canSwitchOrganization ? (
          <Pressable onPress={onChangeOrganization} style={styles.switchButton}>
            <Text style={styles.switchButtonText}>Skift organisation</Text>
          </Pressable>
        ) : (
          <Text style={styles.muted}>Organisationen er valgt automatisk.</Text>
        )}
      </SectionCard>

      <SectionCard title="Genveje">
        {items.map((item) => (
          <Pressable key={item} onPress={() => onOpen(item)} style={styles.moreRow}>
            <Text style={styles.rowTitle}>{item}</Text>
            <Text style={styles.moreArrow}>›</Text>
          </Pressable>
        ))}
      </SectionCard>

      <SectionCard title="Push">
        <Text style={styles.muted}>
          {pushMessage ||
            "Push-foundation er klar lokalt. Serverregistrering kobles på senere."}
        </Text>
      </SectionCard>

      <Pressable onPress={onLogout} style={styles.logoutButton}>
        <Text style={styles.logoutText}>Log ud</Text>
      </Pressable>
    </AppScreen>
  );
}

function QuickActionModal({
  committees,
  contextMeeting,
  onClose,
  onCreated,
  open,
  organizationId,
}: {
  committees: Committee[];
  contextMeeting: Meeting | null;
  onClose: () => void;
  onCreated: (meeting: Meeting) => void;
  open: boolean;
  organizationId: string | null;
}) {
  const [committeeId, setCommitteeId] = useState("");
  const [title, setTitle] = useState("Mobilt møde");
  const [startsAt, setStartsAt] = useState(formatMobileDateTimeInput());
  const [minutesText, setMinutesText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FormFieldErrors>({});

  useEffect(() => {
    if (!open) return;
    setCommitteeId(
      contextMeeting?.committee_id ??
        (committees.length === 1 ? committees[0]?.id ?? "" : ""),
    );
    setTitle(contextMeeting ? `${contextMeeting.title} - opfølgning` : "Mobilt møde");
    setStartsAt(formatMobileDateTimeInput());
    setMinutesText("");
    setError(null);
    setFieldErrors({});
  }, [committees, contextMeeting, open]);

  async function createMeeting() {
    const nextFieldErrors: FormFieldErrors = {};
    if (!organizationId) {
      nextFieldErrors.organizationId = "Organisation mangler.";
    }
    if (!committeeId) {
      nextFieldErrors.committeeId = "Vælg et udvalg før mødet oprettes.";
    }
    if (!title.trim()) {
      nextFieldErrors.title = "Titel skal udfyldes.";
    }
    const parsedDate = parseMobileDateTimeInput(startsAt);
    if (!parsedDate) {
      nextFieldErrors.startsAt =
        "Dato og tidspunkt er ugyldigt. Brug fx 26.06.2026 Kl.: 17:00.";
    }
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setError("Ret de markerede felter, og prøv igen.");
      return;
    }
    const validStartsAt = parsedDate;
    if (!validStartsAt) {
      setFieldErrors({
        startsAt:
          "Dato og tidspunkt er ugyldigt. Brug fx 26.06.2026 Kl.: 17:00.",
      });
      setError("Ret de markerede felter, og prøv igen.");
      return;
    }

    setSaving(true);
    setError(null);
    setFieldErrors({});
    console.log("[mobile] create quick meeting", {
      selectedOrganizationId: organizationId,
      selectedCommitteeId: committeeId,
      startsAtInput: startsAt,
      startsAtIso: validStartsAt.toISOString(),
    });
    try {
      const meeting = await mobileApi.quickMeeting({
        organizationId: organizationId!,
        committeeId,
        title: title.trim(),
        startsAt: validStartsAt.toISOString(),
        minutesText,
      });
      onCreated(meeting);
    } catch (caught) {
      if (caught instanceof MobileApiError) {
        const serverFieldErrors = fieldErrorsFromApi(caught);
        if (Object.keys(serverFieldErrors).length > 0) {
          setFieldErrors(serverFieldErrors);
        }
        console.warn("[mobile] quick meeting failed", {
          selectedOrganizationId: organizationId,
          selectedCommitteeId: committeeId,
          status: caught.status,
          details: caught.details,
        });
      }
      setError(messageFrom(caught));
    } finally {
      setSaving(false);
    }
  }

  const selectedCommittee = committees.find((committee) => committee.id === committeeId);

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={open}>
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.quickContent}>
          <View style={styles.quickHeader}>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>Quick Actions</Text>
              <Text style={styles.title}>+ Opret</Text>
              <Text style={styles.muted}>
                Mobil oprettelse bruger organisationen
                {selectedCommittee ? ` og ${selectedCommittee.name}` : ""}.
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>Luk</Text>
            </Pressable>
          </View>

          {contextMeeting ? (
            <SectionCard title="Aktuel mødekontekst">
              <Text style={styles.rowTitle}>{contextMeeting.title}</Text>
              <Text style={styles.muted}>
                Nye mobilhandlinger kan forudfylde udvalg fra dette møde.
              </Text>
            </SectionCard>
          ) : null}

          <SectionCard title="Opret møde">
            {committees.length > 1 ? (
              <View style={styles.choiceList}>
                {committees.map((committee) => (
                  <Pressable
                    key={committee.id}
                    onPress={() => setCommitteeId(committee.id)}
                    style={[
                      styles.choice,
                      committee.id === committeeId && styles.choiceActive,
                    ]}
                  >
                    <Text style={styles.rowTitle}>{committee.name}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={styles.muted}>
                Udvalg: {selectedCommittee?.name ?? "Intet udvalg fundet"}
              </Text>
            )}
            {fieldErrors.committeeId ? (
              <Text style={styles.errorText}>{fieldErrors.committeeId}</Text>
            ) : null}

            <TextInput
              onChangeText={setTitle}
              placeholder="Titel"
              style={[styles.input, fieldErrors.title && styles.inputError]}
              value={title}
            />
            {fieldErrors.title ? (
              <Text style={styles.errorText}>{fieldErrors.title}</Text>
            ) : null}
            <TextInput
              autoCapitalize="none"
              onChangeText={setStartsAt}
              placeholder="DD.MM.YYYY Kl.: HH:mm"
              style={[styles.input, fieldErrors.startsAt && styles.inputError]}
              value={startsAt}
            />
            {fieldErrors.startsAt ? (
              <Text style={styles.errorText}>{fieldErrors.startsAt}</Text>
            ) : null}
            <TextInput
              multiline
              onChangeText={setMinutesText}
              placeholder="Korte noter, hvis mødet oprettes ad hoc"
              style={[
                styles.input,
                styles.quickTextArea,
                fieldErrors.minutesText && styles.inputError,
              ]}
              value={minutesText}
            />
            {fieldErrors.minutesText ? (
              <Text style={styles.errorText}>{fieldErrors.minutesText}</Text>
            ) : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <PrimaryButton
              disabled={saving}
              label={saving ? "Opretter..." : "Opret møde"}
              onPress={createMeeting}
            />
            <Text style={styles.muted}>
              Første mobile version opretter mødet via det eksisterende sikre
              mobilflow uden dagsordenspunkter.
            </Text>
          </SectionCard>

          <SectionCard title="Andre handlinger">
            <DisabledQuickAction
              label="Nyt dagsordenspunkt"
              text={
                contextMeeting
                  ? "Kontekst fundet. Mobil create-route kobles på i næste trin."
                  : "Åbn et møde først for at vælge mødekontekst."
              }
            />
            <DisabledQuickAction
              label="Ny opgave"
              text={
                contextMeeting
                  ? "Mødekontekst kan bruges senere. Mobil opgaveoprettelse er ikke slået til endnu."
                  : "Opgaver kræver sikker mobil create-route og ansvarlig/relationsvalg."
              }
            />
            <DisabledQuickAction
              label="Ny beslutning"
              text={
                contextMeeting
                  ? "Beslutning kan senere knyttes til dette møde."
                  : "Beslutninger kræver sikker mobil create-route og udvalg/mødekontekst."
              }
            />
          </SectionCard>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function DisabledQuickAction({
  label,
  text,
}: {
  label: string;
  text: string;
}) {
  return (
    <View style={styles.disabledAction}>
      <Text style={styles.rowTitle}>{label}</Text>
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

function BottomNavigation({
  activeTab,
  onChange,
}: {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
}) {
  return (
    <View style={styles.tabs}>
      {tabs.map((tab) => (
        <Pressable
          hitSlop={8}
          key={tab.key}
          onPress={() => onChange(tab.key)}
          style={[styles.tab, activeTab === tab.key && styles.tabActive]}
        >
          <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.primaryButton, disabled && styles.disabled]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={styles.muted}>{text}</Text>
      </View>
    </SafeAreaView>
  );
}

function messageFrom(error: unknown) {
  if (error instanceof MobileApiError || error instanceof Error) {
    return error.message;
  }
  return "Der opstod en ukendt fejl.";
}

function fieldErrorsFromApi(error: MobileApiError): FormFieldErrors {
  const fields = error.details?.fieldErrors ?? {};
  const first = (field: string) => fields[field]?.[0];
  return {
    organizationId: first("organizationId"),
    committeeId: first("committeeId"),
    title: first("title"),
    startsAt: first("startsAt"),
    minutesText: first("minutesText"),
  };
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f6f3ee" },
  header: {
    alignItems: "center",
    backgroundColor: "#10243f",
    borderBottomColor: "#d7d0c5",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  headerText: { flex: 1 },
  headerActions: { alignItems: "flex-end", gap: 4 },
  headerTitle: { color: "#fff", fontSize: 19, fontWeight: "800" },
  profileText: { color: "#d8e0ea", flexShrink: 1, fontSize: 11, textAlign: "right" },
  quickButton: {
    backgroundColor: "#f0c66a",
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  quickButtonText: { color: "#172033", fontSize: 13, fontWeight: "900" },
  loginCard: { gap: 14, margin: 18, paddingTop: 80 },
  centered: { alignItems: "center", flex: 1, gap: 12, justifyContent: "center", padding: 24 },
  eyebrow: { color: "#8ea0b3", fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  title: { color: "#172033", fontSize: 24, fontWeight: "800" },
  rowTitle: { color: "#172033", fontSize: 15, fontWeight: "800" },
  body: { color: "#283347", fontSize: 15, lineHeight: 22 },
  muted: { color: "#657282", fontSize: 13, lineHeight: 19 },
  input: {
    backgroundColor: "#fff",
    borderColor: "#d9d2c7",
    borderRadius: 12,
    borderWidth: 1,
    color: "#172033",
    fontSize: 15,
    padding: 12,
  },
  inputError: { borderColor: "#a13333", borderWidth: 2 },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#10243f",
    borderRadius: 12,
    padding: 13,
  },
  primaryButtonText: { color: "#fff", fontWeight: "800" },
  secondaryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: "#c9d6e2",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  secondaryButtonText: { color: "#0f4f8f", fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.5 },
  errorText: { color: "#a13333", fontSize: 13 },
  errorBanner: {
    backgroundColor: "#fae5e5",
    color: "#8a2525",
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  tabs: {
    backgroundColor: "#fff",
    borderTopColor: "#ded8ce",
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: "row",
    gap: 8,
    left: 0,
    paddingBottom: 22,
    paddingHorizontal: 14,
    paddingTop: 10,
    position: "absolute",
    right: 0,
    shadowColor: "#10243f",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 8,
  },
  tab: {
    alignItems: "center",
    borderRadius: 999,
    flex: 1,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 6,
    paddingVertical: 15,
  },
  tabActive: { backgroundColor: "#10243f" },
  tabText: { color: "#657282", fontSize: 12, fontWeight: "800" },
  tabTextActive: { color: "#fff" },
  listRow: { borderTopColor: "#eee5da", borderTopWidth: 1, gap: 3, paddingVertical: 10 },
  backButton: { alignSelf: "flex-start", paddingVertical: 4 },
  backText: { color: "#0f4f8f", fontSize: 14, fontWeight: "800" },
  detailHeader: {
    alignItems: "flex-start",
    backgroundColor: "#fff",
    borderColor: "#e4ddd3",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    padding: 14,
  },
  detailHeaderText: { flex: 1, gap: 4 },
  statusPill: {
    backgroundColor: "#edf2f7",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusPillText: { color: "#10243f", fontSize: 11, fontWeight: "900" },
  agendaDetailRow: {
    alignItems: "flex-start",
    borderTopColor: "#eee5da",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingVertical: 10,
  },
  agendaPosition: {
    backgroundColor: "#edf2f7",
    borderRadius: 999,
    color: "#10243f",
    fontSize: 12,
    fontWeight: "900",
    minWidth: 28,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 5,
    textAlign: "center",
  },
  agendaDetailText: { flex: 1, gap: 4 },
  agendaDetailTitle: { color: "#172033", fontSize: 14, fontWeight: "900", lineHeight: 20 },
  readingList: { gap: 10 },
  readingItem: { borderTopColor: "#eee5da", borderTopWidth: 1, gap: 5, paddingTop: 10 },
  readingHeader: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
  },
  aiButton: {
    backgroundColor: "#0f4f8f",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  aiButtonText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  aiOverview: { gap: 10 },
  aiList: { gap: 4 },
  twoColumn: { gap: 10 },
  metricRow: { alignItems: "baseline", flexDirection: "row", gap: 8 },
  bigNumber: { color: "#10243f", fontSize: 28, fontWeight: "900" },
  metaWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  metaPill: {
    backgroundColor: "#edf2f7",
    borderRadius: 999,
    color: "#10243f",
    fontSize: 11,
    fontWeight: "800",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  moreRow: {
    alignItems: "center",
    borderTopColor: "#eee5da",
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 13,
  },
  organizationChoice: {
    alignItems: "center",
    borderTopColor: "#eee5da",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  organizationChoiceText: { flex: 1, gap: 3 },
  inlineLoading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingVertical: 4,
  },
  quickContent: { gap: 14, padding: 16, paddingBottom: 44 },
  quickHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  closeButton: {
    borderColor: "#d9d2c7",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  closeButtonText: { color: "#172033", fontSize: 13, fontWeight: "800" },
  choiceList: { gap: 8 },
  choice: {
    borderColor: "#d9d2c7",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  choiceActive: { backgroundColor: "#edf2f7", borderColor: "#10243f" },
  quickTextArea: { minHeight: 120, textAlignVertical: "top" },
  disabledAction: {
    backgroundColor: "#fbfaf7",
    borderColor: "#e4ddd3",
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  moreArrow: { color: "#657282", fontSize: 24 },
  switchButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: "#c9d6e2",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  switchButtonText: { color: "#0f4f8f", fontSize: 13, fontWeight: "800" },
  logoutButton: {
    alignItems: "center",
    borderColor: "#d4b8b8",
    borderRadius: 12,
    borderWidth: 1,
    padding: 13,
  },
  logoutText: { color: "#8a2525", fontWeight: "800" },
});

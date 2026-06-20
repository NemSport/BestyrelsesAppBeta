import { useEffect, useMemo, useState } from "react";
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
import { missingConfig } from "./src/config";
import { preparePushNotifications } from "./src/push";
import { supabase } from "./src/supabase";
import type {
  AiMeetingOverview,
  Committee,
  Meeting,
  MeetingDetail,
  Organization,
  OrganizationOverview,
  Status,
  Task,
} from "./src/types";

const tabs = ["Hjem", "Mine opgaver", "Møder", "Udvalg", "AI", "Profil"] as const;
const statusLabels: Record<Status, string> = {
  not_started: "Ikke påbegyndt",
  in_progress: "I gang",
  waiting: "Afventer",
  completed: "Gennemført",
  cancelled: "Annulleret",
};

function stripHtml(value?: string | null) {
  return (value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatDate(value?: string | null) {
  if (!value) return "Ingen dato";
  return new Intl.DateTimeFormat("da-DK", {
    dateStyle: "medium",
    timeStyle: value.includes("T") ? "short" : undefined,
  }).format(new Date(value));
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
          Companion-app til opgaver, møder, udvalg og AI-overblik.
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
        {error ? <Text style={styles.error}>{error}</Text> : null}
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
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Hjem");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [overview, setOverview] = useState<OrganizationOverview | null>(null);
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [meetingDetail, setMeetingDetail] = useState<MeetingDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  const organization = organizations.find((item) => item.id === organizationId);
  const committees = useMemo(
    () => overview?.committees.map((entry) => entry.committee) ?? organization?.committees ?? [],
    [organization, overview],
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const organizationResult = await mobileApi.organizations();
      setOrganizations(organizationResult.organizations);
      const selectedId = organizationId ?? organizationResult.organizations[0]?.id ?? null;
      setOrganizationId(selectedId);
      if (selectedId) {
        const [nextOverview, nextTasks] = await Promise.all([
          mobileApi.overview(selectedId),
          mobileApi.myTasks(selectedId),
        ]);
        setOverview(nextOverview);
        setMyTasks(nextTasks.tasks);
      }
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    void preparePushNotifications().then((result) => {
      setPushMessage(result.message);
    });
  }, []);

  async function openMeeting(meeting: Meeting | { meetingId: string }) {
    const id = "id" in meeting ? meeting.id : meeting.meetingId;
    setLoading(true);
    setError(null);
    try {
      setMeetingDetail(await mobileApi.meeting(id));
      setActiveTab("Møder");
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(task: Task, status: Status) {
    if (!organizationId) return;
    try {
      const updated = await mobileApi.updateTaskStatus(organizationId, task.id, status);
      setMyTasks((current) =>
        current.map((candidate) => (candidate.id === task.id ? { ...task, ...updated } : candidate)),
      );
      await load();
    } catch (caught) {
      Alert.alert("Status kunne ikke ændres", messageFrom(caught));
    }
  }

  async function addComment(task: Task, body: string) {
    if (!organizationId) return;
    try {
      await mobileApi.createTaskComment(organizationId, task.id, body);
      Alert.alert("Kommentar gemt", "Kommentaren er tilføjet opgaven.");
    } catch (caught) {
      Alert.alert("Kommentar kunne ikke gemmes", messageFrom(caught));
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Mobil companion</Text>
          <Text style={styles.headerTitle}>{organization?.name || "BestyrelsesApp"}</Text>
        </View>
        <Pressable onPress={() => setQuickOpen(true)} style={styles.fab}>
          <Text style={styles.fabText}>+ Opret</Text>
        </Pressable>
      </View>

      {loading ? <Loading text="Henter data..." /> : null}
      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

      <ScrollView contentContainerStyle={styles.content}>
        {activeTab === "Hjem" ? (
          <HomeScreen
            onOpenMeeting={openMeeting}
            overview={overview}
            tasks={myTasks}
          />
        ) : null}
        {activeTab === "Mine opgaver" ? (
          <TasksScreen
            onAddComment={addComment}
            onStatus={updateStatus}
            tasks={myTasks}
          />
        ) : null}
        {activeTab === "Møder" ? (
          <MeetingsScreen
            detail={meetingDetail}
            onOpenMeeting={openMeeting}
            overview={overview}
          />
        ) : null}
        {activeTab === "Udvalg" ? <CommitteesScreen overview={overview} /> : null}
        {activeTab === "AI" && organizationId ? (
          <AiScreen organizationId={organizationId} overview={overview} />
        ) : null}
        {activeTab === "Profil" ? (
          <ProfileScreen
            email={session.user.email ?? ""}
            pushMessage={pushMessage}
          />
        ) : null}
      </ScrollView>

      <View style={styles.tabs}>
        {tabs.map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab}
            </Text>
          </Pressable>
        ))}
      </View>

      <QuickMeetingModal
        committees={committees}
        onClose={() => setQuickOpen(false)}
        onCreated={(meeting) => {
          setQuickOpen(false);
          void load();
          void openMeeting(meeting);
        }}
        open={quickOpen}
        organizationId={organizationId}
      />
    </SafeAreaView>
  );
}

function HomeScreen({
  overview,
  tasks,
  onOpenMeeting,
}: {
  overview: OrganizationOverview | null;
  tasks: Task[];
  onOpenMeeting: (meeting: Meeting) => void;
}) {
  const nextMeeting = overview?.upcomingMeetings[0] ?? null;
  return (
    <View style={styles.stack}>
      <Section title="Det vigtigste nu">
        {tasks.slice(0, 3).map((task) => (
          <TaskLine key={task.id} task={task} />
        ))}
        {tasks.length === 0 ? <Text style={styles.muted}>Du har ingen åbne opgaver.</Text> : null}
      </Section>
      <Section title="Næste møde">
        {nextMeeting ? (
          <Pressable onPress={() => onOpenMeeting(nextMeeting)} style={styles.rowButton}>
            <Text style={styles.rowTitle}>{nextMeeting.title}</Text>
            <Text style={styles.muted}>{formatDate(nextMeeting.starts_at)}</Text>
          </Pressable>
        ) : (
          <Text style={styles.muted}>Der er ingen kommende møder.</Text>
        )}
      </Section>
      <Section title="Mine udvalg">
        {overview?.committees.slice(0, 4).map((entry) => (
          <View key={entry.committee.id} style={styles.row}>
            <Text style={styles.rowTitle}>{entry.committee.name}</Text>
            <Text style={styles.muted}>
              {entry.openTaskCount} opgaver · {entry.activeDecisionCount} beslutninger
            </Text>
          </View>
        ))}
      </Section>
      <Section title="Seneste referat">
        {overview?.recentMinutes[0] ? (
          <Text style={styles.muted}>
            {overview.recentMinutes[0].meetingTitle} · {formatDate(overview.recentMinutes[0].updatedAt)}
          </Text>
        ) : (
          <Text style={styles.muted}>Der er ingen nyere referater.</Text>
        )}
      </Section>
    </View>
  );
}

function TasksScreen({
  tasks,
  onStatus,
  onAddComment,
}: {
  tasks: Task[];
  onStatus: (task: Task, status: Status) => void;
  onAddComment: (task: Task, body: string) => void;
}) {
  return (
    <View style={styles.stack}>
      <Text style={styles.title}>Mine opgaver</Text>
      {tasks.length === 0 ? (
        <Text style={styles.muted}>Du har ingen opgaver lige nu.</Text>
      ) : null}
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          onAddComment={onAddComment}
          onStatus={onStatus}
          task={task}
        />
      ))}
    </View>
  );
}

function MeetingsScreen({
  overview,
  detail,
  onOpenMeeting,
}: {
  overview: OrganizationOverview | null;
  detail: MeetingDetail | null;
  onOpenMeeting: (meeting: Meeting | { meetingId: string }) => void;
}) {
  return (
    <View style={styles.stack}>
      <Text style={styles.title}>Møder og referater</Text>
      {overview?.upcomingMeetings.map((meeting) => (
        <Pressable key={meeting.id} onPress={() => onOpenMeeting(meeting)} style={styles.rowButton}>
          <Text style={styles.rowTitle}>{meeting.title}</Text>
          <Text style={styles.muted}>
            {meeting.committeeName} · {formatDate(meeting.starts_at)}
          </Text>
        </Pressable>
      ))}
      {overview?.recentMinutes.map((minutes) => (
        <Pressable
          key={minutes.id}
          onPress={() => onOpenMeeting({ meetingId: minutes.meetingId })}
          style={styles.rowButton}
        >
          <Text style={styles.rowTitle}>{minutes.meetingTitle}</Text>
          <Text style={styles.muted}>
            Referat · {minutes.committeeName} · {formatDate(minutes.updatedAt)}
          </Text>
        </Pressable>
      ))}
      {detail ? (
        <Section title={`Åbent møde: ${detail.meeting.title}`}>
          <Text style={styles.muted}>{formatDate(detail.meeting.starts_at)}</Text>
          <Text style={styles.subTitle}>Dagsorden</Text>
          {detail.meeting.agenda_item_occurrences?.length ? (
            detail.meeting.agenda_item_occurrences.map((occurrence) => (
              <Text key={`${occurrence.position}-${occurrence.agenda_items?.id}`} style={styles.body}>
                {occurrence.position}. {occurrence.agenda_items?.title}
              </Text>
            ))
          ) : (
            <Text style={styles.muted}>Mødet har ingen dagsordenspunkter.</Text>
          )}
          <Text style={styles.subTitle}>Referat</Text>
          <Text style={styles.body}>
            {stripHtml(detail.minutes.meetingMinutes?.minutes_text) ||
              "Der er endnu ikke skrevet generelt referat."}
          </Text>
        </Section>
      ) : null}
    </View>
  );
}

function CommitteesScreen({ overview }: { overview: OrganizationOverview | null }) {
  return (
    <View style={styles.stack}>
      <Text style={styles.title}>Mine udvalg</Text>
      {overview?.committees.map((entry) => (
        <View key={entry.committee.id} style={styles.cardFlat}>
          <Text style={styles.rowTitle}>{entry.committee.name}</Text>
          <Text style={styles.muted}>
            Næste møde: {entry.nextMeeting ? formatDate(entry.nextMeeting.starts_at) : "ikke planlagt"}
          </Text>
          <Text style={styles.muted}>
            {entry.openTaskCount} åbne opgaver · {entry.activeDecisionCount} aktive beslutninger
          </Text>
        </View>
      ))}
    </View>
  );
}

function AiScreen({
  organizationId,
  overview,
}: {
  organizationId: string;
  overview: OrganizationOverview | null;
}) {
  const [question, setQuestion] = useState("Hvad kræver opmærksomhed lige nu?");
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<Array<{ title: string; excerpt: string }>>([]);
  const [meetingOverview, setMeetingOverview] = useState<AiMeetingOverview | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask() {
    setLoading(true);
    try {
      const result = await mobileApi.askAssistant(organizationId, question);
      setAnswer(result.answer.answer);
      setSources(result.answer.sources);
    } catch (caught) {
      Alert.alert("AI Assistant fejlede", messageFrom(caught));
    } finally {
      setLoading(false);
    }
  }

  async function summarizeNextMeeting() {
    const meeting = overview?.upcomingMeetings[0];
    if (!meeting) {
      Alert.alert("Ingen møder", "Der er ikke et kommende møde at opsummere.");
      return;
    }
    setLoading(true);
    try {
      setMeetingOverview(
        await mobileApi.aiOverview(organizationId, meeting.committee_id, meeting.id),
      );
    } catch (caught) {
      Alert.alert("AI-overblik fejlede", messageFrom(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.stack}>
      <Text style={styles.title}>AI Assistant</Text>
      <Text style={styles.muted}>
        AI svarer med kilder og ændrer aldrig data automatisk.
      </Text>
      <TextInput
        multiline
        onChangeText={setQuestion}
        style={[styles.input, styles.textArea]}
        value={question}
      />
      <PrimaryButton disabled={loading} label="Spørg AI" onPress={ask} />
      <SecondaryButton
        label="AI-overblik over næste møde"
        onPress={summarizeNextMeeting}
      />
      {answer ? (
        <Section title="Svar">
          <Text style={styles.body}>{answer}</Text>
          {sources.map((source, index) => (
            <Text key={`${source.title}-${index}`} style={styles.source}>
              Kilde: {source.title} · {source.excerpt}
            </Text>
          ))}
        </Section>
      ) : null}
      {meetingOverview?.overview ? (
        <Section title="Mødeoverblik">
          <Text style={styles.body}>{meetingOverview.overview.summary}</Text>
          {meetingOverview.overview.preparation_points.map((item) => (
            <Text key={item} style={styles.body}>• {item}</Text>
          ))}
        </Section>
      ) : null}
    </View>
  );
}

function ProfileScreen({
  email,
  pushMessage,
}: {
  email: string;
  pushMessage: string | null;
}) {
  return (
    <View style={styles.stack}>
      <Text style={styles.title}>Profil</Text>
      <Text style={styles.muted}>{email}</Text>
      <Section title="Push-notifikationer">
        <Text style={styles.body}>
          {pushMessage ||
            "Push-foundation er klar i appen. Serverregistrering og udsendelse kobles på senere."}
        </Text>
      </Section>
      <SecondaryButton label="Log ud" onPress={() => void supabase.auth.signOut()} />
    </View>
  );
}

function QuickMeetingModal({
  open,
  organizationId,
  committees,
  onClose,
  onCreated,
}: {
  open: boolean;
  organizationId: string | null;
  committees: Committee[];
  onClose: () => void;
  onCreated: (meeting: Meeting) => void;
}) {
  const [committeeId, setCommitteeId] = useState("");
  const [title, setTitle] = useState("Hurtigt møde");
  const [startsAt, setStartsAt] = useState(new Date().toISOString().slice(0, 16));
  const [minutesText, setMinutesText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCommitteeId(committees.length === 1 ? committees[0]?.id ?? "" : "");
  }, [committees, open]);

  async function save() {
    if (!organizationId) return;
    if (!committeeId) {
      Alert.alert("Vælg udvalg", "Du skal vælge et udvalg til mødet.");
      return;
    }
    if (!title.trim()) {
      Alert.alert("Titel mangler", "Titel skal udfyldes.");
      return;
    }
    setSaving(true);
    try {
      const meeting = await mobileApi.quickMeeting({
        organizationId,
        committeeId,
        title,
        startsAt: new Date(startsAt).toISOString(),
        minutesText,
      });
      onCreated(meeting);
    } catch (caught) {
      Alert.alert("Hurtigt møde kunne ikke oprettes", messageFrom(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={open}>
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.eyebrow}>Quick Action</Text>
          <Text style={styles.title}>Hurtigt møde</Text>
          <Text style={styles.muted}>
            Opret et ad hoc-møde uden dagsorden og skriv frie noter med det samme.
          </Text>
          {committees.length > 1 ? (
            <View style={styles.choiceList}>
              {committees.map((committee) => (
                <Pressable
                  key={committee.id}
                  onPress={() => setCommitteeId(committee.id)}
                  style={[
                    styles.choice,
                    committeeId === committee.id && styles.choiceActive,
                  ]}
                >
                  <Text style={styles.rowTitle}>{committee.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.muted}>
              Udvalg: {committees[0]?.name || "Intet udvalg fundet"}
            </Text>
          )}
          <TextInput onChangeText={setTitle} placeholder="Titel" style={styles.input} value={title} />
          <TextInput
            onChangeText={setStartsAt}
            placeholder="YYYY-MM-DDTHH:mm"
            style={styles.input}
            value={startsAt}
          />
          <TextInput
            multiline
            onChangeText={setMinutesText}
            placeholder="Frie noter / referat"
            style={[styles.input, styles.largeTextArea]}
            value={minutesText}
          />
          <View style={styles.infoBox}>
            <Text style={styles.rowTitle}>Strukturer med AI</Text>
            <Text style={styles.muted}>
              Kommer senere som review-flow. AI ændrer eller opretter intet automatisk.
            </Text>
          </View>
          <PrimaryButton disabled={saving} label={saving ? "Opretter..." : "Opret hurtigt møde"} onPress={save} />
          <SecondaryButton label="Annuller" onPress={onClose} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function TaskCard({
  task,
  onStatus,
  onAddComment,
}: {
  task: Task;
  onStatus: (task: Task, status: Status) => void;
  onAddComment: (task: Task, body: string) => void;
}) {
  const [comment, setComment] = useState("");
  return (
    <View style={styles.cardFlat}>
      <TaskLine task={task} />
      <View style={styles.statusRow}>
        {(["not_started", "in_progress", "waiting", "completed"] as Status[]).map((status) => (
          <Pressable
            key={status}
            onPress={() => onStatus(task, status)}
            style={[styles.statusPill, task.status === status && styles.statusPillActive]}
          >
            <Text style={styles.statusText}>{statusLabels[status]}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        onChangeText={setComment}
        placeholder="Tilføj kommentar"
        style={styles.input}
        value={comment}
      />
      <SecondaryButton
        label="Gem kommentar"
        onPress={() => {
          if (comment.trim()) {
            onAddComment(task, comment.trim());
            setComment("");
          }
        }}
      />
    </View>
  );
}

function TaskLine({ task }: { task: Task }) {
  return (
    <View>
      <Text style={styles.rowTitle}>{task.title}</Text>
      <Text style={styles.muted}>
        {statusLabels[task.status]} · Deadline: {formatDate(task.deadline)}
      </Text>
      {task.meeting ? <Text style={styles.muted}>Møde: {task.meeting.title}</Text> : null}
      {task.decision ? <Text style={styles.muted}>Beslutning: {task.decision.title}</Text> : null}
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
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

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.secondaryButton}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator />
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

function messageFrom(error: unknown) {
  if (error instanceof MobileApiError || error instanceof Error) {
    return error.message;
  }
  return "Der opstod en ukendt fejl.";
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f7f4ee" },
  header: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#ded8ce",
    backgroundColor: "#10243f",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "700" },
  content: { padding: 18, paddingBottom: 110, gap: 14 },
  stack: { gap: 14 },
  loginCard: { margin: 18, paddingTop: 80, gap: 14 },
  centered: { padding: 24, gap: 12, alignItems: "center", justifyContent: "center" },
  eyebrow: { color: "#789", fontSize: 12, textTransform: "uppercase", fontWeight: "700" },
  title: { color: "#172033", fontSize: 24, fontWeight: "800" },
  subTitle: { color: "#172033", fontSize: 16, fontWeight: "700", marginTop: 10 },
  section: { borderTopWidth: 1, borderTopColor: "#ded8ce", paddingTop: 12, gap: 8 },
  sectionTitle: { color: "#172033", fontSize: 17, fontWeight: "800" },
  cardFlat: { borderTopWidth: 1, borderTopColor: "#ded8ce", paddingTop: 12, gap: 8 },
  row: { gap: 3, paddingVertical: 6 },
  rowButton: { borderTopWidth: 1, borderTopColor: "#ded8ce", paddingVertical: 12, gap: 4 },
  rowTitle: { color: "#172033", fontSize: 15, fontWeight: "700" },
  body: { color: "#293449", fontSize: 15, lineHeight: 22 },
  source: { color: "#556170", fontSize: 12, lineHeight: 18, marginTop: 8 },
  muted: { color: "#657282", fontSize: 13, lineHeight: 19 },
  error: { color: "#a13333", fontSize: 13 },
  errorBanner: { backgroundColor: "#f8dddd", color: "#8a2525", padding: 10 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d9d2c7",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: "#172033",
  },
  textArea: { minHeight: 96, textAlignVertical: "top" },
  largeTextArea: { minHeight: 180, textAlignVertical: "top" },
  primaryButton: { backgroundColor: "#10243f", borderRadius: 10, padding: 13, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "800" },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#c9c1b5",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  secondaryButtonText: { color: "#172033", fontWeight: "700" },
  disabled: { opacity: 0.5 },
  fab: { backgroundColor: "#f0c66a", borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 },
  fabText: { color: "#172033", fontWeight: "800" },
  tabs: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#ded8ce",
    padding: 6,
    gap: 4,
  },
  tab: { flexGrow: 1, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 8, alignItems: "center" },
  tabActive: { backgroundColor: "#10243f" },
  tabText: { fontSize: 11, color: "#657282", fontWeight: "700" },
  tabTextActive: { color: "#fff" },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  statusPill: { borderWidth: 1, borderColor: "#d9d2c7", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
  statusPillActive: { backgroundColor: "#e9f2ee", borderColor: "#7aa58e" },
  statusText: { fontSize: 11, color: "#293449", fontWeight: "700" },
  choiceList: { gap: 8 },
  choice: { borderWidth: 1, borderColor: "#d9d2c7", borderRadius: 10, padding: 12 },
  choiceActive: { borderColor: "#10243f", backgroundColor: "#e9eef5" },
  infoBox: { borderWidth: 1, borderColor: "#d9d2c7", borderRadius: 10, padding: 12, gap: 4 },
});

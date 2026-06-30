import type { ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { Meeting, Task } from "./types";
import {
  agendaLabel,
  formatDateTime,
  sortedAgendaItems,
  taskStatusLabels,
} from "./utils";

export function AppScreen({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <ScrollView contentContainerStyle={styles.screenContent}>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>{title}</Text>
        {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </ScrollView>
  );
}

export function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function MeetingCard({
  meeting,
  onPress,
}: {
  meeting: Meeting;
  onPress: () => void;
}) {
  const agendaCount = Array.isArray(meeting.agenda_item_occurrences)
    ? meeting.agenda_item_occurrences.length
    : null;

  return (
    <Pressable onPress={onPress} style={styles.meetingCard}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.cardTitle}>{meeting.title}</Text>
          <Text style={styles.meta}>
            {formatDateTime(meeting.starts_at)}
            {meeting.committeeName ? ` · ${meeting.committeeName}` : ""}
          </Text>
        </View>
        {agendaCount !== null ? (
          <View style={styles.countPill}>
            <Text style={styles.countText}>{agendaCount}</Text>
          </View>
        ) : null}
      </View>
      <AgendaPreview limit={3} meeting={meeting} />
      <Text style={styles.openText}>Åbn møde</Text>
    </Pressable>
  );
}

export function AgendaPreview({
  meeting,
  limit = 3,
  showNumber = false,
}: {
  meeting: Meeting;
  limit?: number;
  showNumber?: boolean;
}) {
  if (!Array.isArray(meeting.agenda_item_occurrences)) {
    return <Text style={styles.muted}>Ã…bn mÃ¸det for at se dagsordenen.</Text>;
  }

  const agenda = sortedAgendaItems(meeting);
  const visible = agenda.slice(0, limit);
  const remaining = Math.max(agenda.length - visible.length, 0);

  if (agenda.length === 0) {
    return <Text style={styles.muted}>Ingen dagsordenspunkter endnu.</Text>;
  }

  return (
    <View style={styles.agendaList}>
      {visible.map((occurrence, index) => (
        <AgendaItemRow
          key={`${occurrence.position}-${occurrence.agenda_items?.id ?? index}`}
          index={index}
          itemType={occurrence.agenda_items?.item_type}
          showNumber={showNumber}
          title={occurrence.agenda_items?.title ?? "Dagsordenspunkt"}
        />
      ))}
      {remaining > 0 ? (
        <Text style={styles.moreText}>+ {remaining} flere punkter</Text>
      ) : null}
    </View>
  );
}

export function AgendaItemRow({
  index,
  itemType,
  showNumber = false,
  title,
}: {
  index: number;
  itemType?: string | null;
  showNumber?: boolean;
  title: string;
}) {
  return (
    <View style={styles.agendaRow}>
      {showNumber ? <Text style={styles.agendaNumber}>{index + 1}.</Text> : null}
      <Text style={styles.agendaText}>
        ({agendaLabel(itemType)}) {title}
      </Text>
    </View>
  );
}

export function TaskCard({
  task,
  compact = false,
}: {
  task: Task;
  compact?: boolean;
}) {
  const relationParts = [
    task.meeting ? `Møde: ${task.meeting.title}` : null,
    task.agendaItem
      ? `Punkt: (${agendaLabel(task.agendaItem.item_type)}) ${task.agendaItem.title}`
      : null,
    task.decision ? `Beslutning: ${task.decision.title}` : null,
  ].filter(Boolean);

  return (
    <View style={[styles.taskCard, compact && styles.taskCardCompact]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.cardTitle}>{task.title}</Text>
          <Text style={styles.meta}>
            {taskStatusLabels[task.status] ?? task.status}
            {task.deadline ? ` · ${formatDateTime(task.deadline)}` : ""}
          </Text>
        </View>
        {task.responsible?.full_name ? (
          <View style={styles.ownerPill}>
            <Text style={styles.ownerText}>{task.responsible.full_name}</Text>
          </View>
        ) : null}
      </View>
      {!compact && task.description ? (
        <Text style={styles.body}>{task.description}</Text>
      ) : null}
      {relationParts.length > 0 ? (
        <Text style={styles.meta}>{relationParts.join(" · ")}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screenContent: { gap: 14, padding: 16, paddingBottom: 140 },
  pageHeader: { gap: 4, paddingBottom: 2 },
  pageTitle: { color: "#172033", fontSize: 25, fontWeight: "900" },
  pageSubtitle: { color: "#657282", fontSize: 14, lineHeight: 20 },
  sectionCard: {
    backgroundColor: "#fff",
    borderColor: "#e4ddd3",
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  sectionTitle: { color: "#172033", fontSize: 16, fontWeight: "900" },
  sectionBody: { gap: 10 },
  meetingCard: {
    backgroundColor: "#fff",
    borderColor: "#e4ddd3",
    borderLeftColor: "#10243f",
    borderLeftWidth: 4,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  taskCard: {
    backgroundColor: "#fbfaf7",
    borderColor: "#e4ddd3",
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  taskCardCompact: { paddingVertical: 10 },
  cardHeader: { alignItems: "flex-start", flexDirection: "row", gap: 10 },
  cardTitleBlock: { flex: 1, gap: 3 },
  cardTitle: { color: "#172033", fontSize: 16, fontWeight: "900" },
  meta: { color: "#657282", fontSize: 12, lineHeight: 18 },
  muted: { color: "#657282", fontSize: 13, lineHeight: 19 },
  body: { color: "#283347", fontSize: 14, lineHeight: 20 },
  countPill: {
    alignItems: "center",
    backgroundColor: "#edf2f7",
    borderRadius: 999,
    minWidth: 32,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  countText: { color: "#10243f", fontSize: 12, fontWeight: "900" },
  agendaList: { gap: 5 },
  agendaRow: { alignItems: "flex-start", flexDirection: "row", gap: 6 },
  agendaNumber: { color: "#657282", fontSize: 13, fontWeight: "800", width: 22 },
  agendaText: { color: "#283347", flex: 1, fontSize: 13, lineHeight: 18 },
  moreText: { color: "#0f4f8f", fontSize: 12, fontWeight: "800", paddingTop: 2 },
  openText: { color: "#0f4f8f", fontSize: 13, fontWeight: "900" },
  ownerPill: {
    backgroundColor: "#eef3ee",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  ownerText: { color: "#356247", fontSize: 11, fontWeight: "800" },
});

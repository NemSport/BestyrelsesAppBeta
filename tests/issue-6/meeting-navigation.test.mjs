import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  richTextToPlainText,
  sanitizeRichText,
} from "../../src/lib/rich-text.ts";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const [
  meetingPage,
  minutes,
  header,
  dirtyGuard,
  pdf,
  relatedTasks,
  relatedDecisions,
  globalStyles,
  aiAssistant,
  autosaveFeedback,
  richTextEditor,
  richTextContent,
  decisionDetail,
  decisionCreate,
  taskCreate,
  iconSystem,
  minutesGovernance,
] = await Promise.all([
  source(
    "../../src/app/(app)/organizations/[organizationId]/committees/[committeeId]/meetings/[meetingId]/page.tsx",
  ),
  source("../../src/components/meetings/meeting-minutes-section.tsx"),
  source("../../src/components/meetings/meeting-document-header.tsx"),
  source("../../src/lib/navigation-guard.ts"),
  source("../../src/lib/minutes-pdf.ts"),
  source("../../src/components/tasks/related-tasks.tsx"),
  source("../../src/components/decisions/related-decisions.tsx"),
  source("../../src/app/globals.css"),
  source("../../src/components/meetings/minutes-ai-assistant.tsx"),
  source("../../src/components/meetings/autosave-feedback.tsx"),
  source("../../src/components/forms/rich-text-editor.tsx"),
  source("../../src/components/forms/rich-text-content.tsx"),
  source("../../src/components/decisions/decision-detail-modal.tsx"),
  source("../../src/components/decisions/decision-create-modal.tsx"),
  source("../../src/components/tasks/task-create-modal.tsx"),
  source("../../src/components/icons/app-icon.tsx"),
  source("../../src/components/meetings/minutes-governance.tsx"),
]);

test("meeting workspace renders one active agenda item in a compact three-column desktop layout", () => {
  assert.match(
    minutes,
    /xl:grid-cols-\[minmax\(12rem,18fr\)_minmax\(0,82fr\)\]/,
  );
  assert.match(
    minutes,
    /xl:grid-cols-\[minmax\(0,27fr\)_minmax\(16rem,14fr\)\]/,
  );
  assert.match(minutes, /aria-label="Dagsordenspunkter"/);
  assert.match(minutes, /max-h-\[calc\(100vh-6rem\)\]/);
  assert.match(minutes, /overflow-y-auto/);
  assert.match(minutes, /aria-current=\{isActive \? "location" : undefined\}/);
  assert.match(minutes, /border-brand bg-brand-soft\/70 text-brand/);
  assert.match(minutes, /agendaStatusIconName\(itemStatus\)/);
  assert.match(minutes, /Kontekst for aktivt dagsordenspunkt/);
  assert.match(minutes, /Beslutninger/);
  assert.match(minutes, /Opgaver/);
  assert.match(minutes, /Private noter/);
  assert.match(minutes, /Små værktøjer til det aktive punkt/);
  assert.match(minutes, /hidden=\{occurrence\.id !== activeOccurrence\.id\}/);
  assert.match(
    minutes,
    /aria-hidden=\{occurrence\.id !== activeOccurrence\.id\}/,
  );
  assert.doesNotMatch(minutes, /agendaPointHash =/);
});

test("the active item is addressable and follows native hash history", () => {
  assert.match(minutes, /#agenda-point-\(\.\+\)\$/);
  assert.match(minutes, /window\.addEventListener\("hashchange"/);
  assert.match(minutes, /href=\{`#agenda-point-\$\{occurrence\.id\}`\}/);
  assert.match(minutes, /focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(minutes, /history\.(pushState|replaceState)/);
  assert.doesNotMatch(minutes, /router\.(push|replace)/);
});

test("mobile exposes current context, a modal selector, and previous/next links", () => {
  assert.match(
    minutes,
    /Punkt \{activeIndex \+ 1\} af \{occurrences\.length\}/,
  );
  assert.match(minutes, /Vælg et andet punkt/);
  assert.match(minutes, /open=\{selectorOpen\}/);
  assert.match(minutes, /setSelectorOpen\(false\)/);
  assert.match(minutes, /<AppIcon name="arrowLeft" size=\{15\} \/>/);
  assert.match(minutes, /Forrige punkt/);
  assert.match(minutes, /Næste punkt/);
  assert.match(minutes, /<AppIcon name="arrowRight" size=\{15\} \/>/);
});

test("point editing opens for the active referent and cards stay mounted to preserve drafts", () => {
  assert.match(minutes, /const \[isEditingMinutes, setIsEditingMinutes\]/);
  assert.match(minutes, /useState\(canEdit\)/);
  assert.match(minutes, /if \(canEdit\) setIsEditingMinutes\(true\)/);
  assert.match(minutes, /canEdit && !isEditingMinutes/);
  assert.match(minutes, /Rediger referat/);
  assert.match(minutes, /canEdit && isEditingMinutes/);
  assert.match(minutes, /DecisionCreateModal/);
  assert.match(minutes, /TaskCreateModal/);
  assert.match(minutes, /agenda-task-context-/);
  assert.match(minutes, /Flere handlinger/);
  assert.match(minutes, /useDismissibleDetails\(moreActionsRef\)/);
  assert.match(minutes, /occurrences\.map\(\(occurrence, index\) => \(/);
  assert.match(minutes, /hidden=\{occurrence\.id !== activeOccurrence\.id\}/);
});

test("visual reset separates editing from reading and approval", () => {
  const currentComponent = minutes.slice(
    minutes.indexOf("export function MeetingMinutesSection"),
  );
  assert.match(currentComponent, /workspaceMode/);
  assert.match(currentComponent, />\s*Redigering\s*</);
  assert.match(currentComponent, />\s*Læsning\/godkendelse\s*</);
  assert.match(currentComponent, /workspaceMode === "editing"/);
  assert.match(currentComponent, /<MinutesApprovalPanel/);
  assert.match(currentComponent, />\s*Mødereferat\s*</);
  assert.match(
    currentComponent,
    /meetingStatus === "approved" &&\s*workspaceMode === "editing"/,
  );
  assert.match(currentComponent, /\{reviewSupplement\}/);
  assert.doesNotMatch(currentComponent, /Private noter for hele mødet/);
  assert.doesNotMatch(meetingPage, /Arbejd med ét dagsordenspunkt ad gangen/);
});

test("review mode renders one calm document with all agenda items", () => {
  const currentComponent = minutes.slice(
    minutes.indexOf("export function MeetingMinutesSection"),
  );
  assert.match(
    currentComponent,
    /xl:grid-cols-\[minmax\(12rem,20fr\)_minmax\(0,61fr\)_minmax\(14rem,19fr\)\]/,
  );
  assert.match(
    currentComponent,
    /occurrences\.map\(\(occurrence, index\) => \{/,
  );
  assert.match(currentComponent, /id=\{`agenda-point-\$\{occurrence\.id\}`\}/);
  assert.match(currentComponent, /emptyText="Intet referat registreret\."/);
  assert.match(currentComponent, /max-w-\[52rem\]/);
  assert.match(currentComponent, /text-\[0\.95rem\] leading-7/);
});

test("review mode renders the current official draft instead of stale initial props", () => {
  const currentComponent = minutes.slice(
    minutes.indexOf("export function MeetingMinutesSection"),
  );
  assert.match(currentComponent, /reviewAgendaDrafts/);
  assert.match(currentComponent, /onDraftChange=\{handleAgendaDraftChange\}/);
  assert.match(currentComponent, /const reviewNotes =/);
  assert.match(currentComponent, /value=\{hasNotes \? reviewNotes : null\}/);
  assert.match(
    currentComponent,
    /window\.dispatchEvent\(new Event\(flushActiveAgendaDraftEvent\)\);\s*setWorkspaceMode\("review"\)/,
  );
});

test("read mode renders rich text safely and does not repeat matching agenda context", () => {
  const formatted = sanitizeRichText(
    '<p>Dagsordenspunktet blev <strong>drøftet</strong> og <em>afklaret</em>.</p><ul><li>Første punkt</li></ul><ol><li>Næste punkt</li></ol><p><a href="https://example.com">Bilag</a></p>',
  );

  assert.match(
    formatted,
    /<p>Dagsordenspunktet blev <strong>drøftet<\/strong>/,
  );
  assert.match(formatted, /<em>afklaret<\/em>/);
  assert.match(formatted, /<ul><li>Første punkt<\/li><\/ul>/);
  assert.match(formatted, /<ol><li>Næste punkt<\/li><\/ol>/);
  assert.match(
    formatted,
    /<a href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer">Bilag<\/a>/,
  );
  assert.doesNotMatch(formatted, /&lt;(?:p|ul|li|strong|em|a)\b/i);
  assert.equal(
    richTextToPlainText("Noter: <p>Dagsordenspunktet blev drøftet.</p>")
      .replace(/^(?:noter|referat)\s*:\s*/i, "")
      .trim(),
    richTextToPlainText("<p>Dagsordenspunktet blev drøftet.</p>"),
  );

  assert.match(richTextContent, /dangerouslySetInnerHTML/);
  assert.match(richTextContent, /sanitizeRichText\(value\)/);
  assert.match(
    minutes,
    /const agendaContext = item\.description \|\| item\.objective/,
  );
  assert.match(minutes, /const hasDistinctAgendaContext = Boolean/);
  assert.match(minutes, /value=\{agendaContext\}/);
  assert.doesNotMatch(
    minutes.slice(minutes.indexOf('workspaceMode === "editing"')),
    /<p className="mt-2 max-w-\[52rem\].*\{item\.description \|\| item\.objective\}/s,
  );
});

test("review mode keeps point decisions and tasks read-only", () => {
  const currentComponent = minutes.slice(
    minutes.indexOf("export function MeetingMinutesSection"),
  );
  assert.match(
    currentComponent,
    /relatedDecisions\.length > 0[\s\S]*<RelatedDecisions[\s\S]*compact/,
  );
  assert.match(
    currentComponent,
    /relatedTasks\.length > 0[\s\S]*<RelatedTasks[\s\S]*canEdit=\{false\}[\s\S]*openInModal/,
  );
  assert.match(currentComponent, /<MinuteAttachments[\s\S]*canEdit=\{false\}/);
  assert.match(currentComponent, /mergeTransferredTaskReferences/);
});

test("review mode uses the compact sticky approval panel", () => {
  assert.match(minutes, /<aside className="xl:sticky xl:top-20">/);
  assert.match(minutes, /<MinutesApprovalPanel[\s\S]*compact/);
  assert.match(minutes, /Afventer \$\{pendingCount\}/);
  assert.match(minutesGovernance, /if \(compact\) \{/);
  assert.match(minutesGovernance, /approvalInitials\(approval\.memberName\)/);
  assert.match(minutesGovernance, />\s*Godkend referat\s*</);
  assert.match(minutesGovernance, />\s*Anmod om ændringer\s*</);
  assert.match(minutesGovernance, /status: "change_requested"/);
  assert.match(minutesGovernance, /router\.refresh\(\)/);
});

test("review document precedes transferred items and excludes editing tools", () => {
  const currentComponent = minutes.slice(
    minutes.indexOf("export function MeetingMinutesSection"),
  );
  const readDocument = currentComponent.slice(
    currentComponent.indexOf("Mødereferat"),
  );
  assert.ok(
    readDocument.indexOf("reviewNotes") <
      readDocument.indexOf("{reviewSupplement}"),
  );
  assert.doesNotMatch(readDocument, /<PrivateNoteEditor/);
  assert.doesNotMatch(readDocument, /<MinutesAiAssistant/);
  assert.doesNotMatch(readDocument, /<DecisionCreateModal/);
  assert.doesNotMatch(readDocument, /<TaskCreateModal/);
});

test("active point uses a compact title-first editor and one private-note column", () => {
  assert.match(minutes, /\{displayNumber\}\. \{agendaItemTypeLabels/);
  assert.match(minutes, /<span>\{item\.title\}<\/span>/);
  assert.match(minutes, /Referat, synspunkter og drøftelse/);
  assert.match(minutes, /minHeightClass="min-h-\[18rem\] xl:min-h-\[20rem\]"/);
  assert.doesNotMatch(minutes, /flex h-8 w-8 shrink-0.*\{displayNumber\}/s);
  assert.match(minutes, /Kontekst for aktivt dagsordenspunkt/);
  assert.match(minutes, /Kun for dig/);
  assert.match(minutes, /showMeetingPrivateNote/);
  assert.match(minutes, /compact\s+initialPrivateNote=\{initialPrivateNote\}/);
});

test("AI stays as compact existing actions in the context column", () => {
  assert.match(minutes, /action="professional_board_style"/);
  assert.match(minutes, /triggerLabel="Forbedr formulering"/);
  assert.match(minutes, /action="shorten"/);
  assert.match(minutes, /triggerLabel="Opsummér punkt"/);
  assert.match(minutes, /triggerLabel="Find opgaver"/);
  assert.match(minutes, /compactTrigger/);
  assert.doesNotMatch(minutes, /triggerLabel="Udled beslutning"/);
  assert.match(minutes, /\{canEdit \|\| canEditTasks \? \(/);
  assert.match(minutes, /grid grid-cols-1 gap-1\.5 xl:grid-cols-2/);
  assert.match(aiAssistant, /loadingAction === action/);
  assert.match(aiAssistant, /role="alert"/);
  assert.match(aiAssistant, /Kopiér forslag/);
  assert.match(aiAssistant, /Anvend forslag/);
  assert.match(aiAssistant, /ændrer ikke referatet\s+uden din accept/);
});

test("private notes use the compact personal-note autosave surface", () => {
  assert.match(minutes, /bg-warning-soft\/55/);
  assert.match(minutes, /placeholder="Skriv dine egne noter her…"/);
  assert.match(minutes, /minHeightClass="min-h-24"/);
  assert.match(minutes, /savedLabel="Gemt"/);
  assert.match(minutes, /Note til dette dagsordenspunkt/);
  assert.match(minutes, /Note for hele mødet/);
  assert.doesNotMatch(minutes, /compact\s+\? "Gem note"/);
});

test("zero, one, and many agenda items keep explicit workspace states", () => {
  assert.match(minutes, /occurrences\[0\]\?\.id \?\? null/);
  assert.match(minutes, /activeOccurrence\?\.agenda_items/);
  assert.match(minutes, /occurrences\.length > 1/);
  assert.match(minutes, /Mødet har endnu ingen dagsordenspunkter/);
  assert.match(minutes, /kind=\{canEdit \? "empty" : "read-only"\}/);
});

test("context actions remain capability-gated and private notes stay personal", () => {
  assert.match(minutes, /\{canEditDecisions \? \(/);
  assert.match(minutes, /\{canEditTasks \? \(/);
  assert.match(minutes, /\{canEditPrivateNotes \? \(/);
  assert.match(minutes, /initialPrivateNote=\{initialPrivateNote\}/);
  assert.match(minutes, /agendaItemId=\{item\.id\}/);
  assert.match(minutes, /userId=\{userId\}/);
  assert.match(
    meetingPage,
    /canEditPrivateNotes=\{meetingCapabilities\.viewMeeting\}/,
  );
});

test("meeting header is compact and secondary actions share one dropdown", () => {
  assert.match(header, /text-xl font-bold/);
  assert.match(header, /flex flex-wrap items-center gap-x-1\.5/);
  assert.equal(header.match(/\{meeting\.title\}/g)?.length, 1);
  assert.doesNotMatch(header, /meeting-metadata-grid/);
  assert.match(meetingPage, /<Dropdown/);
  assert.match(meetingPage, /panelId="meeting-secondary-actions"/);
  assert.match(meetingPage, /panelId="meeting-export-actions"/);
  assert.match(meetingPage, /label="Eksportér"/);
  assert.match(meetingPage, /<AppIcon name="more"/);
  assert.match(meetingPage, /Tilbage til møder/);
  assert.match(
    meetingPage,
    /<MeetingAiOverview[\s\S]*<Dropdown|<Dropdown[\s\S]*<MeetingAiOverview/,
  );
  assert.match(meetingPage, /<MeetingParticipantsPanel[\s\S]*compact/);
  assert.match(
    header,
    /visibleParticipantNames = participantNames\.slice\(0, 5\)/,
  );
  assert.match(
    header,
    /inline-flex size-8 shrink-0 items-center justify-center rounded-full/,
  );
  assert.match(header, /<header className="meeting-document-header">/);
});

test("desktop header integrates navigation, participants, modes, and actions", () => {
  assert.match(header, /xl:grid-cols-\[minmax\(0,3fr\)_minmax\(30rem,2fr\)\]/);
  assert.match(header, /\{backLink \? <div className="mb-0\.5">/);
  assert.match(header, /xl:inline-flex xl:align-middle/);
  assert.match(header, /id="meeting-header-mode-slot"/);
  assert.match(header, /meeting-header-action-zone/);
  assert.match(minutes, /createPortal/);
  assert.match(
    minutes,
    /document\.getElementById\("meeting-header-mode-slot"\)/,
  );
  assert.match(minutes, /gap-1\.5 xl:flex/);
  assert.match(minutes, /justify-end gap-2 xl:hidden/);
  assert.match(meetingPage, /backLink=\{/);
});

test("participant avatars cover empty, one, five, and overflow states", () => {
  assert.match(
    header,
    /const participantNames = participantSummary\?\.names \?\? \[\]/,
  );
  assert.match(header, /visibleParticipantNames\.map\(\(name, index\) =>/);
  assert.match(
    header,
    /participantNames\.length - visibleParticipantNames\.length/,
  );
  assert.match(header, /hiddenParticipantCount > 0/);
  assert.match(header, /\+\{hiddenParticipantCount\}/);
  assert.match(header, /title=\{name\}/);
  assert.match(header, /className="inline-flex size-8/);
  assert.match(meetingPage, /participant\.attendance_status !== "declined"/);
  assert.match(meetingPage, /const declinedParticipantUserIds = new Set/);
  assert.match(
    meetingPage,
    /participantChipNames\.length > 0\s+\? participantChipNames\s+: emailRecipients/,
  );
  assert.match(
    meetingPage,
    /!declinedParticipantUserIds\.has\(recipient\.userId\)/,
  );
  assert.match(meetingPage, /names: participantHeaderNames/);
  assert.match(header, /\{participantCountLabel\}/);
});

test("desktop workspace is one integrated agenda, editor, and context surface", () => {
  assert.match(
    minutes,
    /xl:overflow-hidden xl:rounded-\[var\(--radius-panel\)\] xl:border/,
  );
  assert.match(minutes, /xl:border-r xl:border-line\/70/);
  assert.match(minutes, /xl:rounded-none xl:border-0/);
  assert.match(minutes, /xl:w-\[18%\].*xl:border-t/);
  assert.match(minutes, /compactToolbar=\{compact\}/);
  assert.match(minutes, /\{formatDateTime\(minutes\.updated_at\)\}/);
  assert.match(minutes, /\{notesWordCount\} ord/);
});

test("compact task rows prioritize title, responsible person, deadline, and status", () => {
  assert.match(relatedTasks, /const rowContent = compact \? \(/);
  assert.match(relatedTasks, /name=\{taskStatusIconName\(task\.status\)\}/);
  assert.match(relatedTasks, /initials\(responsibleName\)/);
  assert.match(relatedTasks, /task\.deadline \? formatDate\(task\.deadline\)/);
  assert.match(
    relatedTasks,
    /Oprettet på \{origins\[task\.id\]\.meeting\.title\}/,
  );
  assert.match(
    relatedTasks,
    /deadlineState === "overdue" && "font-semibold text-danger"/,
  );
  assert.match(
    relatedTasks,
    /deadlineState === "today" \|\| deadlineState === "soon"/,
  );
  assert.match(relatedTasks, /compact \? "py-0\.5" : "py-1\.5"/);
  assert.match(relatedTasks, /size=\{17\}/);
  assert.match(relatedTasks, /inline-flex size-6/);
});

test("workspace polish keeps notes personal and softens compact agenda chrome", () => {
  assert.match(minutes, /space-y-1\.5 bg-transparent p-0/);
  assert.match(minutes, /compact \? null : \(/);
  assert.match(minutes, /bg-warning-soft\/55/);
  assert.match(minutes, /bg-subtle\/50/);
  assert.match(minutes, /isCompleted \? "text-success" : "text-muted"/);
  assert.match(relatedDecisions, /<article className="py-0\.5"/);
});

test("desktop width polish prioritizes the editor and aligns decision rows with tasks", () => {
  assert.match(globalStyles, /data-meeting-workspace[\s\S]*max-width: 108rem/);
  assert.match(
    relatedDecisions,
    /flex min-h-11 w-full items-center rounded-\[var\(--radius-control\)\] px-1\.5 py-1\.5/,
  );
  assert.match(
    relatedDecisions,
    /flex min-w-0 flex-1 flex-wrap items-start gap-x-2 gap-y-1 sm:flex-nowrap/,
  );
  assert.match(
    relatedDecisions,
    /ml-6 flex min-w-0 flex-wrap items-center gap-1 text-\[0\.7rem\].*sm:flex-col sm:items-end/,
  );
  assert.match(
    relatedDecisions,
    /<StatusBadge tone=\{decisionStatusTones\[decision\.status\]\}>/,
  );
});

test("final visual polish uses signal colors, stronger CTAs, and wider workspace", () => {
  assert.match(minutes, /isCompleted[\s\S]*"text-success"/);
  assert.match(minutes, /border-brand bg-brand[\s\S]*Næste punkt/);
  assert.match(minutes, /bg-brand text-white shadow-sm/);
  assert.match(relatedDecisions, /compact \? \(/);
  assert.match(relatedDecisions, /decision\.status === "completed"/);
  assert.match(aiAssistant, /border-brand\/20 bg-surface/);
  assert.match(meetingPage, /data-meeting-workspace/);
  assert.match(globalStyles, /data-meeting-workspace/);
});

test("locked users retain a full-height official minutes reading surface", () => {
  assert.match(
    minutes,
    /Du skal være referent for at redigere det officielle referat/,
  );
  assert.match(minutes, /editorLockAction/);
  assert.match(
    minutes,
    /<ReferentRoleControl[\s\S]*canEdit=\{effectiveCanEdit\}/,
  );
  assert.match(minutes, /emptyText="Referatet er endnu ikke påbegyndt\."/);
  assert.match(minutes, /min-h-\[18rem\] p-3 xl:min-h-\[20rem\]/);
  assert.match(minutes, /if \(!canEdit\) return null/);
});

test("point responsibility, deadline, attachments, and status share one metadata row", () => {
  const card = minutes.slice(
    minutes.indexOf("function AgendaMinutesCard"),
    minutes.indexOf("function LegacyMeetingMinutesSection"),
  );
  assert.match(card, /grid grid-cols-2.*gap-x-3 gap-y-2 border-t/);
  assert.match(card, /name="members"/);
  assert.match(card, /name="calendar"/);
  assert.match(card, /name="attachments"/);
  assert.match(card, /agendaStatusIconName\(status\)/);
  assert.match(card, /Sidst opdateret/);
  assert.match(card, /primaryAttachment\.fileName/);
  assert.match(
    card,
    /minutes-attachments\/\$\{primaryAttachment\.id\}\/download/,
  );
  assert.match(card, />\s*Åbn punkt\s*</);
  assert.doesNotMatch(card, /responsible\?\.name \|\| <EmptyValue/);
  assert.match(
    card,
    /<details className="group border-t border-line\/70 bg-subtle\/20">/,
  );
  assert.match(card, /bg-warning-soft\/55/);
});

test("workspace footer actions keep compact aligned bottom spacing", () => {
  assert.match(minutes, /className="relative pb-4 xl:pb-5"/);
  assert.match(minutes, /xl:bottom-5/);
  assert.match(minutes, /xl:w-\[18%\]/);
});

test("final responsive polish keeps tablet single-column and mobile rows wrap-safe", () => {
  assert.doesNotMatch(minutes, /lg:grid-cols-\[minmax\(12rem,18fr\)/);
  assert.match(minutes, /workspace-scrollbar/);
  assert.match(
    relatedTasks,
    /flex-wrap items-start gap-x-2 gap-y-1 sm:flex-nowrap/,
  );
  assert.match(
    relatedDecisions,
    /flex-wrap items-start gap-x-2 gap-y-1 sm:flex-nowrap/,
  );
  assert.match(
    richTextEditor,
    /grid min-h-10 grid-cols-\[minmax\(0,1fr\)_auto\]/,
  );
});

test("general minutes editor is absent while historical data contracts remain", () => {
  const currentComponent = minutes.slice(
    minutes.indexOf("export function MeetingMinutesSection"),
  );
  assert.doesNotMatch(currentComponent, /meeting-minutes-text/);
  assert.doesNotMatch(currentComponent, /Generelt mødereferat/);
  assert.match(currentComponent, /initialMeetingMinutes/);
  assert.match(currentComponent, /MinutesApprovalPanel/);
  assert.match(currentComponent, /general-minutes-heading/);
  assert.match(pdf, /agendaItemMinutes/);
  assert.match(pdf, /minutes_text/);
});

test("page keeps participants and capabilities but removes duplicate section navigation", () => {
  assert.match(header, /id="meeting-participants-heading"/);
  assert.match(meetingPage, /getMeetingCapabilities/);
  assert.match(meetingPage, /meetingCapabilities\.editOfficialMinutes/);
  assert.match(meetingPage, /meetingCapabilities\.editDecisions/);
  assert.match(meetingPage, /meetingCapabilities\.editTasks/);
  assert.doesNotMatch(meetingPage, /MeetingSectionNavigation/);
  assert.doesNotMatch(meetingPage, /meeting-related-work/);
});

test("hash-only navigation does not trigger the dirty-form leave guard", () => {
  assert.match(dirtyGuard, /targetUrl\.pathname === currentUrl\.pathname/);
  assert.match(dirtyGuard, /targetUrl\.search === currentUrl\.search/);
  assert.match(dirtyGuard, /hash-only change does not discard/);
});

test("official minutes editor stays compact, focusable, and naturally growing", () => {
  assert.match(minutes, /minHeightClass="min-h-\[18rem\] xl:min-h-\[20rem\]"/);
  assert.match(richTextEditor, /overflow-visible px-3 py-3 text-sm leading-6/);
  assert.match(richTextEditor, /focus-within:border-brand/);
  assert.match(richTextEditor, /min-h-9 flex-wrap/);
  assert.doesNotMatch(richTextEditor, /max-h-|overflow-y-auto/);
  assert.match(minutes, /\{notesWordCount\} ord/);
});

test("autosave feedback is compact and includes saved time", () => {
  assert.match(autosaveFeedback, /saved: "Autogemt"/);
  assert.match(autosaveFeedback, /offline: "Offline – gemmes lokalt"/);
  assert.match(autosaveFeedback, /conflict: "Konflikt kræver handling"/);
  assert.match(autosaveFeedback, /lastSavedAt\?/);
  assert.match(autosaveFeedback, /aria-live="polite"/);
  assert.match(minutes, /lastSavedAt=\{autosave\.lastSavedAt\}/);
});

test("editor surface integrates text style, autosave, and word count", () => {
  assert.match(richTextEditor, /aria-label="Teksttype"/);
  assert.match(richTextEditor, /Brødtekst/);
  assert.match(richTextEditor, /setHeading\(\{ level: 2 \}\)/);
  assert.match(richTextEditor, /footer\?: React\.ReactNode/);
  assert.match(richTextEditor, /rounded-b-\[var\(--radius-panel\)\]/);
  assert.match(
    minutes,
    /footer=\{[\s\S]*<AutosaveStatusLine[\s\S]*\{notesWordCount\} ord/,
  );
});

test("status, writing help, and editor actions stay close to the writing surface", () => {
  assert.match(minutes, /className="space-y-2 p-3"/);
  assert.match(minutes, /Skrivehjælp/);
  assert.match(minutes, /min-h-7 w-auto min-w-36/);
  assert.match(minutes, /bg-subtle\/25 px-2 py-1\.5/);
  assert.match(minutes, /variant="ghost"/);
  assert.match(minutes, /className="mt-1 grid grid-cols-2/);
});

test("point navigation flushes the active draft and exposes boundary states", () => {
  assert.match(minutes, /meeting-minutes:flush-active-draft/);
  assert.match(
    minutes,
    /window\.dispatchEvent\(new Event\(flushActiveAgendaDraftEvent\)\)/,
  );
  assert.match(minutes, /void flushAutosave\(\)/);
  assert.match(minutes, /isActive=\{occurrence\.id === activeOccurrence\.id\}/);
  assert.match(
    minutes,
    /<button[\s\S]*disabled[\s\S]*Forrige punkt[\s\S]*<\/button>/,
  );
  assert.match(
    minutes,
    /<button[\s\S]*disabled[\s\S]*Næste punkt[\s\S]*<\/button>/,
  );
});

test("existing point statuses power the explicit completed action", () => {
  assert.match(minutes, /function completedAgendaStatusForType/);
  assert.match(minutes, /information: "information_oriented"/);
  assert.match(minutes, /discussion: "discussion_completed"/);
  assert.match(minutes, /decision: "decision_approved"/);
  assert.match(minutes, /follow_up: "follow_up_completed"/);
  assert.match(minutes, /Markér som behandlet/);
  assert.match(
    minutes,
    /onStatusChange\?\.\(item\.id, result\.minutes\.status\)/,
  );
  assert.match(
    minutes,
    /agendaItemStatusOverrides\[occurrence\.agenda_item_id\]/,
  );
});

test("active point context filters decisions and tasks by agenda item relation", () => {
  assert.match(
    minutes,
    /meetingDecisions\.filter\([\s\S]*relatedDecision\.agenda_item_id === item\.id/,
  );
  assert.match(
    minutes,
    /meetingTasks\.filter\([\s\S]*relatedTask\.agenda_item_id === item\.id/,
  );
  assert.match(minutes, /hidden=\{occurrence\.id !== activeOccurrence\.id\}/);
  assert.match(minutes, /Ingen beslutninger på dette punkt/);
  assert.match(minutes, /Ingen opgaver på dette punkt/);
});

test("workspace hides non-semantic previous decision history", () => {
  const card = minutes.slice(
    minutes.indexOf("function AgendaMinutesCard"),
    minutes.indexOf("function LegacyMeetingMinutesSection"),
  );
  assert.doesNotMatch(card, /Tidligere beslutninger/);
  assert.doesNotMatch(card, /<DecisionHistory/);
  assert.match(card, /<RelatedDecisions/);
  assert.match(card, /relatedDecision\.agenda_item_id === item\.id/);
});

test("compact decision rows open the existing mutation contract in a modal", () => {
  assert.match(relatedDecisions, /setActiveDecisionId\(decision\.id\)/);
  assert.match(relatedDecisions, /<DecisionDetailModal/);
  assert.match(relatedDecisions, /canEdit=\{canEdit\}/);
  assert.match(decisionDetail, /fetch\(`\/api\/decisions\/\$\{decision\.id\}`/);
  assert.match(decisionDetail, /method: "PATCH"/);
  assert.match(decisionDetail, /agendaItemId: decision\.agenda_item_id/);
  assert.match(
    decisionDetail,
    /performAction\(action: "archive" \| "cancel"\)/,
  );
  assert.match(decisionDetail, /useUnsavedChanges/);
  assert.match(decisionDetail, /Kun læseadgang/);
});

test("point create modals keep meeting context and refresh in place", () => {
  assert.match(minutes, /initialAgendaItemId=\{item\.id\}/);
  assert.match(minutes, /initialMeetingId=\{meetingId\}/);
  assert.match(
    minutes,
    /agendaItems=\{\[\{ id: item\.id, title: item\.title \}\]\}/,
  );
  assert.match(decisionCreate, /setAgendaItemId\(initialAgendaItemId\)/);
  assert.match(taskCreate, /setAgendaItemId\(initialAgendaItemId\)/);
  assert.match(decisionCreate, /setOpen\(false\);\s*router\.refresh\(\)/);
  assert.match(taskCreate, /setOpen\(false\);\s*router\.refresh\(\)/);
});

test("compact task rows preserve modal editing and semantic deadline states", () => {
  assert.match(relatedTasks, /openInModal \? \(/);
  assert.match(relatedTasks, /setActiveTaskId\(task\.id\)/);
  assert.match(relatedTasks, /<TaskDetailModal/);
  assert.match(
    relatedTasks,
    /task\.status === "completed" \|\| task\.status === "cancelled"/,
  );
  assert.match(relatedTasks, /deadlineState === "overdue"/);
  assert.match(
    relatedTasks,
    /deadlineState === "today" \|\| deadlineState === "soon"/,
  );
  assert.match(relatedTasks, /day: "numeric"/);
  assert.match(relatedTasks, /month: "short"/);
});

test("task status icons distinguish open, active, completed, and cancelled", () => {
  assert.match(relatedTasks, /status === "completed"\) return "taskCompleted"/);
  assert.match(relatedTasks, /status === "cancelled"\) return "taskCancelled"/);
  assert.match(relatedTasks, /status === "in_progress"\) return "progress"/);
  assert.match(relatedTasks, /return "pending"/);
  assert.match(iconSystem, /taskCompleted: CircleCheckBig/);
  assert.match(iconSystem, /taskCancelled: CircleX/);
  assert.match(relatedTasks, /task\.status !== "completed" \? \(/);
  assert.match(relatedTasks, /deadlineState === "overdue"/);
});

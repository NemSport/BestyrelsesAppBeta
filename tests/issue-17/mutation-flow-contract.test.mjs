import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const [
  api,
  resourceForm,
  participants,
  tasks,
  decisions,
  members,
  autosave,
  quickActions,
  mutationHook,
  autosaveState,
  meetingService,
  meetingRepository,
  participantRoute,
  participantRls,
] = await Promise.all([
  source("../../src/lib/api.ts"),
  source("../../src/components/forms/resource-form.tsx"),
  source("../../src/components/meetings/meeting-participants-panel.tsx"),
  source("../../src/components/tasks/task-create-modal.tsx"),
  source("../../src/components/decisions/decision-create-modal.tsx"),
  source("../../src/components/members/member-access-editor.tsx"),
  source("../../src/hooks/use-offline-autosave.ts"),
  source("../../src/components/layout/quick-action-menu.tsx"),
  source("../../src/hooks/use-mutation-feedback.ts"),
  source("../../src/lib/autosave-state.ts"),
  source("../../src/services/meeting-service.ts"),
  source("../../src/repositories/meeting-repository.ts"),
  source("../../src/app/api/meetings/[meetingId]/participants/route.ts"),
  source(
    "../../supabase/migrations/202607240003_fix_meeting_participant_manager_select.sql",
  ),
]);

test("API validation retains nested field paths", () => {
  const responseBody = api.slice(api.indexOf("return NextResponse.json"));
  assert.match(responseBody, /validationErrors: error\.issues\.map/);
  assert.match(api, /path: issue\.path/);
});

test("central meeting and agenda forms use shared mutation feedback", () => {
  assert.match(resourceForm, /useMutationFeedback/);
  assert.match(resourceForm, /useUnsavedChanges/);
  assert.match(resourceForm, /focusInvalidField/);
  assert.match(resourceForm, /readMutationResponse/);
});

test("quick meeting creation guards rapid duplicate submits and dirty close", () => {
  assert.match(quickActions, /submissionLockRef/);
  assert.match(quickActions, /useUnsavedChanges/);
  assert.match(quickActions, /focusInvalidField/);
});

test("acceptance-critical modal flows share pending and dirty-state patterns", () => {
  for (const flow of [participants, tasks, decisions, members]) {
    assert.match(flow, /useMutationFeedback/);
    assert.match(flow, /MutationFeedback/);
    assert.match(flow, /readMutationResponse/);
  }
  for (const flow of [participants, tasks, decisions, members]) {
    assert.match(flow, /useUnsavedChanges/);
  }
});

test("minutes autosave warns while local changes are not synchronized", () => {
  assert.match(autosave, /useUnsavedChanges\(hasUnsavedChanges\)/);
  assert.match(autosave, /hasUnsynchronizedAutosaveChanges/);
  assert.match(autosave, /hasUnsavedChanges,/);
  assert.match(
    autosaveState,
    /"saving",[\s\S]*"error",[\s\S]*"offline",[\s\S]*"pending",[\s\S]*"conflict"/,
  );
});

test("participant validation keeps partially completed external rows", () => {
  assert.match(participants, /hasExternalAttendeeInput\(attendee\)/);
  assert.match(participants, /originalIndex/);
  assert.match(participants, /remapExternalAttendeeFieldErrors/);
  assert.match(participants, /external\.flatMap\(\(_, index\)/);
  assert.match(participants, /externalAttendees\.\$\{index\}\.\$\{field\}/);
  assert.match(participants, /<FieldError/);
  assert.match(participants, /aria-invalid=\{Boolean/);
  assert.doesNotMatch(
    participants,
    /\.filter\(\(attendee\) => attendee\.name\.trim\(\)\)/,
  );
});

test("valid participant persistence remains connected through service and read-back", () => {
  assert.match(
    meetingService,
    /parsed\.externalAttendees\.map\([\s\S]*normalizeExternalAttendeeForPersistence/,
  );
  assert.match(meetingService, /replaceExternalAttendees/);
  assert.match(
    meetingRepository,
    /\.from\("meeting_external_attendees"\)[\s\S]*\.insert\(attendees\)[\s\S]*\.select\(\)/,
  );
  assert.match(
    meetingRepository,
    /listExternalAttendees[\s\S]*\.from\("meeting_external_attendees"\)[\s\S]*\.select\("\*"\)/,
  );
});

test("participant manager RLS permits the authorized write response and reload", () => {
  assert.match(
    participantRls,
    /meeting_external_attendees_select_member[\s\S]*is_committee_member\(committee_id\)[\s\S]*can_manage_committee\(committee_id\)/,
  );
  assert.match(
    participantRls,
    /meeting_attendees_select_member[\s\S]*is_committee_member\(committee_id\)[\s\S]*can_manage_committee\(committee_id\)/,
  );
});

test("participant flow uses correct Danish UTF-8 copy", () => {
  assert.match(participants, /Tilføj ekstern/);
  assert.match(participants, /Fraværende/);
  assert.doesNotMatch(participants, /Ã|â€“|â€™|�/);
});

test("participant API returns actionable fallback without leaking raw failures", () => {
  assert.match(
    participantRoute,
    /Deltagerne kunne ikke gemmes\. Genindlæs siden, og prøv igen\./,
  );
});

test("dirty navigation listeners are scoped and cleaned up", () => {
  assert.match(
    mutationHook,
    /if \(!dirty\) return;[\s\S]*document\.addEventListener\("click"/,
  );
  assert.match(
    mutationHook,
    /document\.removeEventListener\("click", guardInternalNavigation, true\)/,
  );
  assert.match(
    mutationHook,
    /document\.removeEventListener\([\s\S]*"pointerdown",[\s\S]*rememberFocusBeforeNavigation/,
  );
  assert.match(
    mutationHook,
    /window\.removeEventListener\("beforeunload", warnBeforeUnload\)/,
  );
  assert.match(
    mutationHook,
    /decision === "cancel"[\s\S]*event\.preventDefault\(\)/,
  );
  assert.match(
    mutationHook,
    /decision === "cancel"[\s\S]*focusBeforeNavigation\?\.focus\(\)/,
  );
  assert.match(
    mutationHook,
    /if \(!shouldGuardNavigation\(intent\)\) return;[\s\S]*window\.confirm/,
  );
  assert.doesNotMatch(mutationHook, /stopPropagation|stopImmediatePropagation/);
});

test("submit locks remain local to mutation handlers", () => {
  assert.doesNotMatch(mutationHook, /submissionLockRef/);
  assert.match(quickActions, /submissionLockRef\.current/);
});

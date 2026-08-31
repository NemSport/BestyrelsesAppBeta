import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  annualWheelSearchParams,
  parseAnnualWheelState,
} from "../../src/lib/annual-wheel-state.ts";
import {
  annualWheelTemplateSyncDecision,
  buildAnnualWheelTemplateCopies,
  canEditAnnualWheelEvent,
} from "../../src/lib/annual-wheel.ts";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const [
  annualWheel,
  service,
  repository,
  policies,
  eventPdf,
  overviewPdf,
  recurringTemplateBackfill,
] =
  await Promise.all([
    source("../../src/components/annual-wheel/annual-wheel.tsx"),
    source("../../src/services/annual-wheel-service.ts"),
    source("../../src/repositories/annual-wheel-repository.ts"),
    source(
      "../../supabase/migrations/202606150003_annual_wheel_foundation.sql",
    ),
    source("../../src/lib/annual-wheel-pdf.ts"),
    source("../../src/lib/annual-wheel-overview-pdf.ts"),
    source(
      "../../scripts/backfills/20260809_backfill_recurring_annual_wheel_task_templates.sql",
    ),
  ]);

test("URL state validates view, month and kind and restores filters", () => {
  assert.deepEqual(
    parseAnnualWheelState(
      new URLSearchParams(
        "view=quarter&month=7&committeeId=c1&responsible=u1&kind=task",
      ),
      "",
      0,
    ),
    {
      view: "quarter",
      focusMonth: 6,
      committeeId: "c1",
      responsibleId: "u1",
      kind: "task",
    },
  );

  assert.deepEqual(
    parseAnnualWheelState(
      new URLSearchParams("view=grid&month=20&kind=private"),
      "c2",
      4,
    ),
    {
      view: "quarter",
      focusMonth: 4,
      committeeId: "c2",
      responsibleId: "",
      kind: "",
    },
  );
});

test("URL serialization preserves year and omits defaults", () => {
  const params = annualWheelSearchParams(
    new URLSearchParams("year=2027&stale=kept"),
    {
      view: "month",
      focusMonth: 10,
      committeeId: "c1",
      responsibleId: "u1",
      kind: "activity",
    },
  );
  assert.equal(
    params.toString(),
    "year=2027&stale=kept&view=month&month=11&committeeId=c1&responsible=u1&kind=activity",
  );

  assert.equal(
    annualWheelSearchParams(
      params,
      {
        view: "year",
        focusMonth: 0,
        committeeId: "c1",
        responsibleId: "",
        kind: "",
      },
      "c1",
    ).toString(),
    "year=2027&stale=kept&view=year",
  );
});

test("capability matrix distinguishes organization and committee writes", () => {
  assert.equal(canEditAnnualWheelEvent(false, [], null), false);
  assert.equal(canEditAnnualWheelEvent(false, [], "committee-1"), false);
  assert.equal(
    canEditAnnualWheelEvent(false, ["committee-1"], "committee-1"),
    true,
  );
  assert.equal(
    canEditAnnualWheelEvent(false, ["committee-1"], "committee-2"),
    false,
  );
  assert.equal(canEditAnnualWheelEvent(true, [], null), true);
  assert.equal(
    canEditAnnualWheelEvent(true, ["committee-1"], "committee-1"),
    true,
  );
});

test("recurrence template sync is conservative and idempotent", () => {
  const first = {
    title: "Gennemgang af bilag",
    description: "Kontrollér materialet",
    suggested_responsible_user_id: "user-1",
    deadline_anchor: "start",
    deadline_offset_days: 5,
    sort_order: 0,
  };
  const second = {
    title: "Fremsendelse til revisor",
    description: "Send den endelige pakke",
    suggested_responsible_user_id: null,
    deadline_anchor: "end",
    deadline_offset_days: -2,
    sort_order: 1,
  };

  assert.equal(annualWheelTemplateSyncDecision([first, second], []), "copy");
  assert.equal(
    annualWheelTemplateSyncDecision(
      [first, second],
      [{ ...first }, { ...second }],
    ),
    "unchanged",
  );
  assert.equal(
    annualWheelTemplateSyncDecision([first, second], [{ ...first }]),
    "manual_review",
  );
  assert.equal(
    annualWheelTemplateSyncDecision(
      [first, second],
      [{ ...first, deadline_offset_days: 6 }, { ...second }],
    ),
    "manual_review",
  );
  assert.equal(annualWheelTemplateSyncDecision([], []), "unchanged");

  const copies = buildAnnualWheelTemplateCopies([first, second], {
    organizationId: "organization-1",
    eventId: "event-2027",
    userId: "user-2",
  });
  assert.equal(copies.length, 2);
  assert.deepEqual(
    copies.map((copy) => ({
      eventId: copy.annual_wheel_event_id,
      anchor: copy.deadline_anchor,
      offset: copy.deadline_offset_days,
    })),
    [
      { eventId: "event-2027", anchor: "start", offset: 5 },
      { eventId: "event-2027", anchor: "end", offset: -2 },
    ],
  );
  assert.ok(copies.every((copy) => !("id" in copy)));
  assert.ok(copies.every((copy) => !("annual_wheel_task_template_id" in copy)));
});

test("mobile cards expose scope, responsibility, status and wrapping without horizontal document scroll", () => {
  assert.match(annualWheel, /\{scopeLabel\} · \{responsibleLabel\}/);
  assert.match(annualWheel, /eventStatusLabels\[item\.event\.status\]/);
  assert.match(annualWheel, /break-words text-sm font-medium/);
  assert.match(annualWheel, /grid-cols-1/);
  assert.doesNotMatch(annualWheel, /overflow-x-auto/);
});

test("period and filter controls publish URL state, result count, reset and distinct empty states", () => {
  assert.match(annualWheel, /replaceAnnualWheelState/);
  assert.match(annualWheel, /router\.replace/);
  assert.match(annualWheel, /aria-pressed=\{view === mode\}/);
  assert.match(annualWheel, /aria-live="polite"/);
  assert.match(
    annualWheel,
    /item\.kind !== "meeting" && !itemIsClosed\(item\)/,
  );
  assert.match(annualWheel, /Nulstil filtre/);
  assert.match(annualWheel, /Ingen resultater med de valgte filtre/);
  assert.match(annualWheel, /Perioden er tom/);
  assert.match(annualWheel, /yearHref\(data\.year - 1\)/);
});

test("V2 keeps all views purposeful and exposes stable navigation and secondary exports", () => {
  assert.match(annualWheel, /monthNames\.map\(\(name, month\) =>/);
  assert.match(annualWheel, /view === "quarter" \? "lg:grid-cols-3"/);
  assert.match(
    annualWheel,
    /replaceAnnualWheelState\(\{ view: "month", focusMonth: month \}\)/,
  );
  assert.match(annualWheel, /view === "month" \? "detail" : "card"/);
  assert.match(annualWheel, /Kræver opmærksomhed/);
  assert.match(annualWheel, /<ActionMenu/);
  assert.match(annualWheel, /Download overblik som PDF/);
  assert.match(annualWheel, /Download årshjul som PDF/);
  assert.match(annualWheel, /\+ \{hiddenCount\} flere/);
});

test("attention summary precedes the quieter AI helper and calendar without changing its counts", () => {
  const yearStripIndex = annualWheel.indexOf('aria-label="Året i overblik"');
  const attentionIndex = annualWheel.indexOf("Kræver opmærksomhed");
  const aiIndex = annualWheel.indexOf("Find mangler i årets plan");
  const calendarIndex = annualWheel.indexOf('view === "year" ? (');

  assert.ok(yearStripIndex < attentionIndex);
  assert.ok(attentionIndex < aiIndex);
  assert.ok(aiIndex < calendarIndex);
  assert.match(annualWheel, /attentionCounts\.overdue/);
  assert.match(annualWheel, /attentionCounts\.unassigned/);
  assert.match(annualWheel, /attentionCounts\.next30Days/);
  assert.match(annualWheel, /lg:py-2/);
  assert.match(annualWheel, /bg-subtle\/35/);
});

test("write controls follow the concrete event scope and use shared mutation feedback", () => {
  assert.match(annualWheel, /eventCanEdit\(draftEvent\)/);
  assert.match(annualWheel, /\{canEdit \? \(/);
  assert.match(annualWheel, /currentEvent && canActivate/);
  assert.match(annualWheel, /useMutationFeedback/);
  assert.match(annualWheel, /useUnsavedChanges/);
  assert.match(annualWheel, /readMutationResponse/);
  assert.match(annualWheel, /MutationFeedback feedback=\{mutation\.feedback\}/);
  assert.match(annualWheel, /aria-invalid=\{Boolean\(fieldErrors\.title\)\}/);
});

test("updates copy templates only to safe future occurrences and never copy activated tasks", () => {
  assert.match(repository, /findFutureOccurrences/);
  assert.match(repository, /\.eq\("series_id", seriesId\)/);
  assert.match(repository, /\.gt\("occurrence_index", occurrenceIndex\)/);
  assert.match(service, /syncTaskTemplatesToFutureOccurrences/);
  assert.match(service, /annualWheelTemplateSyncDecision/);
  assert.match(service, /decision === "manual_review"/);
  assert.match(service, /decision === "unchanged"/);
  assert.match(service, /buildAnnualWheelTemplateCopies/);
  const syncMethod = service.match(
    /private async syncTaskTemplatesToFutureOccurrences[\s\S]*?private async saveKeyPeople/,
  )?.[0];
  assert.ok(syncMethod);
  assert.doesNotMatch(syncMethod, /findActivatedTasks|createActivatedTasks/);
});

test("duplicate activity reuses create mode without recurrence or template identities", () => {
  assert.match(annualWheel, /function duplicateDraftFromEvent/);
  assert.match(annualWheel, /status: "planned"/);
  assert.match(annualWheel, /taskTemplates: event\.taskTemplates\.map/);
  assert.match(annualWheel, /deadlineAnchor: template\.deadline_anchor/);
  assert.match(
    annualWheel,
    /deadlineOffsetDays: template\.deadline_offset_days/,
  );
  assert.match(annualWheel, /onDuplicate=\{openDuplicate\}/);
  assert.match(annualWheel, /Duplikér aktivitet/);
  assert.match(annualWheel, /\{canEdit \? \([\s\S]*Duplikér aktivitet/);
  assert.match(annualWheel, /draft\.id[\s\S]*PATCH[\s\S]*POST/);
  assert.match(service, /const seriesId = crypto\.randomUUID\(\)/);
});

test("duplicate action is exposed in year, quarter, month and detail rendering", () => {
  const timelineRenderer = annualWheel.match(
    /function renderTimelineItem[\s\S]*?function renderMonthList/,
  )?.[0];
  assert.ok(timelineRenderer);
  assert.match(timelineRenderer, /const canDuplicate = eventCanEdit\(item\.event\)/);
  assert.match(timelineRenderer, /<ActionMenu/);
  assert.match(timelineRenderer, /ariaLabel=\{`Handlinger for \$\{item\.title\}`\}/);
  assert.match(timelineRenderer, /Duplikér aktivitet/);
  assert.match(timelineRenderer, /openDuplicate\(item\.event\)/);
  assert.match(timelineRenderer, /<AppIcon name="duplicate" size=\{16\} \/>/);

  assert.match(annualWheel, /renderMonthList\(\[\], activities, "card", 2\)/);
  assert.match(annualWheel, /view === "month" \? "detail" : "card"/);
  assert.match(annualWheel, /onDuplicate=\{openDuplicate\}/);
  assert.match(annualWheel, /onDuplicate=\{\(\) => onDuplicate\(currentEvent\)\}/);
  assert.match(annualWheel, /\{canEdit \? \([\s\S]*Duplikér aktivitet/);
});

test("approved recurring-template backfill is transactional, guarded and target-limited", () => {
  assert.match(recurringTemplateBackfill, /^begin;/);
  assert.match(recurringTemplateBackfill, /isolation level serializable/);
  assert.match(
    recurringTemplateBackfill,
    /lock table public\.annual_wheel_task_templates in share row exclusive mode/,
  );
  assert.match(recurringTemplateBackfill, /for update/);
  assert.match(recurringTemplateBackfill, /active_target_count = 0/);
  assert.match(recurringTemplateBackfill, /except all/);
  assert.match(recurringTemplateBackfill, /gen_random_uuid\(\)/);
  assert.match(recurringTemplateBackfill, /73547de5-a478-4bd2-b0ae-de34bccae08e/);
  assert.match(recurringTemplateBackfill, /3e925f44-e82c-4159-ab4e-54a176fbc2e0/);
  assert.match(recurringTemplateBackfill, /36ffa7d9-e61b-4d3a-a415-695a2ab0f844/);
  assert.match(recurringTemplateBackfill, /1888861d-3a9f-4756-990c-82be3f4007aa/);
  assert.doesNotMatch(recurringTemplateBackfill, /insert into public\.tasks/);
  assert.match(recurringTemplateBackfill, /commit;\s*$/);
});

test("service, repository and RLS independently retain scope and actor enforcement", () => {
  assert.match(service, /requireAgendaItemEditor/);
  assert.match(service, /requireOrganizationAdmin/);
  assert.match(service, /created_by: user\.id/);
  assert.match(service, /updated_by: user\.id/);
  assert.match(repository, /\.eq\("organization_id", organizationId\)/);
  assert.match(
    policies,
    /committee_id is null and public\.is_organization_admin/,
  );
  assert.match(
    policies,
    /committee_id is not null and public\.can_edit_agenda_item/,
  );
  assert.match(policies, /created_by = auth\.uid\(\)/);
  assert.match(policies, /updated_by = auth\.uid\(\)/);
});

test("existing PDFs retain scope, period and status information", () => {
  assert.match(eventPdf, /label: "Organisation"/);
  assert.match(eventPdf, /label: "Udvalg"/);
  assert.match(eventPdf, /label: "Periode"/);
  assert.match(eventPdf, /label: "Status"/);
  assert.match(overviewPdf, /Udvalg \/ kategori/);
  assert.match(overviewPdf, /Hele organisationen/);
  assert.match(overviewPdf, /eventStatusLabels\[event\.status\]/);
});

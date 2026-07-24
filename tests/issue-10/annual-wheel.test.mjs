import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  annualWheelSearchParams,
  parseAnnualWheelState,
} from "../../src/lib/annual-wheel-state.ts";
import { canEditAnnualWheelEvent } from "../../src/lib/annual-wheel.ts";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const [annualWheel, service, repository, policies, eventPdf, overviewPdf] =
  await Promise.all([
    source("../../src/components/annual-wheel/annual-wheel.tsx"),
    source("../../src/services/annual-wheel-service.ts"),
    source("../../src/repositories/annual-wheel-repository.ts"),
    source(
      "../../supabase/migrations/202606150003_annual_wheel_foundation.sql",
    ),
    source("../../src/lib/annual-wheel-pdf.ts"),
    source("../../src/lib/annual-wheel-overview-pdf.ts"),
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
      view: "year",
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
    "year=2027&stale=kept",
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

test("mobile cards expose scope, responsibility, status and wrapping without horizontal document scroll", () => {
  assert.match(annualWheel, /StatusBadge tone="neutral">\{scopeLabel\}/);
  assert.match(annualWheel, /Ansvarlig: \{responsibleLabel\}/);
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
    /item\.kind !== "meeting" &&\s*visibleMonths\.includes/,
  );
  assert.match(annualWheel, /Nulstil filtre/);
  assert.match(annualWheel, /Ingen resultater med de valgte filtre/);
  assert.match(annualWheel, /Perioden er tom/);
  assert.match(annualWheel, /yearHref\(data\.year - 1\)/);
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

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  decisionRegisterSearchParams,
  emptyDecisionFilters,
  parseDecisionRegisterState,
} from "../../src/lib/decision-register-state.ts";
import { getMeetingCapabilities } from "../../src/lib/meeting-capabilities.ts";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const [
  register,
  createModal,
  agendaPage,
  decisionService,
  decisionRepository,
  decisionPolicy,
  agendaContextPolicy,
  validation,
] = await Promise.all([
  source("../../src/components/decisions/decision-register.tsx"),
  source("../../src/components/decisions/decision-create-modal.tsx"),
  source(
    "../../src/app/(app)/organizations/[organizationId]/committees/[committeeId]/agenda-items/[agendaItemId]/page.tsx",
  ),
  source("../../src/services/decision-service.ts"),
  source("../../src/repositories/decision-repository.ts"),
  source(
    "../../supabase/migrations/202606130002_decision_register_foundation.sql",
  ),
  source(
    "../../supabase/migrations/202607240001_require_decision_agenda_context.sql",
  ),
  source("../../src/lib/validation.ts"),
]);

test("URL state validates controlled values and restores all filters", () => {
  const parsed = parseDecisionRegisterState(
    new URLSearchParams(
      "q=budget&status=waiting&committee=c1&responsible=u1&meeting=m1&category=Drift&decisionFrom=2026-01-01&decisionTo=2026-02-01&deadlineFrom=2026-03-01&deadlineTo=2026-04-01&archived=1&sort=status",
    ),
  );

  assert.deepEqual(parsed, {
    search: "budget",
    status: "waiting",
    committeeId: "c1",
    responsibleUserId: "u1",
    meetingId: "m1",
    category: "Drift",
    decisionDateFrom: "2026-01-01",
    decisionDateTo: "2026-02-01",
    deadlineFrom: "2026-03-01",
    deadlineTo: "2026-04-01",
    showArchived: true,
    sort: "status",
  });

  const invalid = parseDecisionRegisterState(
    new URLSearchParams("status=unknown&sort=random"),
  );
  assert.equal(invalid.status, "");
  assert.equal(invalid.sort, "decision_date_desc");
});

test("serialization omits defaults and preserves unrelated deep-link state", () => {
  const filters = {
    ...emptyDecisionFilters(),
    committeeId: "committee-1",
    status: "waiting",
    showArchived: true,
  };
  const params = decisionRegisterSearchParams(
    new URLSearchParams("focus=decision-1&q=stale&sort=status"),
    filters,
  );

  assert.equal(
    params.toString(),
    "focus=decision-1&status=waiting&committee=committee-1&archived=1",
  );
  assert.equal(
    decisionRegisterSearchParams(params, emptyDecisionFilters()).toString(),
    "focus=decision-1",
  );
});

test("register exposes primary filters, chips, results, reset, and distinct empty states", () => {
  assert.match(register, /htmlFor="decision-search"/);
  assert.match(register, /htmlFor="decision-status-filter"/);
  assert.match(register, /htmlFor="decision-committee-filter"/);
  assert.match(register, /Avancerede filtre/);
  assert.match(register, /activeFilterLabels\.map/);
  assert.match(register, /Nulstil alle filtre/);
  assert.match(register, /aria-live="polite"/);
  assert.match(register, /decisions\.length && hasActiveFilters/);
  assert.match(register, /Ingen beslutninger matcher de valgte filtre/);
  assert.match(register, /Der er endnu ikke registreret beslutninger/);
  assert.match(register, /action=\{/);
  assert.match(register, /router\.replace/);
  assert.match(register, /scroll: false/);
});

test("creation is agenda-item first in register and agenda-item workspace", () => {
  assert.match(register, />Opret fra dagsordenspunkt</);
  assert.match(register, /Vælg dagsordenspunkt/);
  assert.match(
    register,
    /Beslutningen gemmes som en del af dette punkts historik/,
  );
  assert.match(register, /if \(!draft\.id && !draft\.agendaItemId\)/);
  assert.match(agendaPage, /DecisionCreateModal/);
  assert.match(agendaPage, /initialAgendaItemId=\{item\.id\}/);
  assert.match(agendaPage, /Opret beslutning fra dette punkt/);
  assert.match(createModal, /if \(!agendaItemId\)/);
  assert.match(createModal, /agendaItemId,/);
});

test("create validation and PostgreSQL reject a missing agenda context without rewriting history", () => {
  assert.match(validation, /const decisionFieldsSchema = z\.object/);
  assert.match(
    validation,
    /decisionInputSchema = decisionFieldsSchema\.extend\(\{\s*agendaItemId: z/,
  );
  assert.match(
    validation,
    /decisionUpdateSchema = decisionFieldsSchema\.extend\(\{/,
  );
  assert.match(validation, /Dagsordenspunkt skal vælges/);
  assert.match(agendaContextPolicy, /before insert on public\.decisions/);
  assert.match(agendaContextPolicy, /new\.agenda_item_id is null/);
  assert.doesNotMatch(agendaContextPolicy, /alter column agenda_item_id/);
});

test("viewer is read-only while agenda-item editors retain create and edit actions", () => {
  const viewer = getMeetingCapabilities("viewer", "viewer");
  const member = getMeetingCapabilities("member", "member");
  const chair = getMeetingCapabilities("member", "chair");
  const admin = getMeetingCapabilities("admin", null);

  assert.equal(viewer.editDecisions, false);
  assert.equal(member.editDecisions, true);
  assert.equal(chair.editDecisions, true);
  assert.equal(admin.editDecisions, true);
  assert.match(register, /\{canCreate \? \(/);
  assert.doesNotMatch(register, /disabled=\{!canCreate\}/);
  assert.match(register, /\{canEdit \? \(/);
});

test("decision mutations use shared feedback, dirty-state, and field focus", () => {
  assert.match(register, /useMutationFeedback/);
  assert.match(register, /useUnsavedChanges/);
  assert.match(register, /JSON\.stringify\(draft\)/);
  assert.match(register, /readMutationResponse/);
  assert.match(register, /focusInvalidField/);
  assert.match(register, /MutationFeedback feedback=\{mutation\.feedback\}/);
  assert.match(
    register,
    /aria-invalid=\{Boolean\(fieldErrors\.agendaItemId\)\}/,
  );
  assert.match(createModal, /useMutationFeedback/);
  assert.match(createModal, /useUnsavedChanges/);
});

test("service, repository, and RLS retain tenant scope, editor checks, and actor fields", () => {
  assert.match(decisionService, /requireOrganizationMember/);
  assert.match(decisionService, /requireAgendaItemEditor/);
  assert.match(decisionService, /requireValidReferences/);
  assert.match(
    decisionService,
    /agendaItem\.organization_id !== input\.organizationId/,
  );
  assert.match(
    decisionService,
    /agendaItem\.committee_id !== input\.committeeId/,
  );
  assert.match(
    decisionService,
    /parsed\.agendaItemId \?\? decision\.agenda_item_id \?\? null/,
  );
  assert.match(decisionService, /created_by: user\.id/);
  assert.match(decisionService, /updated_by: user\.id/);
  assert.match(decisionRepository, /\.eq\("organization_id", organizationId\)/);
  assert.match(decisionPolicy, /create policy decisions_select_member/);
  assert.match(decisionPolicy, /create policy decisions_insert_editor/);
  assert.match(decisionPolicy, /public\.can_edit_agenda_item\(committee_id\)/);
  assert.match(decisionPolicy, /created_by = auth\.uid\(\)/);
  assert.match(decisionPolicy, /updated_by = auth\.uid\(\)/);
});

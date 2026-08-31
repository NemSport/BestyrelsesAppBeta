import assert from "node:assert/strict";
import test from "node:test";

import { deriveStakeholderActions } from "../../src/lib/actions";
import { getStakeholderCapabilities } from "../../src/lib/stakeholder-capabilities";
import { calculateStakeholderKpis } from "../../src/lib/stakeholders";
import { stakeholderContractInputSchema } from "../../src/lib/validation";
import type {
  Stakeholder,
  StakeholderContract,
  StakeholderListItem,
  StakeholderPipelineEntry,
} from "../../src/types/stakeholders";

const organizationId = "11111111-1111-4111-8111-111111111111";
const otherOrganizationId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const stakeholderId = "44444444-4444-4444-8444-444444444444";
const contractId = "55555555-5555-4555-8555-555555555555";
const now = new Date("2026-08-25T10:00:00.000Z");

function stakeholder(overrides: Partial<Stakeholder> = {}): Stakeholder {
  return {
    id: stakeholderId,
    organization_id: organizationId,
    name: "SuperBrugsen Vorbasse",
    stakeholder_type: "sponsor",
    relationship_status: "active",
    internal_owner_user_id: userId,
    website: null,
    phone: null,
    email: null,
    cvr_number: null,
    address_line: null,
    postal_code: null,
    city: null,
    country: "Danmark",
    notes: null,
    next_follow_up_at: null,
    next_follow_up_note: null,
    archived_at: null,
    created_by: userId,
    updated_by: userId,
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

function contract(
  overrides: Partial<StakeholderContract> = {},
): StakeholderContract {
  return {
    id: contractId,
    organization_id: organizationId,
    stakeholder_id: stakeholderId,
    title: "Sponsoraftale 2026",
    status: "active",
    contract_value: 50000,
    annual_value: 25000,
    currency: "DKK",
    start_date: "2026-01-01",
    end_date: "2026-09-20",
    notice_deadline: "2026-08-28",
    renewal_deadline: "2026-09-01",
    auto_renew: false,
    notes: null,
    archived_at: null,
    created_by: userId,
    updated_by: userId,
    created_at: "2026-01-01T10:00:00.000Z",
    updated_at: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

function pipeline(
  overrides: Partial<StakeholderPipelineEntry> = {},
): StakeholderPipelineEntry {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    organization_id: organizationId,
    stakeholder_id: stakeholderId,
    pipeline_type: "sponsor",
    stage: "dialogue",
    internal_owner_user_id: userId,
    estimated_value: 25000,
    currency: "DKK",
    next_follow_up_at: "2026-08-24T10:00:00.000Z",
    next_follow_up_note: "Ring om tilbuddet",
    last_contact_at: null,
    lost_reason: null,
    closed_at: null,
    created_by: userId,
    updated_by: userId,
    created_at: "2026-08-01T10:00:00.000Z",
    updated_at: "2026-08-20T10:00:00.000Z",
    ...overrides,
  };
}

function listItem(
  source: Stakeholder,
  overrides: Partial<StakeholderListItem> = {},
): StakeholderListItem {
  return {
    ...source,
    ownerName: "Mathias Jensen",
    primaryContact: null,
    activeAnnualValue: 25000,
    activeContract: contract(),
    pipelineEntry: pipeline(),
    nextActionAt: "2026-08-24T10:00:00.000Z",
    nextActionLabel: "Ring om tilbuddet",
    requiresFollowUp: true,
    overdueFollowUp: true,
    expiringSoon: true,
    ...overrides,
  };
}

test("capabilities keep viewers read-only and reserve stakeholder archive for admins", () => {
  assert.deepEqual(getStakeholderCapabilities("viewer"), {
    viewStakeholders: true,
    createStakeholders: false,
    updateStakeholders: false,
    archiveStakeholders: false,
    manageContacts: false,
    manageContracts: false,
    managePipeline: false,
    addActivities: false,
  });
  assert.equal(getStakeholderCapabilities("member").manageContracts, true);
  assert.equal(getStakeholderCapabilities("member").archiveStakeholders, false);
  assert.equal(getStakeholderCapabilities("admin").archiveStakeholders, true);
});

test("contract validation accepts decimal values and rejects invalid date ranges", () => {
  const valid = stakeholderContractInputSchema.parse({
    organizationId,
    stakeholderId,
    title: " Sponsoraftale 2026 ",
    status: "active",
    contractValue: 50000.5,
    annualValue: 25000.25,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    noticeDeadline: "2026-10-01",
    renewalDeadline: "2026-11-01",
  });
  assert.equal(valid.title, "Sponsoraftale 2026");
  assert.equal(valid.currency, "DKK");
  assert.equal(valid.annualValue, 25000.25);
  assert.equal(
    stakeholderContractInputSchema.safeParse({
      ...valid,
      startDate: "2026-12-31",
      endDate: "2026-01-01",
    }).success,
    false,
  );
  assert.equal(
    stakeholderContractInputSchema.safeParse({ ...valid, annualValue: -1 })
      .success,
    false,
  );
});

test("KPI calculation counts active sponsors, current contract values and 90-day expiry deterministically", () => {
  const sponsor = stakeholder();
  const former = stakeholder({
    id: "77777777-7777-4777-8777-777777777777",
    relationship_status: "ended",
  });
  const active = contract();
  const historical = contract({
    id: "88888888-8888-4888-8888-888888888888",
    status: "expired",
    annual_value: 999999,
    end_date: "2025-12-31",
  });
  const kpis = calculateStakeholderKpis({
    stakeholders: [sponsor, former],
    contracts: [active, historical],
    pipelineEntries: [
      pipeline(),
      pipeline({
        id: "99999999-9999-4999-8999-999999999999",
        closed_at: now.toISOString(),
        stage: "lost",
      }),
    ],
    items: [listItem(sponsor)],
    now,
  });
  assert.deepEqual(kpis, {
    activeSponsors: 1,
    annualContractValue: 25000,
    expiringSoon: 1,
    contactDue: 1,
    activeLeads: 1,
    missingFollowUp: 1,
  });
});

test("contract deadlines derive one prioritized action and respect owner and organization visibility", () => {
  const sources = {
    stakeholders: [stakeholder()],
    contracts: [contract()],
    pipelineEntries: [],
  };
  const actions = deriveStakeholderActions({
    organizationId,
    userId,
    sources,
    now,
  });
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, "stakeholder_contract_notice");
  assert.match(
    actions[0].href,
    new RegExp(`/organizations/${organizationId}/stakeholders/`),
  );
  assert.deepEqual(
    deriveStakeholderActions({
      organizationId,
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      sources,
      now,
    }),
    [],
  );
  assert.deepEqual(
    deriveStakeholderActions({
      organizationId: otherOrganizationId,
      userId,
      sources,
      now,
    }),
    [],
  );
});

test("pipeline follow-up suppresses a duplicate direct stakeholder follow-up", () => {
  const actions = deriveStakeholderActions({
    organizationId,
    userId,
    now,
    sources: {
      stakeholders: [
        stakeholder({
          next_follow_up_at: "2026-08-24T10:00:00.000Z",
          next_follow_up_note: "Direkte opfølgning",
        }),
      ],
      contracts: [],
      pipelineEntries: [pipeline()],
    },
  });
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, "stakeholder_pipeline_follow_up");
  assert.equal(actions[0].sourceType, "stakeholder_pipeline");
});

test("a changed follow-up deadline receives a new dismissible action identity", () => {
  const source = stakeholder({ next_follow_up_at: "2026-08-24T10:00:00.000Z" });
  const [first] = deriveStakeholderActions({
    organizationId,
    userId,
    now,
    sources: { stakeholders: [source], contracts: [], pipelineEntries: [] },
  });
  const [changed] = deriveStakeholderActions({
    organizationId,
    userId,
    now,
    sources: {
      stakeholders: [
        { ...source, next_follow_up_at: "2026-08-25T09:00:00.000Z" },
      ],
      contracts: [],
      pipelineEntries: [],
    },
  });
  assert.notEqual(first.key, changed.key);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getAgendaItemHref,
  getMeetingAgendaPointHref,
} from "../../src/lib/meeting-navigation.ts";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const [meetingWorkspace, historyComponent] = await Promise.all([
  source("../../src/components/meetings/meeting-minutes-section.tsx"),
  source("../../src/components/agenda-items/agenda-item-history-inline.tsx"),
]);

test("Åbn punkt targets the durable agenda-item detail page", () => {
  const href = getAgendaItemHref({
    organizationId: "org-1",
    committeeId: "committee-1",
    agendaItemId: "agenda-item-1",
  });

  assert.equal(
    href,
    "/organizations/org-1/committees/committee-1/agenda-items/agenda-item-1",
  );
  assert.doesNotMatch(href, /\/meetings\/|\/overview(?:\/|$)/);
});

test("the workspace renders a real navigation link and passes agendaItemId", () => {
  const openPointLink = meetingWorkspace.match(
    /<Link[\s\S]*?href=\{getAgendaItemHref\(\{[\s\S]*?>\s*Åbn punkt\s*<\/Link>/,
  )?.[0];
  assert.ok(openPointLink);
  assert.match(
    openPointLink,
    /organizationId,[\s\S]*committeeId,[\s\S]*agendaItemId: item\.id/,
  );
  assert.doesNotMatch(openPointLink, /onClick|preventDefault|occurrenceId/);
});

test("history Åbn i mødet reuses the canonical occurrence helper", () => {
  const href = getMeetingAgendaPointHref({
    organizationId: "org-1",
    committeeId: "committee-1",
    meetingId: "meeting-1",
    occurrenceId: "occurrence-1",
  });
  assert.equal(
    href,
    "/organizations/org-1/committees/committee-1/meetings/meeting-1#agenda-point-occurrence-1",
  );
  assert.match(historyComponent, /getMeetingAgendaPointHref\(\{/);
  assert.match(historyComponent, /meetingId: entry\.meetingId/);
  assert.match(historyComponent, /occurrenceId: entry\.occurrenceId/);
});

test("a transferred item opens its concrete source treatment", () => {
  assert.match(
    meetingWorkspace,
    /meetingId: incomingTransfer\.sourceMeeting\.id/,
  );
  assert.match(
    meetingWorkspace,
    /occurrenceId: incomingTransfer\.sourceOccurrence\?\.id/,
  );
});

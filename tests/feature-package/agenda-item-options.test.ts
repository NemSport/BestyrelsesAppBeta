import assert from "node:assert/strict";
import test from "node:test";

import {
  agendaItemFitsMeeting,
  getAgendaItemOptions,
  type AgendaMeetingOption,
} from "@/lib/agenda-item-options";

const firstItem = { id: "first-item", title: "Eventuelt" };
const secondItem = { id: "second-item", title: "Eventuelt" };
const recurringItem = { id: "recurring-item", title: "Økonomi" };
const unscheduledItem = { id: "unscheduled", title: "Budget" };
const items = [firstItem, secondItem, recurringItem, unscheduledItem];

function occurrence(position: number, item: typeof firstItem) {
  return {
    id: `occurrence-${item.id}`,
    position,
    agenda_items: { ...item, item_type: "discussion" as const },
  };
}

const meetings: AgendaMeetingOption[] = [
  {
    id: "first",
    title: "Stormøde",
    starts_at: "2026-08-28T16:00:00Z",
    agenda_item_occurrences: [
      occurrence(0, recurringItem),
      { id: "hidden", position: 1, agenda_items: null },
      occurrence(2, firstItem),
    ],
  },
  {
    id: "second",
    title: "Stormøde",
    starts_at: "2026-11-19T16:00:00Z",
    agenda_item_occurrences: [
      occurrence(0, secondItem),
      occurrence(1, recurringItem),
    ],
  },
];

test("only includes visible points from the selected meeting in agenda order", () => {
  assert.deepEqual(getAgendaItemOptions(items, meetings, "first"), [
    { id: recurringItem.id, label: "1. Økonomi" },
    { id: firstItem.id, label: "3. Eventuelt" },
  ]);
  assert.equal(agendaItemFitsMeeting(firstItem.id, meetings[1]), false);
  assert.equal(agendaItemFitsMeeting(recurringItem.id, meetings[1]), true);
});

test("labels repeated titles by meeting date and retains unscheduled points", () => {
  const options = getAgendaItemOptions(items, meetings, "");
  assert.match(options[0].label, /Stormøde · 28\. aug\. 2026/);
  assert.match(options[1].label, /Stormøde · 19\. nov\. 2026/);
  assert.match(options[2].label, /28\. aug\. 2026.*19\. nov\. 2026/);
  assert.equal(options[3].label, "Budget · Uden møde");
});

test("keeps an existing legacy association visible while editing", () => {
  const options = getAgendaItemOptions(items, meetings, "second", firstItem.id);
  assert.deepEqual(options.at(-1), {
    id: firstItem.id,
    label: "Eventuelt · Gemt tilknytning",
  });
});

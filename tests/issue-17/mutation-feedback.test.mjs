import assert from "node:assert/strict";
import test from "node:test";

import {
  firstFieldError,
  MutationRequestError,
  mutationFieldErrors,
  normalizeMutationFieldPath,
  readMutationResponse,
} from "../../src/lib/mutation-feedback.ts";
import {
  hasExternalAttendeeInput,
  remapExternalAttendeeFieldErrors,
} from "../../src/lib/meeting-participants.ts";
import { hasUnsynchronizedAutosaveChanges } from "../../src/lib/autosave-state.ts";
import {
  navigationDecision,
  shouldGuardNavigation,
} from "../../src/lib/navigation-guard.ts";

const cleanInternalClick = {
  dirty: false,
  defaultPrevented: false,
  button: 0,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  href: "https://app.example.test/organizations/org-1",
  currentHref: "https://app.example.test/organizations",
  target: "",
  download: false,
};

test("nested validation errors remain attached to the exact field", () => {
  const errors = mutationFieldErrors({
    validationErrors: [
      {
        path: ["externalAttendees", 0, "email"],
        message: "E-mail er ugyldig",
      },
      {
        path: ["externalAttendees", 1, "name"],
        message: "Navn skal udfyldes",
      },
    ],
  });

  assert.deepEqual(errors, {
    "externalAttendees.0.email": "E-mail er ugyldig",
    "externalAttendees.1.name": "Navn skal udfyldes",
  });
  assert.equal(
    firstFieldError(errors, [
      "externalAttendees.0.name",
      "externalAttendees.0.email",
    ]),
    "externalAttendees.0.email",
  );
});

test("bracket and dot paths normalize to the same attendee fields", () => {
  assert.equal(
    normalizeMutationFieldPath("externalAttendees[2].email"),
    "externalAttendees.2.email",
  );
  assert.equal(
    normalizeMutationFieldPath("externalAttendees[1]['name']"),
    "externalAttendees.1.name",
  );
});

test("flat validation errors remain available for existing API routes", () => {
  assert.deepEqual(
    mutationFieldErrors({
      fieldErrors: {
        title: ["Titel skal udfyldes"],
      },
    }),
    { title: "Titel skal udfyldes" },
  );
});

test("authorization failures use neutral actionable copy", async () => {
  const response = new Response(
    JSON.stringify({
      error: "Kun interne administratorer med policy X kan gøre dette.",
      code: "AUTHORIZATION_FAILED",
    }),
    { status: 403, headers: { "Content-Type": "application/json" } },
  );

  await assert.rejects(
    () => readMutationResponse(response, "Kunne ikke gemme."),
    (error) => {
      assert.ok(error instanceof MutationRequestError);
      assert.match(error.message, /Genindlæs siden/);
      assert.doesNotMatch(error.message, /policy|administratorer/);
      return true;
    },
  );
});

test("external attendee input is not silently discarded when name is missing", () => {
  assert.equal(
    hasExternalAttendeeInput({
      name: "",
      email: "ekstern@example.test",
      mobile: "",
      roleNote: "",
    }),
    true,
  );
  assert.equal(
    hasExternalAttendeeInput({
      name: " ",
      email: "",
      mobile: "",
      roleNote: "",
    }),
    false,
  );
});

test("nested attendee email and name errors map to their original rows", () => {
  assert.deepEqual(
    remapExternalAttendeeFieldErrors(
      {
        "externalAttendees.0.email": "E-mail er ugyldig",
        "externalAttendees.1.name": "Navn skal udfyldes",
      },
      [1, 3],
    ),
    {
      "externalAttendees.1.email": "E-mail er ugyldig",
      "externalAttendees.3.name": "Navn skal udfyldes",
    },
  );
});

test("attendee validation mapping preserves entered values", () => {
  const attendees = [
    { name: "", email: "", mobile: "", roleNote: "" },
    {
      name: "Ekstern person",
      email: "ugyldig",
      mobile: "12345678",
      roleNote: "Rådgiver",
    },
  ];
  const snapshot = structuredClone(attendees);

  remapExternalAttendeeFieldErrors(
    { "externalAttendees.0.email": "E-mail er ugyldig" },
    [1],
  );

  assert.deepEqual(attendees, snapshot);
});

test("local minutes changes and failed autosaves remain dirty", () => {
  const draft = { notes: "<p>Ny tekst</p>" };
  const saved = { notes: "<p>Gammel tekst</p>" };

  assert.equal(
    hasUnsynchronizedAutosaveChanges({
      enabled: true,
      currentSerialized: JSON.stringify(draft),
      lastSavedSerialized: JSON.stringify(saved),
      status: "idle",
      hasConflict: false,
    }),
    true,
  );
  assert.equal(
    hasUnsynchronizedAutosaveChanges({
      enabled: true,
      currentSerialized: JSON.stringify(draft),
      lastSavedSerialized: JSON.stringify(saved),
      status: "error",
      hasConflict: false,
    }),
    true,
  );
  assert.equal(draft.notes, "<p>Ny tekst</p>");
});

test("completed minutes autosave removes dirty state", () => {
  const savedDraft = JSON.stringify({ notes: "<p>Gemt tekst</p>" });
  assert.equal(
    hasUnsynchronizedAutosaveChanges({
      enabled: true,
      currentSerialized: savedDraft,
      lastSavedSerialized: savedDraft,
      status: "saved",
      hasConflict: false,
    }),
    false,
  );
});

test("clean navigation is never guarded", () => {
  assert.equal(shouldGuardNavigation(cleanInternalClick), false);
  assert.equal(navigationDecision(cleanInternalClick, false), "ignore");
});

test("dirty internal navigation allows leave and cancels stay", () => {
  const dirtyClick = { ...cleanInternalClick, dirty: true };
  const minutesText = "<p>Ugemt referattekst</p>";

  assert.equal(shouldGuardNavigation(dirtyClick), true);
  assert.equal(navigationDecision(dirtyClick, true), "allow");
  assert.equal(navigationDecision(dirtyClick, false), "cancel");
  assert.equal(minutesText, "<p>Ugemt referattekst</p>");
});

test("modified clicks and new-tab links bypass the dirty guard", () => {
  for (const intent of [
    { ...cleanInternalClick, dirty: true, ctrlKey: true },
    { ...cleanInternalClick, dirty: true, metaKey: true },
    { ...cleanInternalClick, dirty: true, target: "_blank" },
  ]) {
    assert.equal(shouldGuardNavigation(intent), false);
  }
});

test("external, download, and hash-only links are not globally prevented", () => {
  for (const intent of [
    {
      ...cleanInternalClick,
      dirty: true,
      href: "https://docs.example.test/help",
    },
    { ...cleanInternalClick, dirty: true, download: true },
    {
      ...cleanInternalClick,
      dirty: true,
      href: "https://app.example.test/organizations#details",
    },
  ]) {
    assert.equal(shouldGuardNavigation(intent), false);
  }
});

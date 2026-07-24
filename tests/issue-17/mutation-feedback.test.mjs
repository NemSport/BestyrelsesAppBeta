import assert from "node:assert/strict";
import test from "node:test";

import {
  firstFieldError,
  MutationRequestError,
  mutationFieldErrors,
  readMutationResponse,
} from "../../src/lib/mutation-feedback.ts";
import { hasExternalAttendeeInput } from "../../src/lib/meeting-participants.ts";
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

test("clean navigation is never guarded", () => {
  assert.equal(shouldGuardNavigation(cleanInternalClick), false);
  assert.equal(navigationDecision(cleanInternalClick, false), "ignore");
});

test("dirty internal navigation allows leave and cancels stay", () => {
  const dirtyClick = { ...cleanInternalClick, dirty: true };

  assert.equal(shouldGuardNavigation(dirtyClick), true);
  assert.equal(navigationDecision(dirtyClick, true), "allow");
  assert.equal(navigationDecision(dirtyClick, false), "cancel");
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

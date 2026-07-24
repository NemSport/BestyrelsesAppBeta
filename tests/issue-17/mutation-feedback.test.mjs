import assert from "node:assert/strict";
import test from "node:test";

import {
  firstFieldError,
  MutationRequestError,
  mutationFieldErrors,
  readMutationResponse,
} from "../../src/lib/mutation-feedback.ts";
import { hasExternalAttendeeInput } from "../../src/lib/meeting-participants.ts";

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

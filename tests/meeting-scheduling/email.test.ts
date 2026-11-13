import assert from "node:assert/strict";
import { test } from "node:test";
import {
  meetingDatePollEmailTemplate,
  meetingMaterialsEmailTemplate,
} from "../../src/lib/email-templates";

test("each invitation renders both choices using its own response URL", () => {
  const url = "https://example.test/meeting-response/recipient-token";
  const props = {
    organizationName: "Bestyrelsen",
    committeeName: "Udvalget",
    meetingTitle: "Møde",
    meetingDate: "24. november kl. 19.00",
    recipientName: "Peter",
    subject: "Indkaldelse",
    message: "",
    contentLabels: ["Dagsorden"],
    documentNames: [],
    personalTaskList: false,
    meetingUrl: "https://example.test/organizations/mode",
  };
  const invitation = meetingMaterialsEmailTemplate({
    ...props,
    invitationResponseUrl: url,
  });
  for (const body of [invitation.text, invitation.html]) {
    assert.ok(body.includes(url + "?answer=accepted"));
    assert.ok(body.includes(url + "?answer=declined"));
  }
  assert.doesNotMatch(
    meetingMaterialsEmailTemplate(props).html,
    /Svar på mødeindkaldelsen/,
  );
});

test("poll invitation keeps the personal ballot link and escapes the title", () => {
  const url = "https://example.test/meeting-vote/recipient-token";
  const message = meetingDatePollEmailTemplate("Udvalg <møde>", url);
  assert.ok(message.text.includes(url));
  assert.ok(message.html.includes(url));
  assert.ok(message.html.includes("Udvalg &lt;møde&gt;"));
});

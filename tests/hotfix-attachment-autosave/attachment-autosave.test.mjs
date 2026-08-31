import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

function uploadMethod(service) {
  return (
    service.match(
      /async uploadAttachment[\s\S]*?\n  async getAttachmentDownload/,
    )?.[0] ?? ""
  );
}

test("empty new meeting minutes get a minimal parent before upload", async () => {
  const service = uploadMethod(
    await read("src/services/meeting-minutes-service.ts"),
  );

  assert.match(service, /findMeetingMinutes\(input\.meetingId\)/);
  assert.match(
    service,
    /if \(!parentMinutes\)[\s\S]*createMeetingMinutes\(\{[\s\S]*minutes_text: ""[\s\S]*decisions: ""[\s\S]*status: "draft"/,
  );
  assert.ok(
    service.indexOf("createMeetingMinutes({") <
      service.indexOf("this.governance.upload(storagePath"),
  );
});

test("empty new agenda item minutes get their own minimal parent", async () => {
  const service = uploadMethod(
    await read("src/services/meeting-minutes-service.ts"),
  );

  assert.match(
    service,
    /input\.agendaItemId[\s\S]*findAgendaItemMinutes(?:ById)?/,
  );
  assert.match(
    service,
    /createAgendaItemMinutes\(\{[\s\S]*agenda_item_id: input\.agendaItemId[\s\S]*notes: ""[\s\S]*decision: ""[\s\S]*follow_up: ""[\s\S]*status: "not_started"/,
  );
  assert.match(service, /agenda_item_minutes_id: parentMinutes\.id/);
  assert.match(
    service,
    /if \(input\.agendaItemId\) \{[\s\S]*createAgendaItemMinutes\(\{[\s\S]*\} else \{[\s\S]*createMeetingMinutes\(\{/,
  );
  assert.match(
    service,
    /existing private Storage read policy[\s\S]*input\.agendaItemId[\s\S]*findMeetingMinutes\(input\.meetingId\)[\s\S]*createMeetingMinutes\(\{/,
  );
  assert.ok(
    service.indexOf("existing private Storage read policy") <
      service.indexOf("this.governance.upload(storagePath"),
  );
});

test("an existing parent is reused and no client-side minutes save is required", async () => {
  const attachments = await read(
    "src/components/meetings/minutes-governance.tsx",
  );
  const workspace = await read(
    "src/components/meetings/meeting-minutes-section.tsx",
  );
  const service = uploadMethod(
    await read("src/services/meeting-minutes-service.ts"),
  );

  assert.doesNotMatch(attachments, /ensureParent|saveNow/);
  assert.doesNotMatch(
    workspace,
    /meetingAutosave\.saveNow\(undefined, \{ force: true \}\)/,
  );
  assert.match(attachments, /if \(parentMinutesId\) formData\.set/);
  assert.match(service, /if \(!parentMinutes\) \{[\s\S]*createMeetingMinutes/);
});

test("parent failure happens before storage and upload cleanup stays intact", async () => {
  const service = uploadMethod(
    await read("src/services/meeting-minutes-service.ts"),
  );

  assert.ok(
    service.indexOf("if (!parentMinutes)") <
      service.indexOf("this.governance.upload(storagePath"),
  );
  assert.match(service, /ATTACHMENT_PARENT_REQUIRED/);
  assert.match(service, /if \(uploaded\)[\s\S]*removeUpload\(storagePath\)/);
});

test("parent creation remains behind existing authorization and RLS client", async () => {
  const service = uploadMethod(
    await read("src/services/meeting-minutes-service.ts"),
  );

  assert.match(service, /requireCommitteeMember/);
  assert.match(service, /const meeting = await this\.requireMeeting/);
  assert.ok(
    service.indexOf("requireCommitteeMember") <
      service.indexOf("createMeetingMinutes({"),
  );
});

test("upload result remains downloadable through the existing endpoint", async () => {
  const service = await read("src/services/meeting-minutes-service.ts");
  const downloadRoute = await read(
    "src/app/api/minutes-attachments/[attachmentId]/download/route.ts",
  );

  assert.match(service, /async getAttachmentDownload/);
  assert.match(downloadRoute, /getAttachmentDownload/);
});

test("agenda attachments load without requiring meeting minutes", async () => {
  const service = await read("src/services/meeting-minutes-service.ts");
  const workspaceLoad =
    service.match(
      /async get\(organizationId:[\s\S]*?\n  async getPreviousMeetingReference/,
    )?.[0] ?? "";

  assert.match(
    workspaceLoad,
    /this\.governance\.listAgendaItemAttachments\(meetingId\)/,
  );
  assert.doesNotMatch(
    workspaceLoad,
    /meetingMinutes\s*\?\s*await Promise\.all\([\s\S]*listAgendaItemAttachments/,
  );
  assert.match(
    workspaceLoad,
    /meetingMinutes[\s\S]*listMeetingAttachments[\s\S]*listAgendaItemAttachments\(meetingId\)/,
  );
});

test("successful upload is added to the visible list before refresh completes", async () => {
  const component = await read(
    "src/components/meetings/minutes-governance.tsx",
  );

  assert.match(
    component,
    /const \[visibleAttachments, setVisibleAttachments\] = useState\(attachments\)/,
  );
  assert.match(component, /attachment: \{[\s\S]*file_name: string/);
  assert.match(
    component,
    /setVisibleAttachments\(\(current\) =>[\s\S]*result\.attachment\.id[\s\S]*uploadedByName: "Dig"/,
  );
  assert.match(component, /visibleAttachments\.map\(\(attachment\) =>/);
  assert.match(component, /router\.refresh\(\)/);
});

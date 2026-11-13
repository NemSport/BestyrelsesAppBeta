import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../../public/sw.js", import.meta.url),
  "utf8",
);
const org = "00000000-0000-4000-8000-000000000001";
const thread = "00000000-0000-4000-8000-000000000002";
const path = `/organizations/${org}/bestie?samtale=${thread}`;
const api = `/api/organizations/${org}/bestie/${thread}`;
const version = "2026-11-13T10:00:00+00:00";

function serviceWorker({ fetch, showNotification, openWindow }) {
  const handlers = new Map();
  vm.runInNewContext(source, {
    URL,
    fetch,
    crypto: { randomUUID: () => thread },
    self: {
      location: { origin: "https://example.com" },
      addEventListener: (name, handler) => handlers.set(name, handler),
      clients: { matchAll: async () => [], openWindow },
      registration: { showNotification },
    },
  });
  return async (name, event) => {
    let promise;
    handlers.get(name)({
      ...event,
      waitUntil: (work) => {
        promise = work;
      },
    });
    await promise;
  };
}

function click(reply, data = { path, api, version }) {
  return {
    action: "reply",
    reply,
    notification: { data, tag: thread, close() {} },
  };
}

test("inline text replies are sent with the thread version and acknowledged", async () => {
  const requests = [];
  const shown = [];
  const dispatch = serviceWorker({
    fetch: async (url, request) => {
      requests.push([url, JSON.parse(request.body), request.credentials]);
      return {
        ok: true,
        json: async () => ({ thread: { pending: { reminder: "2026-12-01" } } }),
      };
    },
    showNotification: async (_title, details) => shown.push(details.body),
    openWindow: async () =>
      assert.fail("An inline reply should not need to open a tab."),
  });
  await dispatch("notificationclick", click("  Mind mig om det. "));
  assert.deepEqual(requests, [
    [api, { replyId: thread, message: "Mind mig om det.", version }, "include"],
  ]);
  assert.match(shown[0], /gemt.*godkende/);
});

test("a notification opens the correct composer when inline reply is unavailable", async () => {
  const urls = [];
  const dispatch = serviceWorker({
    fetch: async () => assert.fail("A text reply was not provided."),
    openWindow: async (url) => urls.push(url),
  });
  await dispatch("notificationclick", click(undefined));
  await dispatch(
    "notificationclick",
    click(undefined, { path: "https://other.example", api }),
  );
  assert.deepEqual(urls, [`https://example.com${path}`]);
});

test("push retries with a standard Reply action if the device rejects inline actions", async () => {
  const actions = [];
  const dispatch = serviceWorker({
    showNotification: async (_title, details) => {
      const action = details.actions[0];
      actions.push(action.title);
      if (action.type === "text")
        throw new Error("Inline actions are unsupported");
    },
  });
  await dispatch("push", {
    data: {
      json: () => ({ path, api, version, tag: thread, body: "Ny besked" }),
    },
  });
  assert.deepEqual(actions, ["Svar", "Svar"]);
});

test("email push opens a personal meeting response without sending a Bestie reply", async () => {
  const shown = [];
  const urls = [];
  const dispatch = serviceWorker({
    showNotification: async (title, details) => shown.push({ title, details }),
    fetch: async () => assert.fail("An email notification cannot reply to Bestie."),
    openWindow: async (url) => urls.push(url),
  });
  const responsePath = `/meeting-response/${thread}`;
  const data = { kind: "email", path: responsePath, tag: thread, body: "Mødeindkaldelse" };
  await dispatch("push", { data: { json: () => data } });
  assert.equal(shown[0].title, "BestyrelsesMate");
  assert.equal(shown[0].details.actions, undefined);
  await dispatch("notificationclick", click("Svar", { ...data, api }));
  await dispatch("notificationclick", click(undefined, { ...data, path: "//other.example" }));
  const approvalPath = `/organizations/${org}/committees/${org}/meetings/${thread}#minutes-approval`;
  await dispatch("notificationclick", click(undefined, { ...data, path: approvalPath }));
  assert.deepEqual(urls, [
    `https://example.com${responsePath}`,
    `https://example.com${approvalPath}`,
  ]);
});

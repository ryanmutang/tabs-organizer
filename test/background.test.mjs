import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const BACKGROUND_SCRIPT = new URL("../src/background.js", import.meta.url);
const NO_GROUP = -1;

test("organizeAll only groups ungrouped tabs and reuses existing domain groups", async () => {
  const chrome = createChromeMock({
    windows: [
      {
        id: 1,
        tabs: [
          tab(1, "https://example.com/a", 0),
          tab(2, "https://example.com/b", 1),
          tab(3, "https://single.test/", 2),
          tab(4, "https://grouped.test/a", 3, 100),
          tab(5, "https://grouped.test/b", 4),
        ],
      },
    ],
    groups: [{ id: 100, windowId: 1, title: "grouped.test", color: "blue" }],
  });
  const context = await loadBackground(chrome);

  const result = await context.organizeAllWindows();

  assert.equal(result.groupsCreated, 1);
  assert.equal(result.tabsGrouped, 3);
  assert.equal(result.tabsUngrouped, 0);
  assert.equal(result.emptyNewTabsRemoved, 0);
  assert.deepEqual(jsonValue(chrome.calls.group), [
    { tabIds: [1, 2] },
    { tabIds: [5], groupId: 100 },
  ]);
  assert.deepEqual(jsonValue(chrome.calls.ungroup), []);
  assert.equal(chrome.calls.update.length, 1);
  assert.equal(chrome.calls.update[0].groupId, 101);
  assert.equal(chrome.calls.update[0].details.title, "example.com");
});

test("organizeAll ungroups tabs when their group has only one tab left", async () => {
  const chrome = createChromeMock({
    windows: [
      {
        id: 1,
        tabs: [
          tab(1, "https://solo.test/a", 0, 100),
          tab(2, "https://pair.test/a", 1, 101),
          tab(3, "https://pair.test/b", 2, 101),
          tab(4, "https://fresh.test/a", 3),
          tab(5, "https://fresh.test/b", 4),
        ],
      },
    ],
    groups: [
      { id: 100, windowId: 1, title: "solo.test", color: "blue" },
      { id: 101, windowId: 1, title: "pair.test", color: "green" },
    ],
  });
  const context = await loadBackground(chrome);

  const result = await context.organizeAllWindows();

  assert.equal(result.groupsCreated, 1);
  assert.equal(result.tabsGrouped, 2);
  assert.equal(result.tabsUngrouped, 1);
  assert.deepEqual(jsonValue(chrome.calls.ungroup), [[1]]);
});

test("organizeAll removes empty new tabs when a window has other tabs", async () => {
  const chrome = createChromeMock({
    windows: [
      {
        id: 1,
        tabs: [
          tab(1, "chrome://newtab/", 0),
          tab(2, "edge://newtab/", 1),
          tab(3, "https://example.com/a", 2),
          tab(4, "https://example.com/b", 3),
        ],
      },
      {
        id: 2,
        tabs: [
          tab(5, "chrome://newtab/", 0),
          tab(6, "chrome://newtab/", 1),
        ],
      },
    ],
  });
  const context = await loadBackground(chrome);

  const result = await context.organizeAllWindows();

  assert.equal(result.emptyNewTabsRemoved, 3);
  assert.deepEqual(jsonValue(chrome.calls.remove), [[1, 2], [6]]);
  assert.deepEqual(
    chrome.windowsData[0].tabs.map((browserTab) => browserTab.id),
    [3, 4]
  );
  assert.deepEqual(
    chrome.windowsData[1].tabs.map((browserTab) => browserTab.id),
    [5]
  );
});

test("removeDuplicateTabs keeps one matching address and removes later duplicates", async () => {
  const chrome = createChromeMock({
    windows: [
      {
        id: 1,
        tabs: [
          tab(1, "https://example.com/page#one", 0),
          tab(2, "https://example.com/page#two", 1),
          tab(3, "https://example.com/page?x=1", 2),
          tab(4, "chrome://extensions/", 3),
        ],
      },
      {
        id: 2,
        tabs: [
          tab(5, "https://example.com/page#three", 0),
          tab(6, "https://other.test/page", 1),
          tab(7, "https://other.test/page", 2),
        ],
      },
    ],
  });
  const context = await loadBackground(chrome);

  const result = await context.removeDuplicateTabs();

  assert.equal(result.removedTabs, 3);
  assert.deepEqual(jsonValue(chrome.calls.remove), [[2, 5, 7]]);
});

test("autoGroupTab leaves first domain tab ungrouped and groups the second one", async () => {
  const chrome = createChromeMock({
    tabsById: new Map([
      [1, tab(1, "https://example.com/a", 0)],
      [2, tab(2, "https://example.com/b", 1)],
    ]),
    windows: [
      {
        id: 1,
        tabs: [
          tab(1, "https://example.com/a", 0),
          tab(2, "https://example.com/b", 1),
        ],
      },
    ],
  });
  const context = await loadBackground(chrome);

  await context.autoGroupTab(1);

  assert.deepEqual(jsonValue(chrome.calls.group), [{ tabIds: [1, 2] }]);
  assert.equal(chrome.calls.update[0].details.title, "example.com");
});

async function loadBackground(chrome) {
  const source = await readFile(BACKGROUND_SCRIPT, "utf8");
  const context = {
    chrome,
    console,
    URL,
    Map,
    Set,
    String,
    Boolean,
    globalThis: {},
  };
  context.globalThis = context;
  context.clearTimeout = () => {};
  context.setTimeout = () => 1;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "background.js" });
  return context;
}

function createChromeMock({ windows = [], groups = [], tabsById } = {}) {
  let nextGroupId = 101;
  const tabLookup = tabsById || new Map();

  for (const browserWindow of windows) {
    for (const browserTab of browserWindow.tabs || []) {
      browserTab.windowId = browserWindow.id;
      tabLookup.set(browserTab.id, browserTab);
    }
  }

  const calls = {
    group: [],
    remove: [],
    ungroup: [],
    update: [],
  };

  return {
    calls,
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener() {} },
    },
    storage: {
      sync: {
        async get(defaults) {
          return defaults;
        },
        async set() {},
      },
    },
    tabGroups: {
      TAB_GROUP_ID_NONE: NO_GROUP,
      async query({ windowId }) {
        return groups.filter((group) => group.windowId === windowId);
      },
      async update(groupId, details) {
        calls.update.push({ groupId, details });
        const existing = groups.find((group) => group.id === groupId);

        if (existing) {
          Object.assign(existing, details);
        }
      },
    },
    tabs: {
      onCreated: { addListener() {} },
      onUpdated: { addListener() {} },
      async get(tabId) {
        const browserTab = tabLookup.get(tabId);

        if (!browserTab) {
          throw new Error(`Missing tab ${tabId}`);
        }

        return browserTab;
      },
      async query({ windowId }) {
        const browserWindow = windows.find((item) => item.id === windowId);
        return browserWindow?.tabs || [];
      },
      async group(details) {
        calls.group.push(details);
        const tabIds = Array.isArray(details.tabIds)
          ? details.tabIds
          : [details.tabIds];

        if (details.groupId) {
          for (const tabId of tabIds) {
            const browserTab = tabLookup.get(tabId);

            if (browserTab) {
              browserTab.groupId = details.groupId;
            }
          }

          return details.groupId;
        }

        const groupId = nextGroupId;
        nextGroupId += 1;
        const firstTab = tabLookup.get(tabIds[0]);
        groups.push({
          id: groupId,
          windowId: firstTab?.windowId || 1,
          title: "",
          color: "grey",
        });

        for (const tabId of tabIds) {
          const browserTab = tabLookup.get(tabId);

          if (browserTab) {
            browserTab.groupId = groupId;
          }
        }

        return groupId;
      },
      async ungroup(tabIds) {
        const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
        calls.ungroup.push(ids);

        for (const tabId of ids) {
          const browserTab = tabLookup.get(tabId);

          if (browserTab) {
            browserTab.groupId = NO_GROUP;
          }
        }
      },
      async remove(tabIds) {
        const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
        calls.remove.push(ids);

        for (const tabId of ids) {
          tabLookup.delete(tabId);
        }

        for (const browserWindow of windows) {
          browserWindow.tabs = (browserWindow.tabs || []).filter(
            (browserTab) => !ids.includes(browserTab.id)
          );
        }
      },
    },
    windows: {
      async getAll() {
        return windows;
      },
    },
    windowsData: windows,
  };
}

function tab(id, url, index, groupId = NO_GROUP) {
  return {
    id,
    url,
    index,
    groupId,
    windowId: 1,
  };
}

function jsonValue(value) {
  return JSON.parse(JSON.stringify(value));
}

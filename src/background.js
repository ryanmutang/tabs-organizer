const DEFAULT_SETTINGS = {
  autoGroupEnabled: true,
  normalizeWww: true,
  groupNameMode: "full-host",
  excludedDomains: "",
};

const GROUP_COLORS = [
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange",
];

const pendingTabs = new Map();

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await chrome.storage.sync.set(settings);
});

chrome.tabs.onCreated.addListener((tab) => {
  scheduleAutoGroup(tab.id);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete" || changeInfo.url) {
    scheduleAutoGroup(tabId);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

async function handleMessage(message) {
  switch (message?.type) {
    case "GET_SETTINGS":
      return { settings: await getSettings() };
    case "SAVE_SETTINGS":
      await saveSettings(message.settings);
      return { settings: await getSettings() };
    case "ORGANIZE_ALL":
      return organizeAllWindows();
    case "REMOVE_DUPLICATES":
      return removeDuplicateTabs();
    default:
      throw new Error("Unknown message type.");
  }
}

function scheduleAutoGroup(tabId) {
  globalThis.clearTimeout(pendingTabs.get(tabId));
  const timeoutId = globalThis.setTimeout(async () => {
    pendingTabs.delete(tabId);

    try {
      await autoGroupTab(tabId);
    } catch (_error) {
      // Tabs often disappear while Chrome is still notifying extensions.
    }
  }, 600);

  pendingTabs.set(tabId, timeoutId);
}

async function autoGroupTab(tabId) {
  const settings = await getSettings();

  if (!settings.autoGroupEnabled) {
    return;
  }

  const tab = await chrome.tabs.get(tabId);
  const tabInfo = getTabInfo(tab, settings);

  if (!tabInfo || tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
    return;
  }

  const tabs = await chrome.tabs.query({ windowId: tab.windowId });
  const sameDomainUngroupedTabs = tabs.filter((candidate) => {
    if (candidate.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
      return false;
    }

    const candidateInfo = getTabInfo(candidate, settings);
    return candidateInfo?.groupKey === tabInfo.groupKey;
  });

  const existingGroup = await findMatchingGroup(tab.windowId, tabInfo.groupName);

  if (sameDomainUngroupedTabs.length < 2 && !existingGroup) {
    return;
  }

  const tabIds = sameDomainUngroupedTabs.map((candidate) => candidate.id);

  if (existingGroup) {
    await chrome.tabs.group({ tabIds, groupId: existingGroup.id });
    return;
  }

  const groupId = await chrome.tabs.group({ tabIds });
  await updateGroup(groupId, tabInfo.groupName);
}

async function organizeAllWindows() {
  const settings = await getSettings();
  const windows = await chrome.windows.getAll({ populate: true });
  let groupsCreated = 0;
  let tabsGrouped = 0;
  let tabsUngrouped = 0;
  let emptyNewTabsRemoved = 0;

  for (const browserWindow of windows) {
    emptyNewTabsRemoved += await removeEmptyNewTabs(browserWindow.tabs || []);

    const ungroupedByDomain = new Map();

    for (const tab of browserWindow.tabs || []) {
      if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
        continue;
      }

      const tabInfo = getTabInfo(tab, settings);

      if (!tabInfo) {
        continue;
      }

      const existing = ungroupedByDomain.get(tabInfo.groupKey) || {
        groupName: tabInfo.groupName,
        tabs: [],
      };

      existing.tabs.push(tab);
      ungroupedByDomain.set(tabInfo.groupKey, existing);
    }

    for (const domainGroup of ungroupedByDomain.values()) {
      const tabIds = domainGroup.tabs.map((tab) => tab.id);
      const existingGroup = await findMatchingGroup(
        browserWindow.id,
        domainGroup.groupName
      );

      if (domainGroup.tabs.length < 2 && !existingGroup) {
        continue;
      }

      if (existingGroup) {
        await chrome.tabs.group({ tabIds, groupId: existingGroup.id });
      } else {
        const groupId = await chrome.tabs.group({ tabIds });
        await updateGroup(groupId, domainGroup.groupName);
        groupsCreated += 1;
      }

      tabsGrouped += tabIds.length;
    }

    tabsUngrouped += await ungroupSingletonGroups(browserWindow.id);
  }

  return { groupsCreated, tabsGrouped, tabsUngrouped, emptyNewTabsRemoved };
}

async function removeDuplicateTabs() {
  const windows = await chrome.windows.getAll({ populate: true });
  const seen = new Set();
  const duplicateTabIds = [];

  for (const browserWindow of windows) {
    const tabs = [...(browserWindow.tabs || [])].sort((a, b) => a.index - b.index);

    for (const tab of tabs) {
      const duplicateKey = getDuplicateKey(tab);

      if (!duplicateKey) {
        continue;
      }

      if (seen.has(duplicateKey)) {
        duplicateTabIds.push(tab.id);
      } else {
        seen.add(duplicateKey);
      }
    }
  }

  if (duplicateTabIds.length > 0) {
    await chrome.tabs.remove(duplicateTabIds);
  }

  return { removedTabs: duplicateTabIds.length };
}

async function removeEmptyNewTabs(tabs) {
  const removableTabIds = tabs
    .filter((tab) => isEmptyNewTab(tab))
    .map((tab) => tab.id);

  if (removableTabIds.length === 0) {
    return 0;
  }

  const tabIdsToRemove =
    removableTabIds.length === tabs.length
      ? removableTabIds.slice(1)
      : removableTabIds;

  if (tabIdsToRemove.length === 0) {
    return 0;
  }

  await chrome.tabs.remove(tabIdsToRemove);
  return tabIdsToRemove.length;
}

async function findMatchingGroup(windowId, groupName) {
  const groups = await chrome.tabGroups.query({ windowId });
  return groups.find((group) => group.title === groupName) || null;
}

async function ungroupSingletonGroups(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  const tabsByGroup = new Map();

  for (const tab of tabs) {
    if (tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
      continue;
    }

    const groupTabs = tabsByGroup.get(tab.groupId) || [];
    groupTabs.push(tab);
    tabsByGroup.set(tab.groupId, groupTabs);
  }

  const singletonTabIds = [];

  for (const groupTabs of tabsByGroup.values()) {
    if (groupTabs.length === 1) {
      singletonTabIds.push(groupTabs[0].id);
    }
  }

  if (singletonTabIds.length > 0) {
    await chrome.tabs.ungroup(singletonTabIds);
  }

  return singletonTabIds.length;
}

async function updateGroup(groupId, groupName) {
  await chrome.tabGroups.update(groupId, {
    title: groupName,
    color: getStableGroupColor(groupName),
  });
}

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
  };
}

async function saveSettings(settings) {
  const nextSettings = {
    autoGroupEnabled: Boolean(settings.autoGroupEnabled),
    normalizeWww: Boolean(settings.normalizeWww),
    groupNameMode:
      settings.groupNameMode === "registrable-domain"
        ? "registrable-domain"
        : "full-host",
    excludedDomains: String(settings.excludedDomains || ""),
  };

  await chrome.storage.sync.set(nextSettings);
}

function getTabInfo(tab, settings) {
  if (!tab?.url) {
    return null;
  }

  const url = parseHttpUrl(tab.url);

  if (!url) {
    return null;
  }

  const host = normalizeHost(url.hostname, settings.normalizeWww);

  if (isExcluded(host, settings.excludedDomains)) {
    return null;
  }

  const groupName =
    settings.groupNameMode === "registrable-domain"
      ? getRegistrableDomain(host)
      : host;

  return {
    host,
    groupKey: groupName,
    groupName,
  };
}

function getDuplicateKey(tab) {
  const url = parseHttpUrl(tab?.url);

  if (!url) {
    return null;
  }

  const rawUrl = url.href;
  const hashIndex = rawUrl.indexOf("#");
  return hashIndex >= 0 ? rawUrl.slice(0, hashIndex) : rawUrl;
}

function isEmptyNewTab(tab) {
  const url = String(tab?.pendingUrl || tab?.url || "").toLowerCase();
  return (
    url === "chrome://newtab/" ||
    url === "chrome://new-tab-page/" ||
    url === "edge://newtab/" ||
    url === "edge://new-tab-page/"
  );
}

function parseHttpUrl(value) {
  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url;
  } catch (_error) {
    return null;
  }
}

function normalizeHost(host, normalizeWww) {
  const normalized = host.toLowerCase();
  return normalizeWww && normalized.startsWith("www.")
    ? normalized.slice(4)
    : normalized;
}

function isExcluded(host, excludedDomains) {
  const excluded = String(excludedDomains || "")
    .split(/\s|,/)
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);

  return excluded.some((domain) => {
    const normalizedDomain = domain.startsWith("www.")
      ? domain.slice(4)
      : domain;
    return host === normalizedDomain || host.endsWith(`.${normalizedDomain}`);
  });
}

function getRegistrableDomain(host) {
  const parts = host.split(".");

  if (parts.length <= 2) {
    return host;
  }

  const secondLevelTlds = new Set([
    "co.uk",
    "com.cn",
    "com.au",
    "co.jp",
    "co.kr",
    "com.br",
  ]);
  const lastTwo = parts.slice(-2).join(".");

  if (secondLevelTlds.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }

  return lastTwo;
}

function getStableGroupColor(value) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return GROUP_COLORS[hash % GROUP_COLORS.length];
}

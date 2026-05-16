const controls = {
  autoGroupEnabled: document.querySelector("#autoGroupEnabled"),
  normalizeWww: document.querySelector("#normalizeWww"),
  groupNameMode: document.querySelector("#groupNameMode"),
  excludedDomains: document.querySelector("#excludedDomains"),
  organizeAllButton: document.querySelector("#organizeAllButton"),
  removeDuplicatesButton: document.querySelector("#removeDuplicatesButton"),
  status: document.querySelector("#status"),
};

document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();

  controls.autoGroupEnabled.addEventListener("change", saveSettings);
  controls.normalizeWww.addEventListener("change", saveSettings);
  controls.groupNameMode.addEventListener("change", saveSettings);
  controls.excludedDomains.addEventListener("change", saveSettings);
  controls.organizeAllButton.addEventListener("click", organizeAll);
  controls.removeDuplicatesButton.addEventListener("click", removeDuplicates);
});

async function loadSettings() {
  const response = await sendMessage({ type: "GET_SETTINGS" });

  if (!response.ok) {
    setStatus(response.error, true);
    return;
  }

  controls.autoGroupEnabled.checked = response.settings.autoGroupEnabled;
  controls.normalizeWww.checked = response.settings.normalizeWww;
  controls.groupNameMode.value = response.settings.groupNameMode;
  controls.excludedDomains.value = response.settings.excludedDomains;
}

async function saveSettings() {
  const response = await sendMessage({
    type: "SAVE_SETTINGS",
    settings: getSettingsFromForm(),
  });

  if (!response.ok) {
    setStatus(response.error, true);
    return;
  }

  setStatus("Settings saved");
}

async function organizeAll() {
  await runAction(controls.organizeAllButton, "Organizing...", async () => {
    const response = await sendMessage({ type: "ORGANIZE_ALL" });

    if (!response.ok) {
      throw new Error(response.error);
    }

    setStatus(
      `Done: removed ${response.emptyNewTabsRemoved} empty new tabs, created ${response.groupsCreated} groups, grouped ${response.tabsGrouped} tabs`
    );
  });
}

async function removeDuplicates() {
  await runAction(
    controls.removeDuplicatesButton,
    "Removing duplicates...",
    async () => {
      const response = await sendMessage({ type: "REMOVE_DUPLICATES" });

      if (!response.ok) {
        throw new Error(response.error);
      }

      setStatus(
        `Removed ${response.removedTabs} duplicate tabs, removed ${response.singletonGroupsRemoved} singleton groups`
      );
    }
  );
}

async function runAction(button, busyText, action) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = busyText;
  setStatus("");

  try {
    await action();
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function getSettingsFromForm() {
  return {
    autoGroupEnabled: controls.autoGroupEnabled.checked,
    normalizeWww: controls.normalizeWww.checked,
    groupNameMode: controls.groupNameMode.value,
    excludedDomains: controls.excludedDomains.value,
  };
}

function sendMessage(message) {
  return chrome.runtime.sendMessage(message);
}

function setStatus(message, isError = false) {
  controls.status.textContent = message;
  controls.status.classList.toggle("error", isError);
}

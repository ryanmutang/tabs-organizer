# tabs-organizer

tabs-organizer is a Chrome extension that enhances Chrome's native vertical tabs by organizing tabs automatically. It groups related tabs by domain, cleans up ungrouped tabs across browser windows, and removes duplicate URL tabs while keeping one copy.

The extension does not replace Chrome's tab UI. It is designed to work with Chrome's built-in vertical tabs.

## Features

- Automatically group tabs by domain.
- Organize all browser windows with one click.
- Only organize tabs that are not already in a tab group.
- Move singleton tab groups back to regular tabs.
- Remove duplicate URL tabs while keeping one copy.
- Exclude domains from automatic organization.
- Normalize `www.` hostnames.
- Name groups by full host or registrable domain.
- Assign stable tab group colors by domain.

## Behavior

### Automatic domain grouping

- Only `http://` and `https://` tabs are processed.
- A domain group is created only when at least two matching tabs exist.
- New tabs for an existing grouped domain are added to that group.
- A single new domain tab remains ungrouped.
- Tabs that are already in a tab group are not automatically regrouped.

### Organize all tabs

- Scans all open Chrome windows.
- Organizes each window independently.
- Does not move tabs across windows.
- Only processes tabs that are not already in a tab group.
- Groups ungrouped tabs when two or more tabs share the same domain.
- Reuses an existing matching domain group in the same window when possible.
- After organizing, if a tab group contains only one tab, that tab is moved out of the group and Chrome removes the empty group.

### Remove duplicate URL tabs

- Scans regular web tabs across all Chrome windows.
- Keeps one tab for each matching URL and closes the remaining duplicates.
- If a URL contains `#`, only the part before `#` is used for matching.
- If a URL does not contain `#`, the full URL is used for matching.
- Keeps the leftmost, earliest-scanned tab by default.

## Permissions

tabs-organizer uses the following Chrome extension permissions:

- `tabs`: reads tab URLs, window IDs, tab indexes, and group state so it can group tabs and detect duplicate URLs.
- `tabGroups`: creates groups, reuses groups, updates group titles, and sets group colors.
- `storage`: saves extension settings such as auto-grouping, excluded domains, and naming mode.

The extension does not request host permissions, does not inject content scripts, and does not read page content.

## Privacy

- All logic runs locally in Chrome.
- No browsing history, tab URLs, or settings are uploaded.
- No data is sold or shared.
- No remote server is used.
- Stored settings are used only for extension behavior.

## Install Locally

1. Open `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this project directory.
5. Click the extension icon to open the popup.

## Development

Node.js is required for tests and packaging scripts.

Run unit tests:

```bash
npm test
```

Run a Chrome smoke test with a temporary Chrome profile:

```bash
npm run test:chrome
```

This command launches Chrome locally and verifies that the extension can be loaded.

## Packaging

Generate PNG icons:

```bash
npm run generate:icons
```

Create the Chrome Web Store upload package:

```bash
npm run package
```

The generated zip file is:

```text
dist/tabs-organizer-0.1.0.zip
```

Upload this zip file in the Chrome Web Store Developer Dashboard.

## Release Checklist

- Update `version` in `manifest.json`.
- Run `npm test`.
- Run `npm run test:chrome`.
- Run `npm run generate:icons`.
- Run `npm run package`.
- Confirm the zip root contains `manifest.json`.
- Confirm the Chrome Web Store privacy disclosures match this README.
- Prepare screenshots, short description, full description, and category metadata.

## Chrome Web Store Copy

### Short description

Organize Chrome tabs with automatic domain grouping and duplicate tab cleanup.

### Full description

tabs-organizer helps keep Chrome tabs organized when using Chrome's native vertical tabs. It automatically groups tabs by domain, organizes ungrouped tabs across all browser windows, removes singleton groups, and closes duplicate URL tabs while keeping one copy.

All processing happens locally in Chrome. The extension does not upload browsing data, does not inject scripts into web pages, and does not connect to remote servers.

## Limitations

- Does not implement a custom sidebar tab UI.
- Does not hide Chrome's built-in tab strip.
- Does not merge tab groups across windows.
- Does not support drag-and-drop sorting.
- Does not provide cloud sync.

# A11y Lab Chrome Extension

A Chrome extension that lets developers experiment with accessibility landmarks, custom shortcuts, and jump menus on any page. Use the edit mode to visually pick regions of the page and turn them into landmarks, then switch to preview mode to interact with the experience.

## Features

- **Visual landmark selection** – Start a selection from the popup, hover the page to highlight regions, and click to assign a name, role, and optional shortcut.
- **Landmark management** – Review, focus, or remove previously defined landmarks directly from the popup.
- **Preview mode** – Apply ARIA landmarks to the page, jump through regions with your shortcuts (Alt+key combinations), and navigate with a floating jump menu.
- **Jump menu** – Toggle a floating navigation menu that lists all defined landmarks for quick navigation.

## Getting started

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** in the top-right corner.
3. Choose **Load unpacked** and select the `a11y-extension` directory.
4. Navigate to any page, open the extension popup, and start configuring landmarks.

### Workflow

1. In the popup choose **Edit mode** and click **Select area** after filling the landmark details.
2. On the page, hover to highlight sections. Click the desired element to apply the configuration.
3. Switch to **Preview mode** to try keyboard shortcuts and use the jump menu.
4. Use the **Configured landmarks** list to focus on a region or remove it.

Settings are stored per page (origin + path) so you can create different experiments for each route.

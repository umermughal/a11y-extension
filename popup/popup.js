const state = {
  tabId: null,
  pageKey: null,
  mode: 'preview',
  jumpMenuEnabled: false,
  landmarks: []
};

const modeEditButton = document.getElementById('mode-edit');
const modePreviewButton = document.getElementById('mode-preview');
const startSelectionButton = document.getElementById('start-selection');
const toggleJumpMenuButton = document.getElementById('toggle-jump-menu');
const landmarkList = document.getElementById('landmark-list');

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function getPageKey(urlString) {
  try {
    const url = new URL(urlString);
    return `${url.origin}${url.pathname}`;
  } catch (error) {
    return 'global';
  }
}

function renderLandmarks() {
  landmarkList.innerHTML = '';
  if (!state.landmarks.length) {
    const empty = document.createElement('li');
    empty.textContent = 'No landmarks yet.';
    landmarkList.appendChild(empty);
    return;
  }

  for (const landmark of state.landmarks) {
    const item = document.createElement('li');
    item.className = 'landmark-item';
    item.innerHTML = `
      <strong>${landmark.label}</strong>
      <span class="landmark-meta">Role: ${landmark.role}</span>
      ${landmark.shortcut ? `<span class="landmark-meta">Shortcut: ${landmark.shortcut}</span>` : ''}
    `;

    const actions = document.createElement('div');
    actions.className = 'landmark-actions';

    const focusButton = document.createElement('button');
    focusButton.textContent = 'Focus';
    focusButton.classList.add('secondary');
    focusButton.addEventListener('click', () => focusLandmark(landmark.id));

    const removeButton = document.createElement('button');
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => removeLandmark(landmark.id));

    actions.append(focusButton, removeButton);
    item.append(actions);
    landmarkList.appendChild(item);
  }
}

async function syncStateFromContent() {
  if (!state.tabId) return;
  const response = await chrome.tabs.sendMessage(state.tabId, { type: 'get-state' }).catch(() => null);
  if (!response) return;
  state.mode = response.mode;
  state.jumpMenuEnabled = response.jumpMenuEnabled;
  state.landmarks = response.landmarks ?? [];
  updateModeButtons();
  updateJumpMenuButton();
  renderLandmarks();
}

function updateModeButtons() {
  modeEditButton.setAttribute('aria-pressed', state.mode === 'edit');
  modePreviewButton.setAttribute('aria-pressed', state.mode === 'preview');
}

function updateJumpMenuButton() {
  toggleJumpMenuButton.textContent = state.jumpMenuEnabled ? 'Hide jump menu' : 'Show jump menu';
}

async function setMode(mode) {
  if (!state.tabId) return;
  const response = await chrome.tabs
    .sendMessage(state.tabId, { type: 'set-mode', mode })
    .catch(() => null);
  state.mode = response?.mode ?? mode;
  updateModeButtons();
}

async function focusLandmark(id) {
  if (!state.tabId) return;
  await chrome.tabs.sendMessage(state.tabId, { type: 'focus-landmark', id }).catch(() => {});
}

async function removeLandmark(id) {
  if (!state.tabId) return;
  await chrome.tabs.sendMessage(state.tabId, { type: 'remove-landmark', id }).catch(() => {});
  await syncStateFromContent();
}

async function startSelection() {
  if (!state.tabId) return;
  const label = document.getElementById('landmark-label').value.trim();
  const role = document.getElementById('landmark-role').value;
  const shortcut = document.getElementById('landmark-shortcut').value.trim();

  if (!label) {
    alert('Please provide a name for the landmark.');
    return;
  }

  await setMode('edit');
  await chrome.tabs.sendMessage(state.tabId, {
    type: 'start-selection',
    payload: { label, role, shortcut }
  }).catch(() => {});
}

async function toggleJumpMenu() {
  if (!state.tabId) return;
  const response = await chrome.tabs.sendMessage(state.tabId, { type: 'toggle-jump-menu' }).catch(() => null);
  if (response) {
    state.jumpMenuEnabled = response.jumpMenuEnabled;
    updateJumpMenuButton();
  }
}

function registerStorageListener() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (!changes.a11yLab) return;
    if (!state.pageKey) return;
    const next = changes.a11yLab.newValue;
    const prev = changes.a11yLab.oldValue;
    const hasUpdate = Boolean(next?.pages?.[state.pageKey] || prev?.pages?.[state.pageKey]);
    if (!hasUpdate) return;
    syncStateFromContent();
  });
}

async function init() {
  registerStorageListener();
  const tab = await getActiveTab();
  state.tabId = tab?.id ?? null;
  state.pageKey = getPageKey(tab?.url ?? '');
  await syncStateFromContent();

  modeEditButton.addEventListener('click', () => setMode('edit'));
  modePreviewButton.addEventListener('click', () => setMode('preview'));
  startSelectionButton.addEventListener('click', startSelection);
  toggleJumpMenuButton.addEventListener('click', toggleJumpMenu);
}

init();

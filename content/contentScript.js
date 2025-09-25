const pageState = {
  mode: 'preview',
  selecting: false,
  pendingElement: null,
  currentSelectionConfig: null,
  hoveredElement: null,
  overlay: null,
  selectionActions: null,
  landmarks: [],
  jumpMenuEnabled: false,
  shortcutHandler: null,
  pageKey: `${location.origin}${location.pathname}`
};

const STORAGE_KEY = 'a11yLab';

init();

async function init() {
  await loadStateFromStorage();
  applyLandmarks();
  ensureShortcutHandler();
  if (pageState.jumpMenuEnabled) {
    renderJumpMenu();
  }
}

function ensureShortcutHandler() {
  if (pageState.shortcutHandler) return;
  pageState.shortcutHandler = handleShortcut.bind(null);
  document.addEventListener('keydown', pageState.shortcutHandler, true);
}

async function loadStateFromStorage() {
  const stored = await chrome.storage.local.get([STORAGE_KEY]);
  const root = stored[STORAGE_KEY] || { pages: {} };
  const page = root.pages?.[pageState.pageKey] || {};
  pageState.landmarks = page.landmarks || [];
  pageState.jumpMenuEnabled = Boolean(page.jumpMenuEnabled);
}

async function saveStateToStorage() {
  const stored = await chrome.storage.local.get([STORAGE_KEY]);
  const root = stored[STORAGE_KEY] || { pages: {} };
  root.pages = root.pages || {};
  root.pages[pageState.pageKey] = {
    landmarks: pageState.landmarks,
    jumpMenuEnabled: pageState.jumpMenuEnabled
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: root });
}

function applyLandmarks() {
  clearExistingLandmarks();
  for (const landmark of pageState.landmarks) {
    const element = document.querySelector(landmark.selector);
    if (!element) continue;

    if (!Object.prototype.hasOwnProperty.call(element.dataset, 'a11yLabOriginalRole')) {
      element.dataset.a11yLabOriginalRole = element.getAttribute('role') ?? '';
    }
    if (!Object.prototype.hasOwnProperty.call(element.dataset, 'a11yLabOriginalLabel')) {
      element.dataset.a11yLabOriginalLabel = element.getAttribute('aria-label') ?? '';
    }

    element.setAttribute('role', landmark.role);
    element.setAttribute('aria-label', landmark.label);

    if (!element.hasAttribute('tabindex')) {
      element.setAttribute('tabindex', '-1');
      element.dataset.a11yLabTabIndex = 'true';
    }
    element.dataset.a11yLabLandmarkId = landmark.id;
  }
  if (pageState.jumpMenuEnabled) {
    renderJumpMenu();
  } else {
    removeJumpMenu();
  }
}

function clearExistingLandmarks() {
  const candidates = document.querySelectorAll('[data-a11y-lab-landmark-id]');
  candidates.forEach((element) => {
    const originalRole = element.dataset.a11yLabOriginalRole;
    const originalLabel = element.dataset.a11yLabOriginalLabel;

    if (typeof originalRole === 'string') {
      if (originalRole === '') {
        element.removeAttribute('role');
      } else {
        element.setAttribute('role', originalRole);
      }
      delete element.dataset.a11yLabOriginalRole;
    }

    if (typeof originalLabel === 'string') {
      if (originalLabel === '') {
        element.removeAttribute('aria-label');
      } else {
        element.setAttribute('aria-label', originalLabel);
      }
      delete element.dataset.a11yLabOriginalLabel;
    }

    if (element.dataset.a11yLabTabIndex === 'true') {
      element.removeAttribute('tabindex');
      delete element.dataset.a11yLabTabIndex;
    }
    delete element.dataset.a11yLabLandmarkId;
  });
}

function handleShortcut(event) {
  if (pageState.mode !== 'preview') return;
  const pressed = serializeShortcut(event);
  if (!pressed) return;
  const match = pageState.landmarks.find((landmark) => landmark.shortcut && normalizeShortcut(landmark.shortcut) === pressed);
  if (!match) return;
  const element = document.querySelector(match.selector);
  if (!element) return;
  event.preventDefault();
  focusElement(element);
}

function serializeShortcut(event) {
  const keys = [];
  if (event.altKey) keys.push('alt');
  if (event.ctrlKey) keys.push('ctrl');
  if (event.metaKey) keys.push('meta');
  if (event.shiftKey) keys.push('shift');
  const key = event.key.toLowerCase();
  if (key === 'alt' || key === 'control' || key === 'shift' || key === 'meta') return null;
  keys.push(key);
  return keys.join('+');
}

function normalizeShortcut(shortcut) {
  return shortcut
    .split('+')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .join('+');
}

function startSelection(config) {
  if (pageState.selecting) return;
  pageState.mode = 'edit';
  pageState.selecting = true;
  pageState.pendingElement = null;
  pageState.currentSelectionConfig = config;
  document.addEventListener('pointermove', handlePointerMove, true);
  document.addEventListener('pointerdown', handlePointerDown, true);
  document.addEventListener('keydown', cancelSelectionOnEscape, true);
  window.addEventListener('scroll', refreshOverlay, true);
  window.addEventListener('resize', refreshOverlay, true);
  document.documentElement.classList.add('a11y-lab-selecting');
  ensureOverlay();
  removeSelectionActions();
  showSelectionNotice();
}

function showSelectionNotice() {
  const noticeId = 'a11y-lab-selection-notice';
  if (document.getElementById(noticeId)) return;
  const notice = document.createElement('div');
  notice.id = noticeId;
  notice.textContent = 'Click the element to preview and choose Save. Press Esc to cancel.';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.className = 'a11y-lab-selection-notice';
  document.body.appendChild(notice);
}

function hideSelectionNotice() {
  const notice = document.getElementById('a11y-lab-selection-notice');
  if (notice) {
    notice.remove();
  }
}

function handlePointerMove(event) {
  if (!pageState.selecting) return;
  const target = getSelectableTarget(event);
  if (!target) return;
  highlightElement(target);
}

function handlePointerDown(event) {
  if (!pageState.selecting) return;
  if (pageState.selectionActions?.contains(event.target)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const target = getSelectableTarget(event);
  if (!target) return;
  pageState.pendingElement = target;
  highlightElement(target);
  showSelectionActions();
}

function cancelSelectionOnEscape(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    stopSelection();
  }
}

async function commitSelection() {
  const element = pageState.pendingElement;
  if (!element) return;
  const selector = getUniqueSelector(element);
  const { label, role, shortcut } = pageState.currentSelectionConfig;
  const landmark = {
    id: crypto.randomUUID(),
    selector,
    label,
    role,
    shortcut: shortcut || ''
  };
  pageState.landmarks = [...pageState.landmarks.filter((item) => item.selector !== selector), landmark];
  await saveStateToStorage();
  stopSelection();
  applyLandmarks();
}

function stopSelection() {
  pageState.selecting = false;
  pageState.pendingElement = null;
  pageState.currentSelectionConfig = null;
  document.removeEventListener('pointermove', handlePointerMove, true);
  document.removeEventListener('pointerdown', handlePointerDown, true);
  document.removeEventListener('keydown', cancelSelectionOnEscape, true);
  window.removeEventListener('scroll', refreshOverlay, true);
  window.removeEventListener('resize', refreshOverlay, true);
  document.documentElement.classList.remove('a11y-lab-selecting');
  hideSelectionNotice();
  removeOverlay();
  removeSelectionActions();
}

function highlightElement(element) {
  pageState.hoveredElement = element;
  ensureOverlay();
  updateOverlayPosition();
}

function ensureOverlay() {
  if (pageState.overlay) return;
  const overlay = document.createElement('div');
  overlay.id = 'a11y-lab-overlay';
  overlay.className = 'a11y-lab-overlay';
  document.body.appendChild(overlay);
  pageState.overlay = overlay;
}

function removeOverlay() {
  if (!pageState.overlay) return;
  pageState.overlay.remove();
  pageState.overlay = null;
}

function refreshOverlay() {
  if (!pageState.hoveredElement) return;
  updateOverlayPosition();
}

function updateOverlayPosition() {
  if (!pageState.overlay || !pageState.hoveredElement) return;
  const rect = pageState.hoveredElement.getBoundingClientRect();
  pageState.overlay.style.display = 'block';
  pageState.overlay.style.top = `${window.scrollY + rect.top}px`;
  pageState.overlay.style.left = `${window.scrollX + rect.left}px`;
  pageState.overlay.style.width = `${rect.width}px`;
  pageState.overlay.style.height = `${rect.height}px`;
  positionSelectionActions(rect);
}

function getUniqueSelector(element) {
  if (element === document.body) {
    return 'body';
  }
  if (element === document.documentElement) {
    return 'html';
  }
  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }
  const path = [];
  let current = element;
  while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
    let selector = current.nodeName.toLowerCase();
    if (current.className) {
      const className = Array.from(current.classList)
        .slice(0, 3)
        .map((cls) => `.${CSS.escape(cls)}`)
        .join('');
      selector += className;
    }
    const siblings = Array.from(current.parentNode?.children || []);
    const index = siblings.indexOf(current) + 1;
    selector += `:nth-child(${index})`;
    path.unshift(selector);
    current = current.parentElement;
  }
  return path.join(' > ');
}

function focusElement(element) {
  const previouslyTabbable = element.hasAttribute('tabindex');
  if (!previouslyTabbable) {
    element.setAttribute('tabindex', '-1');
  }
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  element.focus({ preventScroll: true });
  if (!previouslyTabbable) {
    element.addEventListener('blur', () => {
      element.removeAttribute('tabindex');
    }, { once: true });
  }
}

function renderJumpMenu() {
  removeJumpMenu();
  if (!pageState.jumpMenuEnabled || !pageState.landmarks.length) return;
  const menu = document.createElement('nav');
  menu.id = 'a11y-lab-jump-menu';
  menu.className = 'a11y-lab-jump-menu';
  menu.setAttribute('aria-label', 'Landmark navigation');

  const title = document.createElement('div');
  title.className = 'a11y-lab-jump-menu__title';
  title.textContent = 'Landmarks';

  const list = document.createElement('ul');
  list.className = 'a11y-lab-jump-menu__list';

  for (const landmark of pageState.landmarks) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = landmark.label;
    button.addEventListener('click', () => {
      const element = document.querySelector(landmark.selector);
      if (element) {
        focusElement(element);
      }
    });
    item.appendChild(button);
    list.appendChild(item);
  }

  menu.append(title, list);
  document.body.appendChild(menu);
}

function removeJumpMenu() {
  const menu = document.getElementById('a11y-lab-jump-menu');
  if (menu) {
    menu.remove();
  }
}

async function handleRemoveLandmark(id) {
  pageState.landmarks = pageState.landmarks.filter((landmark) => landmark.id !== id);
  await saveStateToStorage();
  applyLandmarks();
}

function handleFocusLandmark(id) {
  const landmark = pageState.landmarks.find((item) => item.id === id);
  if (!landmark) return;
  const element = document.querySelector(landmark.selector);
  if (!element) return;
  focusElement(element);
}

function getSelectableTarget(event) {
  const path = event.composedPath();
  for (const candidate of path) {
    if (!(candidate instanceof Element)) continue;
    if (candidate.id === 'a11y-lab-overlay') continue;
    if (candidate.closest && candidate.closest('#a11y-lab-selection-actions')) continue;
    if (candidate === document.documentElement || candidate === document.body) continue;
    return candidate;
  }
  return null;
}

function ensureSelectionActions() {
  if (pageState.selectionActions) return pageState.selectionActions;
  const actions = document.createElement('div');
  actions.id = 'a11y-lab-selection-actions';
  actions.className = 'a11y-lab-selection-actions';

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.className = 'a11y-lab-selection-actions__save';
  saveButton.textContent = 'Save landmark';
  saveButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void commitSelection();
  });

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'a11y-lab-selection-actions__cancel';
  cancelButton.textContent = 'Cancel';
  cancelButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    stopSelection();
  });

  actions.append(saveButton, cancelButton);
  document.body.appendChild(actions);
  pageState.selectionActions = actions;
  return actions;
}

function showSelectionActions() {
  const actions = ensureSelectionActions();
  actions.style.display = 'flex';
  const rect = pageState.hoveredElement?.getBoundingClientRect();
  if (rect) {
    positionSelectionActions(rect);
  }
}

function positionSelectionActions(targetRect) {
  if (!pageState.selectionActions || pageState.selectionActions.style.display === 'none') return;
  const actions = pageState.selectionActions;
  const viewportHeight = window.innerHeight;
  const actionsHeight = actions.offsetHeight || actions.getBoundingClientRect().height || 0;
  const topBelow = window.scrollY + targetRect.bottom + 12;
  const topAbove = window.scrollY + targetRect.top - actionsHeight - 12;
  const preferredTop = targetRect.bottom + 12 < viewportHeight ? topBelow : Math.max(window.scrollY, topAbove);
  const actionsWidth = actions.offsetWidth || actions.getBoundingClientRect().width || 0;
  const maxLeft = window.scrollX + window.innerWidth - actionsWidth - 12;
  const minLeft = window.scrollX + 12;
  const desiredLeft = window.scrollX + targetRect.left;
  const clampedLeft = Math.min(Math.max(desiredLeft, minLeft), Math.max(minLeft, maxLeft));
  actions.style.top = `${preferredTop}px`;
  actions.style.left = `${clampedLeft}px`;
}

function removeSelectionActions() {
  if (!pageState.selectionActions) return;
  pageState.selectionActions.remove();
  pageState.selectionActions = null;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'get-state': {
      sendResponse({
        mode: pageState.mode,
        jumpMenuEnabled: pageState.jumpMenuEnabled,
        landmarks: pageState.landmarks
      });
      break;
    }
    case 'set-mode': {
      pageState.mode = message.mode === 'edit' ? 'edit' : 'preview';
      if (pageState.mode === 'preview') {
        applyLandmarks();
      } else {
        removeJumpMenu();
      }
      sendResponse({ mode: pageState.mode });
      break;
    }
    case 'start-selection': {
      startSelection(message.payload);
      sendResponse({ selecting: true });
      break;
    }
    case 'remove-landmark': {
      handleRemoveLandmark(message.id).then(() => {
        sendResponse({ landmarks: pageState.landmarks });
      });
      return true;
    }
    case 'focus-landmark': {
      handleFocusLandmark(message.id);
      sendResponse({});
      break;
    }
    case 'toggle-jump-menu': {
      pageState.jumpMenuEnabled = !pageState.jumpMenuEnabled;
      if (pageState.jumpMenuEnabled) {
        renderJumpMenu();
      } else {
        removeJumpMenu();
      }
      saveStateToStorage().then(() => {
        sendResponse({ jumpMenuEnabled: pageState.jumpMenuEnabled });
      });
      return true;
    }
    default:
      break;
  }
});

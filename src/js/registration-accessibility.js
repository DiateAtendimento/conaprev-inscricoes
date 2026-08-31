(() => {
  'use strict';

  const modal = document.getElementById('modalInscricao');
  const decreaseButton = document.getElementById('registrationFontDecrease');
  const resetButton = document.getElementById('registrationFontReset');
  const increaseButton = document.getElementById('registrationFontIncrease');
  if (!modal || !decreaseButton || !resetButton || !increaseButton) return;

  const STORAGE_KEY = 'conaprev.registrationFontScale';
  const LEVELS = [0.9, 1, 1.1, 1.2];
  const TARGET_SELECTOR = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'label', 'legend',
    'input', 'select', 'textarea', 'button', 'a', 'small', 'strong', 'li',
    'td', 'th', '.form-text', '.alert', '.mi-step'
  ].join(',');
  const fontRecords = new Map();

  const readStoredScale = () => {
    try {
      const value = Number(localStorage.getItem(STORAGE_KEY));
      return LEVELS.includes(value) ? value : 1;
    } catch {
      return 1;
    }
  };

  let scale = readStoredScale();

  function isScalable(element) {
    return element instanceof HTMLElement &&
      !element.closest('.registration-header') &&
      element.matches(TARGET_SELECTOR);
  }

  function registerElement(element, isDynamic = false) {
    if (!isScalable(element) || fontRecords.has(element)) return;
    const computedSize = Number.parseFloat(getComputedStyle(element).fontSize);
    if (!Number.isFinite(computedSize) || computedSize <= 0) return;

    let baseSize = computedSize;
    if (isDynamic && scale !== 1 && element.parentElement && fontRecords.has(element.parentElement)) {
      const parentRecord = fontRecords.get(element.parentElement);
      const parentSize = Number.parseFloat(getComputedStyle(element.parentElement).fontSize);
      const scaledParentSize = parentRecord.baseSize * scale;
      if (Number.isFinite(parentSize) &&
          Math.abs(parentSize - scaledParentSize) < 0.2 &&
          Math.abs(parentSize - computedSize) < 0.2) {
        baseSize = computedSize / scale;
      }
    }

    fontRecords.set(element, {
      baseSize,
      originalInlineSize: element.style.fontSize
    });
  }

  function registerTree(root, isDynamic = false) {
    if (!(root instanceof Element)) return;
    registerElement(root, isDynamic);
    root.querySelectorAll(TARGET_SELECTOR).forEach(element => registerElement(element, isDynamic));
  }

  function updateControls() {
    const index = LEVELS.indexOf(scale);
    decreaseButton.disabled = index <= 0;
    increaseButton.disabled = index >= LEVELS.length - 1;
    decreaseButton.setAttribute('aria-pressed', String(scale === LEVELS[0]));
    resetButton.setAttribute('aria-pressed', String(scale === 1));
    increaseButton.setAttribute('aria-pressed', String(scale === LEVELS[LEVELS.length - 1]));
    modal.style.setProperty('--registration-font-scale', String(scale));
    modal.dataset.fontScale = String(Math.round(scale * 100));
  }

  function applyScale(nextScale, persist = true) {
    scale = LEVELS.includes(nextScale) ? nextScale : 1;

    fontRecords.forEach((record, element) => {
      if (!element.isConnected) {
        fontRecords.delete(element);
        return;
      }
      if (scale === 1) element.style.fontSize = record.originalInlineSize;
      else element.style.fontSize = `${(record.baseSize * scale).toFixed(2)}px`;
    });

    updateControls();
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, String(scale)); } catch {}
    }
  }

  registerTree(modal);
  applyScale(scale, false);

  decreaseButton.addEventListener('click', () => {
    const index = LEVELS.indexOf(scale);
    if (index > 0) applyScale(LEVELS[index - 1]);
  });

  resetButton.addEventListener('click', () => applyScale(1));

  increaseButton.addEventListener('click', () => {
    const index = LEVELS.indexOf(scale);
    if (index < LEVELS.length - 1) applyScale(LEVELS[index + 1]);
  });

  const observer = new MutationObserver(mutations => {
    let hasNewContent = false;
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (!(node instanceof Element)) return;
        registerTree(node, true);
        hasNewContent = true;
      });
    });
    if (hasNewContent && scale !== 1) applyScale(scale, false);
  });

  observer.observe(modal, { childList: true, subtree: true });
})();

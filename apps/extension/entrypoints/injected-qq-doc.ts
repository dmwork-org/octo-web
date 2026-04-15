/// <reference path="../types/qq-doc.d.ts" />

const BOOT_FLAG = '__OCTO_QQ_DOC_BOOTED__';
const MAX_RETRIES = 120;
const RETRY_DELAY = 500;
const POINTER_THRESHOLD = 4;
const DUPLICATE_WINDOW = 800;
const SETTLE_DELAY = 80;

function normalizeText(value?: string): string {
  return (value ?? '').replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n').trim();
}

function getDomSelectedText(): string {
  try {
    return normalizeText(window.getSelection?.()?.toString());
  } catch {
    return '';
  }
}

function sendToContentScript(text: string) {
  window.postMessage({ type: 'QQ_DOC_TEXT_SELECTED', text }, '*');
}

function installListeners(editor: QQDocEditor) {
  let lastText = '';
  let lastTime = 0;
  let pendingTimer: number | null = null;
  let pointerActive = false;
  let pointerX = 0;
  let pointerY = 0;

  function captureSelection(allowWithoutDom: boolean) {
    const domText = getDomSelectedText();
    if (!domText && !allowWithoutDom) return;

    editor._docEnv.copyable = true;
    try {
      editor.clipboardManager.copy();
    } catch {
      return;
    }

    const text = normalizeText(
      editor.clipboardManager.customClipboard?.plain || domText,
    );
    if (!text) return;

    const now = Date.now();
    if (text === lastText && now - lastTime < DUPLICATE_WINDOW) return;

    lastText = text;
    lastTime = now;
    sendToContentScript(text);
  }

  function scheduleCapture(allowWithoutDom: boolean) {
    if (pendingTimer !== null) window.clearTimeout(pendingTimer);
    pendingTimer = window.setTimeout(() => {
      pendingTimer = null;
      captureSelection(allowWithoutDom);
    }, SETTLE_DELAY);
  }

  document.addEventListener('pointerdown', (e) => {
    pointerActive = true;
    pointerX = e.clientX;
    pointerY = e.clientY;
  }, true);

  document.addEventListener('pointerup', (e) => {
    const moved = pointerActive
      && Math.hypot(e.clientX - pointerX, e.clientY - pointerY) >= POINTER_THRESHOLD;
    pointerActive = false;
    scheduleCapture(moved || e.detail > 1);
  }, true);

  document.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    const isSelectAll = (e.metaKey || e.ctrlKey) && key === 'a';
    const isRangeExtend = e.shiftKey
      && (key.startsWith('arrow') || key === 'home' || key === 'end'
        || key === 'pageup' || key === 'pagedown');

    if (!isSelectAll && !isRangeExtend && !getDomSelectedText()) return;
    scheduleCapture(isSelectAll || isRangeExtend);
  }, true);
}

function waitForEditor(retries = 0) {
  const editor = window.pad?.editor;
  if (editor) {
    installListeners(editor);
    return;
  }
  if (retries >= MAX_RETRIES) return;
  setTimeout(() => waitForEditor(retries + 1), RETRY_DELAY);
}

export default defineUnlistedScript(() => {
  if ((window as any)[BOOT_FLAG]) return;
  (window as any)[BOOT_FLAG] = true;
  waitForEditor();
});

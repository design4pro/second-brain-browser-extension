import { buildContent, buildTags, isVideoUrl } from '@/utils/capture';
import { fetchVideoTranscript } from '@/utils/video';

const $ = id => document.getElementById(id);

const isMac = navigator.platform.toUpperCase().includes('MAC');

function applyModifierKeys() {
  document.querySelectorAll('.kbd-modifier').forEach(el => {
    if (isMac) {
      el.textContent = '⌥';
      el.title = 'Option';
    } else {
      el.textContent = 'Alt';
    }
  });
}

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  $(id).classList.remove('hidden');
}

function showStatus(type, message) {
  const el = $('status');
  el.className = `status ${type}`;
  el.textContent = message;
  el.classList.remove('hidden');
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function isRestrictedUrl(url) {
  return ['chrome://', 'chrome-extension://', 'edge://', 'about:', 'moz-extension://']
    .some(prefix => url.startsWith(prefix));
}

function openSetup() {
  browser.tabs.create({ url: browser.runtime.getURL('/setup.html') });
  window.close();
}

document.addEventListener('DOMContentLoaded', async () => {
  applyModifierKeys();

  // 1. Load settings
  const { workerUrl, authToken } = await browser.storage.sync.get(['workerUrl', 'authToken']);

  if (!workerUrl || !authToken) {
    showView('view-not-configured');
    $('btn-open-setup').addEventListener('click', openSetup);
    return;
  }

  // 2. Get active tab
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

  if (!tab?.url || isRestrictedUrl(tab.url)) {
    showView('view-capture');
    $('page-title').textContent = 'This page cannot be captured';
    $('page-url').textContent = tab?.url || '';
    $('btn-capture').disabled = true;
    $('btn-capture-label').textContent = 'Not available';
    setupSettingsButton();
    return;
  }

  // Transcript fetching can take a few seconds, so it runs alongside the rest
  const videoPromise = fetchVideoTranscript(tab);
  showTranscriptOption(tab.url, videoPromise);

  // 3. Try to get selected text
  let selection = '';
  try {
    const [result] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection().toString().trim(),
    });
    selection = result?.result || '';
  } catch {
    // Restricted page — selection unavailable
  }

  // 4. Populate UI
  $('page-title').textContent = truncate(tab.title || 'Untitled', 80);
  $('page-url').textContent = truncate(tab.url, 60);

  if (selection) {
    $('selection-text').textContent = truncate(selection, 160);
    $('selection-badge').classList.remove('hidden');
  }

  showView('view-capture');
  setupSettingsButton();

  // 5. Capture
  $('btn-capture').addEventListener('click', async () => {
    const btn = $('btn-capture');
    const label = $('btn-capture-label');
    btn.disabled = true;
    label.textContent = 'Saving…';
    $('status').classList.add('hidden');

    const note = $('note').value.trim();
    const video = $('include-transcript').checked ? await videoPromise : null;
    const content = buildContent({ title: tab.title || 'Untitled', url: tab.url, selection, note, video });

    try {
      const res = await fetch(`${workerUrl.replace(/\/$/, '')}/capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ content, tags: buildTags(video), source: 'extension' }),
      });

      if (!res.ok && res.status === 401) {
        showStatus('error', 'Auth failed — check your token in settings.');
        return;
      }

      if (res.status === 413) {
        showStatus('error', 'Too long to save as one memory. Shorten the note or selection.');
        return;
      }

      const data = await res.json();

      if (!data.ok && data.duplicate) {
        showStatus('warning', `Already in your brain (${data.score}% match)`);
      } else if (data.ok) {
        const action = data.action;
        const msg = action === 'merged'
          ? 'Merged with an existing memory.'
          : action === 'replaced'
          ? 'Updated an existing memory.'
          : 'Captured!';
        showStatus('success', msg);
        setTimeout(() => window.close(), 1400);
      } else {
        showStatus('error', data.error || 'Something went wrong.');
      }
    } catch {
      showStatus('error', 'Could not reach your worker. Check your URL in settings.');
    } finally {
      btn.disabled = false;
      label.textContent = 'Capture';
    }
  });
});

async function showTranscriptOption(url, videoPromise) {
  if (!isVideoUrl(url)) return;

  const checkbox = $('include-transcript');
  const status = $('transcript-status');
  $('transcript-option').classList.remove('hidden');

  const video = await videoPromise;
  if (video) {
    status.textContent = 'Include video transcript';
    checkbox.disabled = false;
  } else {
    status.textContent = 'No transcript available for this video';
    checkbox.checked = false;
  }
}

function setupSettingsButton() {
  $('btn-settings').addEventListener('click', openSetup);
}

import { isVideoUrl } from './capture';

// Same ceiling Obsidian Web Clipper uses for Defuddle's async parse
const TRANSCRIPT_TIMEOUT_MS = 8000;

/**
 * Fetches the transcript of the video in the given tab.
 * Resolves to null when the page is not a video, has no captions, or times out.
 */
export async function fetchVideoTranscript(tab) {
  if (!isVideoUrl(tab.url)) return null;

  const injection = browser.scripting
    .executeScript({ target: { tabId: tab.id }, files: ['/video-transcript.js'] })
    .then(([res]) => res?.result ?? null)
    .catch(() => null);
  const timeout = new Promise(resolve => setTimeout(() => resolve(null), TRANSCRIPT_TIMEOUT_MS));

  return Promise.race([injection, timeout]);
}

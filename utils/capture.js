// Mirrors MAX_CONTENT_BYTES in second-brain-cloudflare (src/lib/content-size.ts):
// the Worker rejects anything larger with 413 and saves nothing.
export const MAX_CONTENT_BYTES = 131_072;

// Pages Defuddle has a transcript extractor for (same scope as Obsidian Web Clipper)
const VIDEO_URL_PATTERNS = [
  /^https:\/\/(www\.|m\.)?youtube\.com\/(watch\?|shorts\/|live\/)/,
  /^https:\/\/youtu\.be\//,
  /^https:\/\/(www\.)?bilibili\.com\/video\//,
];

const encoder = new TextEncoder();
const byteLength = text => encoder.encode(text).length;

export function isVideoUrl(url) {
  return VIDEO_URL_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * Converts Defuddle's markdown transcript into plain text the Worker stores well.
 *
 * The Worker collapses all whitespace into single spaces and lifts every `#word`
 * into a tag, so markdown structure is lost and spoken hashtags would pollute tags.
 * Each segment therefore carries its own inline marker:
 *   "**1:23** · text" -> "[1:23] text"
 *   "### Intro"       -> "[Chapter: Intro]"
 */
export function toTranscriptLines(markdown) {
  return markdown
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line
      .replace(/^###\s+(.+)$/, '[Chapter: $1]')
      .replace(/^\*\*([\d:]+)\*\*\s*·\s*/, '[$1] ')
      // Same match as the Worker's extractHashtags: #\w+ that is not purely numeric
      .replace(/#(?=\w*[^\W\d])/g, ''));
}

function buildVideoHeader(video) {
  const details = [video.site, video.author, video.published?.split('T')[0], video.language]
    .filter(Boolean)
    .join(' · ');
  return details ? `Video transcript (${details}):` : 'Video transcript:';
}

/**
 * Builds the `/capture` content string. When a transcript is present it goes last,
 * and is cut at a line boundary so the whole note stays under the Worker's limit.
 */
export function buildContent({ title, url, selection, note, video }) {
  const parts = [`${title}\n${url}`];
  if (selection) parts.push(`Highlighted: "${selection}"`);
  if (note) parts.push(note);

  const lines = video?.transcript ? toTranscriptLines(video.transcript) : [];
  if (!lines.length) return parts.join('\n\n');

  const head = `${parts.join('\n\n')}\n\n${buildVideoHeader(video)}\n`;
  const full = head + lines.join('\n');
  if (byteLength(full) <= MAX_CONTENT_BYTES) return full;

  // Reserve room for the truncation marker, then keep whole lines that fit
  const marker = (kept) => `\n[Transcript truncated: ${kept} of ${lines.length} segments saved]`;
  let budget = MAX_CONTENT_BYTES - byteLength(head) - byteLength(marker(lines.length));
  let kept = 0;
  for (const line of lines) {
    budget -= byteLength(line) + 1;
    if (budget < 0) break;
    kept++;
  }
  return head + lines.slice(0, kept).join('\n') + marker(kept);
}

// Explicit tags for video captures, e.g. ['video', 'youtube']
export function buildTags(video) {
  if (!video?.transcript) return [];
  const site = video.site?.toLowerCase().replace(/\W+/g, '');
  return site ? ['video', site] : ['video'];
}

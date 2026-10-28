import { describe, expect, it } from 'vitest';
import { MAX_CONTENT_BYTES, buildContent, buildTags, isVideoUrl, toTranscriptLines } from './capture';

const byteLength = text => new TextEncoder().encode(text).length;

// Same shape as Defuddle's `variables.transcript` (src/utils/transcript.ts)
const TRANSCRIPT = [
  '### Intro',
  '',
  '**0:00** · Welcome to the #channel',
  '**0:05** · Today we talk about C# and issue #42',
  '',
  '### Main part',
  '',
  '**1:02:03** · Deep dive',
].join('\n');

const VIDEO = {
  transcript: TRANSCRIPT,
  site: 'YouTube',
  author: 'Some Channel',
  published: '2026-10-01T12:00:00Z',
  language: 'en',
};

describe('isVideoUrl', () => {
  it.each([
    'https://www.youtube.com/watch?v=abc',
    'https://m.youtube.com/watch?v=abc',
    'https://www.youtube.com/shorts/abc',
    'https://youtu.be/abc',
    'https://www.bilibili.com/video/BV1xx411c7mD',
  ])('accepts %s', url => {
    expect(isVideoUrl(url)).toBe(true);
  });

  it.each([
    'https://www.youtube.com/',
    'https://www.youtube.com/@channel',
    'https://example.com/watch?v=abc',
  ])('rejects %s', url => {
    expect(isVideoUrl(url)).toBe(false);
  });
});

describe('toTranscriptLines', () => {
  it('turns markdown into inline markers that survive whitespace collapsing', () => {
    expect(toTranscriptLines(TRANSCRIPT)).toEqual([
      '[Chapter: Intro]',
      '[0:00] Welcome to the channel',
      '[0:05] Today we talk about C# and issue #42',
      '[Chapter: Main part]',
      '[1:02:03] Deep dive',
    ]);
  });

  it('leaves no #word the Worker would lift into a tag', () => {
    const hashtags = toTranscriptLines(TRANSCRIPT).join(' ').match(/#\w+/g) ?? [];
    expect(hashtags.filter(tag => !/^#\d+$/.test(tag))).toEqual([]);
  });
});

describe('buildContent', () => {
  const base = { title: 'Title', url: 'https://youtu.be/abc' };

  it('keeps the original format when there is no video', () => {
    expect(buildContent({ ...base, selection: 'sel', note: 'note #tag' }))
      .toBe('Title\nhttps://youtu.be/abc\n\nHighlighted: "sel"\n\nnote #tag');
  });

  it('appends a transcript with a metadata header after the note', () => {
    const content = buildContent({ ...base, note: 'my note', video: VIDEO });

    expect(content).toBe([
      'Title\nhttps://youtu.be/abc',
      'my note',
      'Video transcript (YouTube · Some Channel · 2026-10-01 · en):\n'
        + toTranscriptLines(TRANSCRIPT).join('\n'),
    ].join('\n\n'));
  });

  it('truncates a long transcript at a line boundary within the Worker limit', () => {
    const line = '**0:01** · ' + 'ż'.repeat(500);
    const video = { ...VIDEO, transcript: Array(400).fill(line).join('\n') };

    const content = buildContent({ ...base, video });

    expect(byteLength(content)).toBeLessThanOrEqual(MAX_CONTENT_BYTES);
    expect(content).toMatch(/\[Transcript truncated: \d+ of 400 segments saved\]$/);
    expect(content.split('\n').at(-2)).toBe('[0:01] ' + 'ż'.repeat(500));
  });
});

describe('buildTags', () => {
  it('tags video captures with the site', () => {
    expect(buildTags(VIDEO)).toEqual(['video', 'youtube']);
  });

  it('adds no tags without a transcript', () => {
    expect(buildTags(null)).toEqual([]);
    expect(buildTags({ ...VIDEO, transcript: '' })).toEqual([]);
  });
});

import Defuddle from 'defuddle';

// Injected on demand into video pages. The resolved value of main() is what
// scripting.executeScript returns to the caller (see utils/video.js).
export default defineUnlistedScript(async () => {
  try {
    // parseAsync prefers the async extractors (YouTube, Bilibili) that fetch the transcript
    const result = await new Defuddle(document, { url: document.URL }).parseAsync();
    const transcript = result.variables?.transcript;
    if (!transcript) return null;

    return {
      transcript,
      site: result.site || '',
      author: result.author || '',
      published: result.published || '',
      language: result.language || '',
    };
  } catch {
    return null;
  }
});

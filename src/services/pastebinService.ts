import { fetchViaProxy } from './proxyService';

/**
 * Fetches the raw content from a Pastebin URL.
 * @param pastebinUrl The full URL of the Pastebin paste.
 * @returns The raw text content of the paste.
 */
export const fetchContentFromPastebinUrl = async (pastebinUrl: string): Promise<string> => {
  const match = pastebinUrl.match(/pastebin\.com\/(?:raw\/)?(\w+)/);
  const pasteId = match ? match[1] : null;

  if (!pasteId) {
    throw new Error('Could not extract a valid ID from the Pastebin URL.');
  }
  const rawUrl = `https://pastebin.com/raw/${pasteId}`;

  try {
    // Using 'rss' feedType for proxy as it's just fetching text content.
    const { content } = await fetchViaProxy(rawUrl, 'rss');
    return content;
  } catch (error) {
    console.error(`Failed to fetch Pastebin content for ID ${pasteId}:`, error);
    throw new Error(
      `Could not fetch content from Pastebin. The link might be invalid or the service is down. Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

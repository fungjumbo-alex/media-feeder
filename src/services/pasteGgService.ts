import { fetchViaProxy } from './proxyService';

const PASTEGG_API_BASE = 'https://api.paste.gg/v1/pastes';

const getApiKey = (): string => {
  const key = (window as any).process?.env?.PASTEGG_API_KEY;
  if (!key)
    throw new Error(
      'Live Sync feature is not configured by the app developer (missing PASTEGG_API_KEY).'
    );
  return key;
};

const getHeaders = (): Record<string, string> => ({
  Authorization: `Key ${getApiKey()}`,
  'Content-Type': 'application/json',
});

/**
 * Creates a new paste on paste.gg.
 * @param content The string content to paste.
 * @param title A title for the paste.
 * @returns The ID of the newly created paste.
 */
export const createPaste = async (content: string, title: string): Promise<string> => {
  const expiryDate = new Date();
  // Set a very long expiration time, e.g., 10 years from now.
  expiryDate.setFullYear(expiryDate.getFullYear() + 10);

  const body = JSON.stringify({
    name: title,
    description: `Media-Feeder Live Sync Data (reusable)`,
    visibility: 'unlisted',
    expires: expiryDate.toISOString(),
    files: [
      {
        name: 'media-feeder-sync.txt',
        content: {
          format: 'text',
          value: content,
        },
      },
    ],
  });

  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: getHeaders(),
    body: body,
  };

  // Using 'rss' feedType as a generic type for this non-feed API call through the proxy.
  const responseText = await fetchViaProxy(
    PASTEGG_API_BASE,
    'rss',
    undefined,
    undefined,
    undefined,
    undefined,
    fetchOptions
  );

  const result = JSON.parse(responseText);
  const pasteId = result?.result?.id;

  if (!pasteId) {
    throw new Error('paste.gg API did not return a valid ID after creation.');
  }
  return pasteId;
};

/**
 * Deletes an existing paste from paste.gg.
 * @param pasteId The ID of the paste to delete.
 */
export const deletePaste = async (pasteId: string): Promise<void> => {
  const fetchOptions: RequestInit = {
    method: 'DELETE',
    headers: getHeaders(),
  };
  // fetchViaProxy will throw if the status is not ok (e.g., 404, 500).
  // It will succeed for a 204 No Content, returning an empty string which we ignore.
  await fetchViaProxy(
    `${PASTEGG_API_BASE}/${pasteId}`,
    'rss',
    undefined,
    undefined,
    undefined,
    undefined,
    fetchOptions
  );
};

/**
 * Updates an existing paste on paste.gg. This is a "delete and create new" operation
 * as the paste.gg API does not support in-place updates for content.
 * @param oldPasteId The ID of the paste to be replaced.
 * @param newContent The new content for the paste.
 * @param newTitle The new title for the paste.
 * @returns The ID of the newly created paste.
 */
export const updatePaste = async (
  oldPasteId: string,
  newContent: string,
  newTitle: string
): Promise<string> => {
  // paste.gg does not support updating content, so we must delete the old one and create a new one.
  // We wrap this in a try/catch to ensure that even if deletion fails, we proceed with creation.
  try {
    await deletePaste(oldPasteId);
  } catch (e) {
    console.warn(
      `Could not delete old paste ${oldPasteId} during update, a new one will be created anyway.`,
      e
    );
  }

  // Now create a new paste with the updated content.
  return await createPaste(newContent, newTitle);
};


import type { SyncData } from '../types';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3/files';
const APP_DATA_FILE_NAME = 'media-feeder-data-v2.json';

const getHeaders = (accessToken: string) => ({
    'Authorization': `Bearer ${accessToken}`,
    'Accept': 'application/json',
});

/**
 * Verifies that the app has sufficient permissions to access the appDataFolder.
 * It does this by attempting a simple, read-only list operation.
 * @param accessToken The user's OAuth 2.0 access token.
 * @throws An error (specifically an auth error) if permissions are insufficient.
 */
export const verifyDrivePermissions = async (accessToken: string): Promise<void> => {
    const headers = getHeaders(accessToken);
    
    // We only need to check if we can list files, which is a low-impact read operation.
    // We limit fields to 'kind' to get the smallest possible response.
    const verifyUrl = `${DRIVE_API_BASE}?spaces=drive&fields=kind`;
    const response = await fetch(verifyUrl, { headers });
    
    if (!response.ok) {
        // The centralized error handler will check for 401/403 and throw the appropriate error.
        await handleDriveError(response, 'Failed to verify Google Drive permissions.');
    }
    
    // If we get a 200 OK response, permissions are fine.
};

/**
 * A centralized error handler for Google Drive API calls.
 * It checks for authentication errors (401, 403) and throws a specific error type.
 * For other errors, it tries to parse a meaningful message from the response body.
 * @param response The raw Response object from a fetch call.
 * @param defaultMessage A fallback error message.
 */
const handleDriveError = async (response: Response, defaultMessage: string): Promise<never> => {
    // A 401 or 403 from Google's API almost always means the token is invalid or expired.
    if (response.status === 401 || response.status === 403) {
        const errorBody = await response.json().catch(() => null);
        const message = errorBody?.error?.message || "Authentication failed. Your session may have expired. Please sign in again.";
        
        const authError = new Error(message);
        (authError as any).isAuthError = true; // Mark as a general auth error

        // Check for specific permission errors that require re-authorization.
        if (response.status === 403) {
            const hasInsufficientPerms = errorBody?.error?.errors?.some((e: any) => e.reason.includes('insufficientPermissions') || e.reason.includes('forbidden'));
            if (hasInsufficientPerms) {
                authError.message = "App permission for Google Drive is missing. Please re-authenticate.";
                (authError as any).isPermissionError = true;
            }
        }
        
        throw authError;
    }
    
    // For other errors, try to get a more specific message from the response body.
    let errorBody;
    try {
        errorBody = await response.json();
    } catch(e) {
        // If the body can't be parsed, we can't get more details.
        console.error("Could not parse Google Drive error response body.");
        throw new Error(defaultMessage); // Throw the generic message.
    }

    console.error("Google Drive API Error:", errorBody);
    // Use the message from the API if available, otherwise fall back.
    const message = errorBody?.error?.message || defaultMessage;
    throw new Error(message);
};

/**
 * Finds the app's data file in the user's Drive or creates it if it doesn't exist.
 * @param accessToken The user's OAuth 2.0 access token.
 * @returns The ID of the file.
 * @throws An error if the file cannot be found or created.
 */
const getOrCreateFileId = async (accessToken: string): Promise<string> => {
    const headers = getHeaders(accessToken);
    
    // 1. Search for the file in the user's visible Drive.
    const searchUrl = `${DRIVE_API_BASE}?q=name='${APP_DATA_FILE_NAME}' and not trashed&spaces=drive&fields=files(id)`;
    const searchResponse = await fetch(searchUrl, { headers });
    
    if (!searchResponse.ok) {
        return handleDriveError(searchResponse, 'Failed to search for sync file in Google Drive.');
    }

    const searchResult = await searchResponse.json();
    if (searchResult.files && searchResult.files.length > 0) {
        return searchResult.files[0].id;
    }

    // 2. If not found, create it in the root "My Drive" folder.
    const createResponse = await fetch(DRIVE_API_BASE, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: APP_DATA_FILE_NAME,
            description: 'Media-Feeder application data for synchronization.'
        }),
    });

    if (!createResponse.ok) {
        return handleDriveError(createResponse, 'Failed to create sync file in Google Drive.');
    }

    const createResult = await createResponse.json();
    return createResult.id;
};

/**
 * Finds the app's data file and returns its metadata.
 * @param accessToken The user's OAuth 2.0 access token.
 * @returns The file metadata { id, modifiedTime } or null if not found.
 */
export const getDriveFileMetadata = async (accessToken: string): Promise<{ id: string; modifiedTime: string; } | null> => {
    const headers = getHeaders(accessToken);
    const searchUrl = `${DRIVE_API_BASE}?q=name='${APP_DATA_FILE_NAME}' and not trashed&spaces=drive&fields=files(id,modifiedTime)`;
    const searchResponse = await fetch(searchUrl, { headers });

    if (!searchResponse.ok) {
        await handleDriveError(searchResponse, 'Failed to search for sync file in Google Drive.');
        return null; // Unreachable, but for type safety
    }

    const searchResult = await searchResponse.json();
    if (searchResult.files && searchResult.files.length > 0) {
        return searchResult.files[0];
    }
    return null;
};

/**
 * Saves the user's data to a file in their Google Drive.
 * @param data The data to save (feeds, read history, etc.).
 * @param accessToken The user's OAuth 2.0 access token.
 * @returns The modifiedTime of the updated file.
 */
export const saveDataToDrive = async (data: SyncData, accessToken: string): Promise<{ modifiedTime: string }> => {
    const fileId = await getOrCreateFileId(accessToken);
    const uploadUrl = `${DRIVE_UPLOAD_BASE}/${fileId}?uploadType=media&fields=modifiedTime`;

    const response = await fetch(uploadUrl, {
        method: 'PATCH',
        headers: {
            ...getHeaders(accessToken),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    });

    if (!response.ok) {
        await handleDriveError(response, 'Failed to save data to Google Drive.');
    }
    
    return await response.json();
};

/**
 * Loads the user's data from a file in their Google Drive.
 * @param accessToken The user's OAuth 2.0 access token.
 * @returns The loaded data and metadata, or null if no data is found.
 */
export const loadDataFromDrive = async (accessToken: string): Promise<{ data: SyncData | null, metadata: { id: string, modifiedTime: string } | null }> => {
    const metadata = await getDriveFileMetadata(accessToken);
    if (!metadata) {
        return { data: null, metadata: null };
    }

    const downloadUrl = `${DRIVE_API_BASE}/${metadata.id}?alt=media`;
    const response = await fetch(downloadUrl, { headers: getHeaders(accessToken) });

    if (!response.ok) {
        if (response.status === 404) return { data: null, metadata };
        await handleDriveError(response, 'Failed to load data from Google Drive.');
        return { data: null, metadata };
    }

    const textContent = await response.text();
    if (!textContent) {
        return { data: null, metadata };
    }
    
    try {
        const data = JSON.parse(textContent) as SyncData;
        if (data && Array.isArray(data.feeds)) {
            return { data, metadata };
        }
        throw new Error("Loaded data is in an invalid format.");
    } catch(e) {
        console.error("Failed to parse loaded data:", e);
        throw new Error("Could not understand the data loaded from Google Drive.");
    }
};

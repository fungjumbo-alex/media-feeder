# Comments Loading Error Fix

## Problem
When attempting to load YouTube comments, the application was showing a misleading error message:
```
Error loading comments:
All Invidious instances failed to fetch comments. Last error: Failed to fetch transcript from all sources. Last error: Failed to fetch
```

The error message mentioned "transcript" even though we were trying to fetch comments, which was confusing.

## Root Cause
The issue was in the `fetchViaProxy` function in `proxyService.ts`. When all proxy attempts failed, it threw a generic error message that specifically mentioned "transcript" (line 384), even though this function is used for fetching various types of content (transcripts, comments, feeds, etc.).

## Changes Made

### 1. Updated `proxyService.ts` (Line 377-384)
**Changed:** Generic error message from "Failed to fetch transcript from all sources" to "Failed to fetch content from all sources"
**Reason:** Makes the error message applicable to all types of content, not just transcripts
**Impact:** Low complexity - simple string change for better clarity

### 2. Enhanced `youtubeService.ts` - `fetchYouTubeComments` function (Lines 195-245)
**Changes:**
- Increased the number of Invidious instances tried from 3 to 5 for better reliability
- Added detailed console logging to track which instance is being tried
- Added validation to check if response is empty
- Added validation to detect if HTML is returned instead of JSON (indicates blocking/error page)
- Added validation for response structure (checks for `comments` array and `error` field)
- Improved error messages to be more specific about what went wrong

**Reason:** Better debugging, more resilient fetching, and clearer error messages
**Impact:** Medium complexity - adds validation and logging without changing core logic

## Testing Instructions

1. **Build the application:**
   ```bash
   npm run build
   ```
   ✅ Build completed successfully

2. **Test comment loading:**
   - Open the application
   - Navigate to a YouTube video article
   - Try to load comments
   - Check the browser console for detailed logging:
     - You should see `[Comments] Fetching comments for video {videoId} from 5 instances...`
     - You should see which instances are being tried
     - If successful, you'll see `[Comments] Successfully fetched X comments from {instance}`
     - If failed, you'll see specific error messages for each instance

3. **Expected Behavior:**
   - If comments load successfully: Comments should display normally
   - If comments fail to load: Error message should now be more specific and helpful:
     - "Empty response from server"
     - "Received HTML instead of JSON (possible block/error page)"
     - "API returned error: {specific error}"
     - "Invalid response structure: missing comments array"
     - "All Invidious instances failed to fetch comments. Last error: {specific error}"

## Benefits
1. **Better User Experience:** More accurate and helpful error messages
2. **Easier Debugging:** Console logs show exactly which instances are being tried and why they fail
3. **Higher Success Rate:** Tries more instances (5 instead of 3) before giving up
4. **Better Validation:** Detects common failure modes (empty responses, HTML blocks) early

## Notes
- The same `fetchViaProxy` function is used for fetching transcripts, comments, RSS feeds, etc.
- The error message is now generic enough to work for all use cases
- The Invidious instances list is defined in `INVIDIOUS_INSTANCES` constant in `proxyService.ts`
- If all instances fail, it's likely due to:
  1. Network connectivity issues
  2. All Invidious instances being down/blocked
  3. The video having comments disabled
  4. Rate limiting from the instances

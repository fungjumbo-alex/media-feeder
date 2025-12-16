/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';
import { fetchViaProxy, INVIDIOUS_INSTANCES } from './proxyService';
import { fetchTranscript } from './youtubeService';
import type {
  RecommendedFeed,
  DetailedDigest,
  ThematicDigest,
  WebSource,
  AiModel,
  TranscriptLine,
  CaptionChoice,
  StructuredVideoSummary,
  Feed,
  Article,
  MindmapHierarchy,
} from '../types';

let ai: GoogleGenAI | null = null;

export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

// FIX: Modified function to return a `WebSource` object, including the `uri`.
const fetchPageDetails = async (url: string): Promise<WebSource> => {
  try {
    const htmlContent = await fetchViaProxy(url, 'rss'); // Using 'rss' type for general web page fetching
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    const title = doc.querySelector('title')?.textContent || url;
    const description =
      doc.querySelector('meta[name="description"]')?.getAttribute('content') || undefined;

    return { uri: url, title: title.trim(), description: description?.trim() };
  } catch (error) {
    console.warn(`Failed to fetch page details for ${url}:`, error);
    // Fallback to the original URL as the title if fetching fails.
    return { uri: url, title: url };
  }
};

const getAiClient = (): GoogleGenAI => {
  const API_KEY = (window as any).process?.env?.API_KEY;
  if (!API_KEY)
    throw new Error('API_KEY for Gemini is not configured. Please set the environment variable.');
  if (!ai) ai = new GoogleGenAI({ apiKey: API_KEY });
  return ai;
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const generateContentWithRetry = async (
  params: Parameters<InstanceType<typeof GoogleGenAI>['models']['generateContent']>[0],
  maxRetries = 3,
  initialDelay = 2000 // Start with 2 seconds
): Promise<GenerateContentResponse> => {
  let attempt = 0;
  let delay = initialDelay;
  const aiClient = getAiClient();

  while (attempt < maxRetries) {
    try {
      // Create a timeout promise - 300 seconds (5 min - needed for very large mindmap generation)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out after 300 seconds')), 300000);
      });

      // Race the API call against the timeout
      const response = await Promise.race([
        aiClient.models.generateContent(params),
        timeoutPromise,
      ]);

      return response;
    } catch (error: any) {
      let isQuotaError = false;
      let retryAfterSeconds = 0;

      if (
        error &&
        typeof error.message === 'string' &&
        (error.message.includes('429') || error.message.includes('RESOURCE_EXHAUSTED'))
      ) {
        if (error.message.toLowerCase().includes('quota')) {
          isQuotaError = true;
          const retryMatch = error.message.match(/Please retry in (\d+(\.\d+)?)s/);
          if (retryMatch && retryMatch[1]) {
            retryAfterSeconds = parseFloat(retryMatch[1]);
          }
        }
      }

      // Fail fast on timeout
      if (error.message.includes('timed out')) {
        throw error;
      }

      if (attempt >= maxRetries - 1) {
        if (isQuotaError) {
          throw new QuotaExceededError(error.message);
        }
        throw error;
      }

      if (!isQuotaError) {
        // If it's not a quota error and not a timeout (e.g. 500 error), rethrow?
        // But if it's a 400 error (invalid argument), we should probably stop.
        if (error.message.includes('400') || error.message.includes('INVALID_ARGUMENT')) {
          throw error;
        }
      }

      attempt++;

      const jitter = Math.random() * 1000;
      const waitTime = retryAfterSeconds > 0 ? retryAfterSeconds * 1000 + jitter : delay + jitter;

      console.warn(
        `Gemini API error (attempt ${attempt}/${maxRetries}): ${error.message}. Retrying in ${(waitTime / 1000).toFixed(2)}s.`
      );

      await wait(waitTime);

      if (retryAfterSeconds === 0) {
        delay *= 2;
      }
    }
  }
  throw new Error('Exhausted all retries for generateContent.');
};

const verifyAndGetCanonicalUrl = async (url: string): Promise<string | null> => {
  if (!url.includes('youtube.com')) {
    return url;
  }
  try {
    const htmlContent = await fetchViaProxy(url, 'youtube');
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    const canonicalLink = doc.querySelector('link[rel="canonical"]');
    if (canonicalLink) {
      const canonicalUrl = canonicalLink.getAttribute('href');
      if (
        canonicalUrl &&
        (canonicalUrl.includes('/channel/') ||
          canonicalUrl.includes('/c/') ||
          canonicalUrl.includes('/user/') ||
          canonicalUrl.includes('/@'))
      ) {
        return canonicalUrl;
      }
    }

    const ogUrlMeta = doc.querySelector('meta[property="og:url"]');
    if (ogUrlMeta) {
      const ogUrl = ogUrlMeta.getAttribute('content');
      if (
        ogUrl &&
        (ogUrl.includes('/channel/') ||
          ogUrl.includes('/c/') ||
          ogUrl.includes('/user/') ||
          ogUrl.includes('/@'))
      ) {
        return ogUrl;
      }
    }

    const channelIdMatch = htmlContent.match(/"channelId":"(UC[\w-]{22})"/);
    if (channelIdMatch) {
      return url;
    }

    return null;
  } catch (error) {
    console.warn(`Failed to verify YouTube URL ${url}:`, error);
    return null;
  }
};

const parseInvidiousTranscript = (content: string): TranscriptLine[] => {
  if (!content || !content.trim()) {
    return [];
  }

  // Handle Data URI if returned by proxy/instance
  if (content.trim().startsWith('data:')) {
    const base64Marker = ';base64,';
    const markerIndex = content.indexOf(base64Marker);
    if (markerIndex !== -1) {
      const base64 = content.substring(markerIndex + base64Marker.length);
      try {
        content = atob(base64);
      } catch (e) {
        console.warn('Failed to decode base64 transcript content', e);
      }
    } else {
      const commaIndex = content.indexOf(',');
      if (commaIndex !== -1) {
        content = decodeURIComponent(content.substring(commaIndex + 1));
      }
    }
  }

  // Handle YouTube's XML format
  if (content.trim().startsWith('<?xml') || content.trim().startsWith('<transcript>')) {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(content, 'text/xml');
      const textNodes = xmlDoc.querySelectorAll('text');

      if (textNodes.length === 0) {
        throw new Error('No text nodes found in XML transcript');
      }

      return Array.from(textNodes).map(node => {
        const text = node.textContent || '';
        const start = parseFloat(node.getAttribute('start') || '0');
        const dur = parseFloat(node.getAttribute('dur') || '0');

        return {
          text: text
            .replace(/&amp;#39;/g, "'")
            .replace(/&amp;quot;/g, '"')
            .replace(/&amp;/g, '&'),
          start,
          duration: dur,
        };
      });
    } catch (e) {
      throw new Error(
        `Failed to parse XML transcript: ${e instanceof Error ? e.message : 'Invalid format.'}`
      );
    }
  }

  if (content.trim().startsWith('WEBVTT')) {
    try {
      const parseVTTTimestamp = (timestamp: string): number => {
        const parts = timestamp.split(':');
        let seconds = 0;
        if (parts.length === 3) {
          seconds =
            parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
        } else if (parts.length === 2) {
          seconds = parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
        }
        return seconds;
      };

      const lines = content.split('\n');
      const transcript: TranscriptLine[] = [];
      let i = 0;

      while (i < lines.length && !lines[i].includes('-->')) {
        i++;
      }

      while (i < lines.length) {
        const timeLine = lines[i];
        if (timeLine.includes('-->')) {
          const [startTimeStr, endTimeStr] = timeLine.split(' --> ');
          const startSeconds = parseVTTTimestamp(startTimeStr);
          const endSeconds = parseVTTTimestamp(endTimeStr.split(' ')[0]);

          i++;
          let text = '';
          while (i < lines.length && lines[i].trim() !== '') {
            text += lines[i].trim() + ' ';
            i++;
          }

          if (text) {
            transcript.push({
              text: text.trim().replace(/<[^>]+>/g, ''),
              start: startSeconds,
              duration: endSeconds - startSeconds,
            });
          }
        }
        i++;
      }
      return transcript;
    } catch (e) {
      throw new Error(
        `Failed to parse WEBVTT transcript: ${e instanceof Error ? e.message : 'Invalid format.'}`
      );
    }
  }

  try {
    const trimmed = content.trim();
    if (trimmed.startsWith('<html') || trimmed.startsWith('<!DOCTYPE')) {
      throw new Error('Received HTML instead of JSON/XML (likely an error page).');
    }
    const data = JSON.parse(content);

    // Support YouTube native 'json3' format (events)
    if (data.events && Array.isArray(data.events)) {
      return data.events
        .filter((event: any) => event.segs && event.segs.length > 0)
        .map((event: any) => {
          const text = event.segs
            .map((seg: any) => seg.utf8)
            .join('')
            .trim();
          return {
            text: text,
            start: (event.tStartMs || 0) / 1000,
            duration: (event.dDurationMs || 0) / 1000,
          };
        })
        .filter((line: any) => line.text.length > 0);
    }

    if (data && Array.isArray(data.captions)) {
      return data.captions.map((line: any) => ({
        text: line.text,
        start: line.start / 1000,
        duration: line.duration / 1000,
      }));
    }
    throw new Error('Invalid transcript format: neither "captions" nor "events" found.');
  } catch (e) {
    throw new Error(
      `Failed to parse transcript: ${e instanceof Error ? e.message : 'Invalid JSON format.'}`
    );
  }
};

// Helper: Fetch captions from Invidious instances
const fetchCaptionsFromInvidious = async (videoId: string): Promise<CaptionChoice[]> => {
  let lastError: unknown = null;

  // Try up to 3 instances for better performance
  for (const instance of INVIDIOUS_INSTANCES.slice(0, 3)) {
    try {
      const captionsListUrl = `${instance}/api/v1/captions/${videoId}`;
      const content = await fetchViaProxy(captionsListUrl, 'youtube');

      // Check if content is empty or invalid before parsing
      if (!content || content.trim() === '') {
        throw new Error(`Empty response from ${instance}`);
      }

      let data;
      try {
        data = JSON.parse(content);
      } catch (parseError) {
        throw new Error(
          `Invalid JSON response from ${instance}: ${parseError instanceof Error ? parseError.message : 'Parse failed'}`
        );
      }

      const captionsArray = Array.isArray(data) ? data : data?.captions;
      if (Array.isArray(captionsArray)) {
        if (captionsArray.length > 0) {
          return captionsArray.map((track: any) => ({
            label: track.label,
            language_code: track.languageCode || track.language_code,
            url: `${instance}${track.url}`,
          }));
        }
        // If we successfully got a response but there are no captions, return empty
        return [];
      }
      throw new Error(`Invalid caption list data structure from ${instance}`);
    } catch (error) {
      lastError = error;
      // Continue to next instance
    }
  }

  if (lastError) {
    const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`Invidious fetch failed: ${errorMessage}`);
  }
  return [];
};

// Helper: Fetch transcript from our local/serverless backend
const fetchCaptionsFromBackend = async (videoId: string): Promise<CaptionChoice[]> => {
  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log('[Transcript] Attempting backend fetch for:', videoUrl);
    const snippets = await fetchTranscript(videoUrl);

    if (snippets && snippets.length > 0) {
      return [
        {
          label: 'English (Backend)',
          language_code: 'en',
          url: `backend-transcript:${videoId}`, // Special marker
        },
      ];
    }
    throw new Error('Backend returned empty transcript');
  } catch (error) {
    throw new Error(
      `Backend fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

// Main function: Try multiple sources with fallback
export const fetchAvailableCaptionChoices = async (videoId: string): Promise<CaptionChoice[]> => {
  if (!videoId) return [];

  const errors: string[] = [];
  let hasRateLimitError = false;

  // Method 0: Try our Backend first (Primary Method)
  try {
    console.log('[Transcript] Attempting backend API...');
    const choices = await fetchCaptionsFromBackend(videoId);
    if (choices.length > 0) {
      console.log(`[Transcript] ✓ Primary fetch succeeded with ${choices.length} caption(s)`);
      return choices;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(`Backend API: ${errorMsg}`);
    console.warn('[Transcript] ✗ Backend API failed:', errorMsg);
  }

  // Method 1: Try Invidious instances
  try {
    console.log('[Transcript] Attempting Invidious instances...');
    const choices = await fetchCaptionsFromInvidious(videoId);
    if (choices.length > 0) {
      console.log(`[Transcript] ✓ Invidious fetch succeeded with ${choices.length} caption(s)`);
      return choices;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('429') || errorMsg.toLowerCase().includes('rate limit')) {
      hasRateLimitError = true;
    }
    errors.push(`Invidious: ${errorMsg}`);
    console.warn('[Transcript] ✗ Invidious fetch failed:', errorMsg);
  }

  // If all methods failed, throw comprehensive error
  let errorMessage = `All transcript sources failed. Errors:\n${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`;

  if (hasRateLimitError) {
    errorMessage +=
      '\n\nNote: Rate limiting detected. Please wait a few minutes before trying again.';
  }

  throw new Error(errorMessage);
};

export const fetchAndParseTranscript = async (url: string): Promise<TranscriptLine[]> => {
  // Case 0: Custom backend marker
  if (url.startsWith('backend-transcript:')) {
    const videoId = url.replace('backend-transcript:', '');
    try {
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const snippets = await fetchTranscript(videoUrl);
      return snippets.map(s => ({
        text: s.text,
        start: s.start,
        duration: s.duration,
      }));
    } catch (error) {
      throw new Error(
        `Failed to fetch from backend API: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Handle YouTube direct URLs (baseUrl from ytInitialPlayerResponse)
  if (url.includes('youtube.com') && !url.includes('/api/v1/')) {
    try {
      const content = await fetchViaProxy(url, 'youtube');

      if (!content || content.trim() === '') {
        throw new Error('Received empty transcript content from YouTube');
      }

      if (content.trim().startsWith('<html') || content.trim().startsWith('<!DOCTYPE')) {
        throw new Error('YouTube returned an error page (likely rate limited or 404).');
      }

      // YouTube returns XML format, parse it
      return parseInvidiousTranscript(content);
    } catch (error) {
      throw new Error(
        `Failed to fetch from YouTube direct: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Handle Invidious URLs (existing behavior)
  const content = await fetchViaProxy(url, 'youtube');

  // Check if content is empty or invalid before parsing
  if (!content || content.trim() === '') {
    throw new Error('Received empty transcript content from server');
  }

  if (content.trim().startsWith('<html') || content.trim().startsWith('<!DOCTYPE')) {
    throw new Error('Server returned an error page (likely rate limited or 500).');
  }

  return parseInvidiousTranscript(content);
};

export const summarizeText = async (
  text: string,
  link: string | null,
  model: AiModel,
  targetLanguage: string,
  contentType: 'article' | 'video' = 'article'
): Promise<{ summary: string; sources: WebSource[] }> => {
  let systemInstruction = `You are an expert summarizer. Your goal is to provide a highly detailed and thorough summary of the provided text.
    - The summary must be comprehensive, meticulously capturing all main points, key arguments, supporting details, important examples, findings, and conclusions.
    - Structure the summary into multiple, well-developed paragraphs to ensure it is easy to read and understand. Aim for a substantial summary, not a brief overview.
    - Do not use lists or bullet points. The output should be narrative prose.
    - Respond only with the summary text itself. Do not include any introductory or concluding phrases like "Here is the summary:" or "In conclusion...".`;

  if (targetLanguage && targetLanguage !== 'original') {
    systemInstruction += `\n- If the original text is not in ${targetLanguage}, please translate the final summary into ${targetLanguage}.`;
  }

  const contents = `Please summarize the following ${contentType} content:\n\n---\n\n${text.substring(0, 30000)}\n\n---`;
  const config: any = { systemInstruction, tools: [] };
  if (link && !link.includes('youtube.com') && !link.includes('youtu.be')) {
    config.tools.push({ googleSearch: {} });
  }
  const response = await generateContentWithRetry({ model, contents, config });
  const summary = response.text || '';
  if (!summary) throw new Error('AI did not return a summary.');

  let sources: WebSource[] = [];
  if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
    const uniqueSources = new Map<string, { title: string }>();
    response.candidates[0].groundingMetadata.groundingChunks.forEach(chunk => {
      if (chunk.web) {
        const { uri, title } = chunk.web;
        if (uri && !uniqueSources.has(uri)) uniqueSources.set(uri, { title: title || uri });
      }
    });
    sources = await Promise.all(Array.from(uniqueSources.keys()).map(fetchPageDetails));
  }
  return { summary, sources };
};

export const summarizeYouTubeVideo = async (
  videoTitle: string,
  transcript: TranscriptLine[],
  model: AiModel,
  targetLanguage: string
): Promise<{ summary: StructuredVideoSummary; sources: WebSource[] }> => {
  const fullTranscriptText = transcript.map(line => line.text).join(' ');
  let systemInstruction = `You are an expert at summarizing YouTube video transcripts.
    Your task is to:
    1. Create a comprehensive, engaging, and detailed overall summary of the video's content. It should be at least two paragraphs long.
    2. Identify 5-7 key moments or sections. For each section, provide:
        a. A precise timestamp (in seconds) corresponding to the start of the section in the transcript.
        b. A concise, descriptive title for the section.
        c. A detailed summary for that section, about 2-4 sentences long.
    - Base your summary *only* on the provided transcript and title. Do not invent information or infer content not present.
    - For timestamps, use the start time of the relevant transcript segment. Pick the most representative start time for the topic.
    - Respond only with the JSON object. Do not include any introductory phrases or markdown formatting.`;

  if (targetLanguage && targetLanguage !== 'original') {
    systemInstruction += `\n- If the original transcript is not in ${targetLanguage}, please translate the 'overallSummary', and the 'title' and 'summary' for each section into ${targetLanguage}.`;
  }

  const contents = `Video Title: ${videoTitle}\n\nTranscript:\n${fullTranscriptText.substring(0, 50000)}`;

  const response = await generateContentWithRetry({
    model,
    contents,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overallSummary: { type: Type.STRING },
          sections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                timestamp: { type: Type.NUMBER },
                title: { type: Type.STRING },
                summary: { type: Type.STRING },
              },
              required: ['timestamp', 'title', 'summary'],
            },
          },
        },
        required: ['overallSummary', 'sections'],
      },
    },
  });

  const summaryJson = JSON.parse(response.text || '{}');
  if (!summaryJson.overallSummary || !Array.isArray(summaryJson.sections)) {
    throw new Error('AI returned an invalid format for the structured summary.');
  }

  summaryJson.sections.sort((a: any, b: any) => a.timestamp - b.timestamp);

  return {
    summary: summaryJson as StructuredVideoSummary,
    sources: [], // YouTube summary doesn't use web grounding.
  };
};

export const generateRecommendations = async (
  feeds: Feed[],
  historyArticles: Article[],
  model: AiModel,
  customQuery?: string,
  existingRecUrls?: string[]
): Promise<{ recommendations: RecommendedFeed[] }> => {
  const systemInstruction = `You are a content recommendation expert. Your goal is to suggest new YouTube channels or RSS feeds based on the user's current subscriptions and reading history.
    - Analyze the provided titles of subscriptions and recently read articles.
    - Find diverse, high-quality, and relevant new sources.
    - Provide a brief, compelling reason for each recommendation.
    - If the user provides a custom query, prioritize recommendations that match it.
    - If a list of existing recommendations is provided, do not suggest the same URLs again.
    - Respond only with the JSON object.`;

  const feedTitles = feeds.map(f => f.title).join(', ');
  const articleTitles = historyArticles
    .slice(0, 30)
    .map(a => a.title)
    .join(', ');

  let contents = `Current Subscriptions:\n${feedTitles}\n\nRecently Read Articles:\n${articleTitles}\n\n`;
  if (customQuery) {
    contents += `User's specific request: "${customQuery}"\n\n`;
  }
  if (existingRecUrls && existingRecUrls.length > 0) {
    contents += `Do not recommend these URLs again:\n${existingRecUrls.join('\n')}\n\n`;
  }
  contents += `Please recommend 5 new feeds.`;

  const response = await generateContentWithRetry({
    model,
    contents,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          recommendations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                url: { type: Type.STRING },
                reason: { type: Type.STRING },
              },
              required: ['title', 'url', 'reason'],
            },
          },
        },
        required: ['recommendations'],
      },
    },
  });

  const recommendationsJson = JSON.parse(response.text || '{}');
  if (!recommendationsJson.recommendations || !Array.isArray(recommendationsJson.recommendations)) {
    throw new Error('AI returned an invalid format for recommendations.');
  }

  return recommendationsJson;
};

export const generateRelatedChannels = async (
  sourceFeed: Feed,
  existingUrls: string[],
  model: AiModel
): Promise<{ recommendations: RecommendedFeed[] }> => {
  const systemInstruction = `You are a YouTube channel recommendation expert. Based on the provided channel's title and description, suggest 5 similar channels that the user might enjoy.
    - For each recommendation, provide the channel title, its YouTube URL, and a brief reason why it's a good match.
    - Do not recommend channels that are already in the user's subscription list.
    - Respond only with the JSON object.`;

  const contents = `Find channels related to this one:
    Title: ${sourceFeed.title}
    Description: ${sourceFeed.description || ''}
    
    Do not include any of these URLs in your recommendations:
    ${existingUrls.join('\n')}
    
    Please provide 5 recommendations.`;

  const response = await generateContentWithRetry({
    model,
    contents,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          recommendations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                url: { type: Type.STRING },
                reason: { type: Type.STRING },
              },
              required: ['title', 'url', 'reason'],
            },
          },
        },
        required: ['recommendations'],
      },
    },
  });

  const recommendationsJson = JSON.parse(response.text || '{}');
  if (!recommendationsJson.recommendations || !Array.isArray(recommendationsJson.recommendations)) {
    throw new Error('AI returned an invalid format for related channels.');
  }

  // Post-processing to ensure URLs are valid channel URLs
  const validatedRecommendations = await Promise.all(
    (recommendationsJson.recommendations as RecommendedFeed[]).map(async rec => {
      const canonicalUrl = await verifyAndGetCanonicalUrl(rec.url);
      return canonicalUrl ? { ...rec, url: canonicalUrl } : null;
    })
  );

  return {
    recommendations: validatedRecommendations.filter((r): r is RecommendedFeed => r !== null),
  };
};

export const generateThematicDigest = async (
  articles: Article[],
  model: AiModel
): Promise<ThematicDigest> => {
  const systemInstruction = `You are an expert at creating thematic digests. Your task is to analyze a list of articles, group them by common themes, and provide detailed, comprehensive summaries for each theme.
    - Identify 2-4 main themes present in the articles.
    - For each theme, provide:
      * A clear, descriptive title
      * A DETAILED summary (3-5 paragraphs) that:
        - Explains the overarching theme and why it's significant
        - Synthesizes the key points and insights from all articles in this theme
        - Highlights important trends, patterns, or connections between the articles
        - Provides analysis and context, not just a list of facts
        - Discusses implications or potential impacts when relevant
      * A list of relevant keywords
      * The articles that fall under this theme
    - Create a main, overarching title for the entire digest.
    - Respond only with the JSON object.`;

  const articleInfo = articles
    .map(a => `- Title: ${a.title}\n  Description: ${a.description.substring(0, 200)}...`)
    .join('\n');
  const contents = `Here is a list of articles:\n\n${articleInfo}\n\nPlease create a thematic digest based on them.`;

  const response = await generateContentWithRetry({
    model,
    contents,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          digestTitle: { type: Type.STRING },
          themedGroups: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                themeTitle: { type: Type.STRING },
                themeSummary: { type: Type.STRING },
                keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                articles: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                    },
                    required: ['title'],
                  },
                },
              },
              required: ['themeTitle', 'themeSummary', 'keywords', 'articles'],
            },
          },
        },
        required: ['digestTitle', 'themedGroups'],
      },
    },
  });

  const digestJson = JSON.parse(response.text || '{}');
  if (!digestJson.digestTitle || !Array.isArray(digestJson.themedGroups)) {
    throw new Error('AI returned an invalid format for the thematic digest.');
  }

  // Map article titles from response back to full article objects
  const articlesByTitle = new Map(articles.map(a => [a.title, a]));
  digestJson.themedGroups.forEach((group: any) => {
    group.articles = group.articles
      .map((articleInfo: { title: string }) => {
        const fullArticle = articlesByTitle.get(articleInfo.title);
        return fullArticle
          ? {
            id: fullArticle.id,
            feedId: fullArticle.feedId,
            title: fullArticle.title,
            link: fullArticle.link,
          }
          : null;
      })
      .filter((a: any) => a !== null);
  });

  return digestJson as ThematicDigest;
};

export const translateText = async (
  text: string,
  targetLanguage: string,
  model: AiModel
): Promise<string> => {
  const systemInstruction = `You are a helpful translation assistant. Translate the given text into ${targetLanguage}.
    - Respond only with the translated text. Do not add any extra phrases like "Here is the translation:".
    - Preserve the original formatting (e.g., paragraphs) as best as possible.`;

  const contents = text;

  const response = await generateContentWithRetry({
    model,
    contents,
    config: { systemInstruction },
  });
  const translatedText = response.text;

  if (!translatedText) throw new Error('Translation failed: AI did not return any text.');

  return translatedText;
};

export const translateStructuredSummary = async (
  summary: StructuredVideoSummary,
  targetLanguage: string,
  model: AiModel
): Promise<StructuredVideoSummary> => {
  const systemInstruction = `You are a translation assistant specializing in structured summaries. Translate the 'overallSummary', and the 'title' and 'summary' for each section into ${targetLanguage}.
    - Respond *only* with the translated JSON object, maintaining the original structure and keys.
    - Keep the 'timestamp' values exactly as they are.`;

  const contents = JSON.stringify(summary);

  const response = await generateContentWithRetry({
    model,
    contents,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overallSummary: { type: Type.STRING },
          sections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                timestamp: { type: Type.NUMBER },
                title: { type: Type.STRING },
                summary: { type: Type.STRING },
              },
              required: ['timestamp', 'title', 'summary'],
            },
          },
        },
        required: ['overallSummary', 'sections'],
      },
    },
  });

  const translatedJson = JSON.parse(response.text || '{}');
  if (!translatedJson.overallSummary || !Array.isArray(translatedJson.sections)) {
    throw new Error('AI returned an invalid format for the translated structured summary.');
  }

  return translatedJson as StructuredVideoSummary;
};

export const translateDetailedDigest = async (
  digest: DetailedDigest,
  targetLanguage: string,
  model: AiModel
): Promise<DetailedDigest> => {
  const translationPromises = digest.map(async item => {
    if (typeof item.summary === 'string') {
      const translatedSummary = await translateText(item.summary, targetLanguage, model);
      return { ...item, summary: translatedSummary };
    } else {
      const translatedStructuredSummary = await translateStructuredSummary(
        item.summary,
        targetLanguage,
        model
      );
      return { ...item, summary: translatedStructuredSummary };
    }
  });

  return Promise.all(translationPromises);
};

export const translateThematicDigest = async (
  digest: ThematicDigest,
  targetLanguage: string,
  model: AiModel
): Promise<ThematicDigest> => {
  const systemInstruction = `You are a translation assistant. Translate the 'digestTitle', and the 'themeTitle' and 'themeSummary' for each group into ${targetLanguage}.
    - Do NOT translate the 'keywords' or any article 'title' or 'link'.
    - Respond *only* with the translated JSON object, maintaining the original structure.`;

  const contents = JSON.stringify(digest);

  const response = await generateContentWithRetry({
    model,
    contents,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          digestTitle: { type: Type.STRING },
          themedGroups: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                themeTitle: { type: Type.STRING },
                themeSummary: { type: Type.STRING },
                keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                articles: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      feedId: { type: Type.STRING },
                      title: { type: Type.STRING },
                      link: { type: Type.STRING },
                    },
                    required: ['id', 'feedId', 'title'],
                  },
                },
              },
              required: ['themeTitle', 'themeSummary', 'keywords', 'articles'],
            },
          },
        },
        required: ['digestTitle', 'themedGroups'],
      },
    },
  });

  const translatedJson = JSON.parse(response.text || '{}');
  if (!translatedJson.digestTitle || !Array.isArray(translatedJson.themedGroups)) {
    throw new Error('AI returned an invalid format for the translated thematic digest.');
  }

  return translatedJson as ThematicDigest;
};

export const generatePageViewDigest = async (
  articles: { id: string; feedId: string; title: string; link: string | null; content: string }[],
  model: AiModel
): Promise<{ digestTitle: string; digestContent: string }> => {
  const systemInstruction = `You are an expert at synthesizing information. Your task is to analyze a list of article titles and brief descriptions, then generate a single, cohesive digest in Markdown format.
    - Start with an overall title for the digest (e.g., "Digest of Recent Tech News").
    - Group related articles under thematic subheadings (e.g., "## AI Developments").
    - Under each subheading, write a 1-2 paragraph summary of that theme.
    - After the summary, list the relevant articles as bullet points with Markdown links.
    - Respond only with the generated title and content.`;

  const articleInfo = articles
    .map(a => `- Title: ${a.title}\n  Content Preview: ${a.content.substring(0, 200)}...`)
    .join('\n');
  const contents = `Here is a list of articles from the current view:\n\n${articleInfo}\n\nPlease create a digest of this page view.`;

  const response = await generateContentWithRetry({
    model,
    contents,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          digestTitle: { type: Type.STRING },
          digestContent: {
            type: Type.STRING,
            description: 'The full digest content in Markdown format.',
          },
        },
        required: ['digestTitle', 'digestContent'],
      },
    },
  });

  const digestJson = JSON.parse(response.text || '{}');
  if (!digestJson.digestTitle || !digestJson.digestContent) {
    throw new Error('AI returned an invalid format for the page view digest.');
  }

  // Add source links to the bottom of the content
  const sourceLinks = articles.map(a => `- [${a.title}](${a.link})`).join('\n');
  digestJson.digestContent += `\n\n---\n\n## Original Sources\n${sourceLinks}`;

  return digestJson;
};

export const generateMindmapHierarchy = async (
  articles: Article[],
  model: AiModel,
  targetLanguage: string = 'English'
): Promise<MindmapHierarchy> => {
  console.log(`[AI Clustering] Processing ${articles.length} articles`);

  if (articles.length === 0) {
    throw new Error('No articles provided for clustering');
  }

  // Sort by date (newest first) to prioritize latest content
  let articlesToProcess = articles.sort(
    (a, b) => (b.pubDateTimestamp || 0) - (a.pubDateTimestamp || 0)
  );

  const MAX_RETRIES = 3;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      let systemInstruction = `You are a JSON generator. Your ONLY task is to group these articles into topics.
    - Prioritize the latest/newest videos when forming groups or choosing representative titles.
    - Group articles that discuss the same or very similar events/topics.

Output strictly valid JSON. NO explanations. NO thinking.

Format:
{
  "rootTopics": [
    {
      "title": "Topic",
      "subTopics": [
        { "title": "Subtopic", "articleIds": ["id1"] }
      ],
      "articleIds": []
    }
  ]
}

IMPORTANT CONSTRAINTS:
1. Each article ID from the input list must appear EXACTLY ONCE in the entire JSON output.
2. Assign each article to the single most relevant subtopic.
3. Do NOT repeat article IDs across multiple topics or subtopics.
4. If an article doesn't fit well, put it in a "Miscellaneous" topic.`;

      if (targetLanguage && targetLanguage !== 'original') {
        systemInstruction += `\n\nIMPORTANT: All "title" fields in the JSON output MUST be translated into ${targetLanguage}.`;
      }

      const articleList = articlesToProcess.map(a => `${a.id}|${a.title}`).join('\n');

      // Reduced context for retry attempts
      const contents = `Group these ${articlesToProcess.length} articles into 3-8 topics. The input format is ID|Title:\n${articleList}`;

      console.log(
        `[AI Clustering] Sending request to ${model} with ${contents.length} characters for ${articlesToProcess.length} articles (Attempt ${attempt + 1})`
      );

      const response = await generateContentWithRetry({
        model,
        contents,
        config: {
          systemInstruction,
          maxOutputTokens: 16384,
          thinkingConfig: {
            thinkingBudget: 0, // Disable extended thinking to prevent token exhaustion
          },
        },
      });

      // Check if response is valid
      if (!response || !response.candidates || response.candidates.length === 0) {
        throw new Error('AI returned an empty response. Please check your API key and quota.');
      }

      // Extract text from the response
      const candidate = response.candidates[0];

      // Check for MAX_TOKENS finish reason
      if (candidate.finishReason === 'MAX_TOKENS') {
        throw new Error('MAX_TOKENS_LIMIT');
      }

      if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
        const reason = candidate.finishReason || 'UNKNOWN';
        throw new Error(`AI response has no content. Finish reason: ${reason}.`);
      }

      let jsonString = candidate.content.parts[0].text || '{}';
      jsonString = jsonString.replace(/```json\n/g, '').replace(/```/g, '');

      let hierarchyJson = JSON.parse(jsonString);

      // Robust parsing
      if (Array.isArray(hierarchyJson)) {
        hierarchyJson = { rootTopics: hierarchyJson };
      }

      if (!hierarchyJson.rootTopics || !Array.isArray(hierarchyJson.rootTopics)) {
        throw new Error('AI returned an invalid format for the mindmap hierarchy.');
      }

      return hierarchyJson as MindmapHierarchy;
    } catch (error: any) {
      if (
        (error.message &&
          (error.message.includes('MAX_TOKENS') || error.message.includes('too complex'))) ||
        error.message === 'MAX_TOKENS_LIMIT'
      ) {
        console.warn(`[AI Clustering] Hit token limit with ${articlesToProcess.length} articles.`);

        attempt++;
        if (attempt >= MAX_RETRIES) {
          throw new Error(
            'The mindmap is too complex even after reducing the dataset. Please try submitting fewer articles.'
          );
        }

        // Reduce dataset by ~40% for next attempt, keeping newest
        const newSize = Math.max(5, Math.floor(articlesToProcess.length * 0.6));
        if (newSize >= articlesToProcess.length) {
          throw error; // Cannot reduce further substantial amount
        }

        console.log(`[AI Clustering] Retrying with ${newSize} articles...`);
        articlesToProcess = articlesToProcess.slice(0, newSize);
        continue;
      }

      // If it's not a token limit error, rethrow immediately
      console.error('Failed to parse AI response:', error);
      throw new Error('Failed to generate mindmap hierarchy: ' + error.message);
    }
  }

  throw new Error('Failed to generate mindmap.');
};

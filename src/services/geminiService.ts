import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { fetchViaProxy, INVIDIOUS_INSTANCES } from './proxyService';
import type { RecommendedFeed, HistoryDigest, WebSource, AiModel, TranscriptLine, CaptionChoice, StructuredVideoSummary, Feed, Article, SummarySection } from '../types';

const API_KEY = process.env.API_KEY;
let ai: GoogleGenAI | null = null;

// Helper function to replicate Promise.any for older environments.
const promiseAny = <T>(promises: Promise<T>[]): Promise<T> => {
    return new Promise((resolve, reject) => {
        const errors: any[] = [];
        let rejectedCount = 0;

        if (promises.length === 0) {
            // AggregateError might not be available, so we use a generic error.
            reject(new Error("All promises were rejected: No promises were provided."));
            return;
        }

        promises.forEach((promise, index) => {
            Promise.resolve(promise)
                .then(resolve) // Resolves as soon as the first promise resolves
                .catch(error => {
                    errors[index] = error;
                    rejectedCount++;
                    if (rejectedCount === promises.length) {
                        // All promises rejected. Using a generic error as AggregateError might not be available.
                        reject(new Error("All promises were rejected."));
                    }
                });
        });
    });
};

const getAiClient = (): GoogleGenAI => {
    if (!API_KEY) throw new Error("API_KEY for Gemini is not configured. Please set the environment variable.");
    if (!ai) ai = new GoogleGenAI({ apiKey: API_KEY });
    return ai;
};

const sanitizeSourceUrl = (url: string): string => {
    if (url.includes('vertexaisearch.cloud.google.com/deeplink')) {
        try {
            const urlObject = new URL(url);
            // The parameter for the target URL can be 'u' or 'url'.
            const targetUrl = urlObject.searchParams.get('u') || urlObject.searchParams.get('url');
            if (targetUrl) {
                // It's typically URL-encoded.
                return decodeURIComponent(targetUrl);
            }
        } catch (e) {
            console.warn(`Could not parse and sanitize Vertex AI Search URL: ${url}`, e);
        }
    }
    return url;
};


/**
 * Verifies a YouTube channel URL by fetching its content and extracting the canonical URL.
 * @param url The YouTube URL to verify.
 * @returns The canonical URL if valid, otherwise null.
 */
const verifyAndGetCanonicalUrl = async (url: string): Promise<string | null> => {
    if (!url.includes('youtube.com')) {
        return url; // Not a YouTube URL, return as is.
    }
    try {
        const htmlContent = await fetchViaProxy(url, 'youtube');
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');

        const canonicalLink = doc.querySelector('link[rel="canonical"]');
        if (canonicalLink) {
            const canonicalUrl = canonicalLink.getAttribute('href');
            // A valid canonical URL for a channel page.
            if (canonicalUrl && (canonicalUrl.includes('/channel/') || canonicalUrl.includes('/c/') || canonicalUrl.includes('/user/') || canonicalUrl.includes('/@'))) {
                return canonicalUrl;
            }
        }
        
        const ogUrlMeta = doc.querySelector('meta[property="og:url"]');
        if (ogUrlMeta) {
            const ogUrl = ogUrlMeta.getAttribute('content');
            if (ogUrl && (ogUrl.includes('/channel/') || ogUrl.includes('/c/') || ogUrl.includes('/user/') || ogUrl.includes('/@'))) {
                return ogUrl;
            }
        }
        
        // As a fallback, confirm it's a valid page by finding a channel ID in the content.
        const channelIdMatch = htmlContent.match(/"channelId":"(UC[\w-]{22})"/);
        if (channelIdMatch) {
            return url; // The page seems valid, so return the original URL.
        }

        console.warn(`Could not confirm YouTube channel validity for URL: ${url}`);
        return null; // Could not be verified as a valid channel page.

    } catch (error) {
        console.warn(`Failed to verify YouTube URL ${url}:`, error);
        return null; // Return null on fetch error.
    }
};

const timeToSeconds = (time: string): number => {
    const parts = time.split(':').map(part => parseFloat(part.replace(',', '.')));
    let seconds = 0;
    if (parts.length === 3) {
        seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
        seconds = parts[0] * 60 + parts[1];
    } else if (parts.length === 1) {
        seconds = parts[0];
    }
    return seconds;
};

const parseVtt = (vtt: string): TranscriptLine[] => {
    const lines = vtt.split('\n');
    const transcript: TranscriptLine[] = [];
    let i = 0;

    while (i < lines.length && !lines[i].includes('-->')) {
        i++;
    }

    while (i < lines.length) {
        const timeLine = lines[i];
        if (timeLine.includes('-->')) {
            const timeParts = timeLine.split(' --> ');
            if (timeParts.length === 2) {
                const start = timeToSeconds(timeParts[0]);
                const end = timeToSeconds(timeParts[1]);
                i++;
                let text = '';
                while (i < lines.length && lines[i].trim() !== '') {
                    text += (text ? ' ' : '') + lines[i].trim();
                    i++;
                }
                transcript.push({
                    text: text.replace(/<[^>]*>/g, ''),
                    start,
                    duration: end - start,
                });
            }
        }
        i++;
    }
    return transcript;
};

const parseTtml = (ttml: string): TranscriptLine[] => {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(ttml, 'application/xml');
        const lines = Array.from(doc.querySelectorAll('p'));
        const transcript: TranscriptLine[] = [];

        const parseTimeValue = (time: string | null): number | null => {
            if (!time) return null;
            if (time.endsWith('s')) return parseFloat(time.slice(0, -1));
            if (time.endsWith('ms')) return parseFloat(time.slice(0, -2)) / 1000;
            const parts = time.split(':');
            if (parts.length === 3) {
                 const secondsParts = parts[2].split('.');
                const hours = parseInt(parts[0], 10);
                const minutes = parseInt(parts[1], 10);
                const seconds = parseInt(secondsParts[0], 10);
                const milliseconds = secondsParts.length > 1 ? parseInt(secondsParts[1], 10) : 0;
                return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
            }
            return parseFloat(time);
        };

        lines.forEach(line => {
            const begin = parseTimeValue(line.getAttribute('begin'));
            const end = parseTimeValue(line.getAttribute('end'));
            const text = line.textContent?.trim() || '';

            if (begin !== null && end !== null && text) {
                transcript.push({
                    text,
                    start: begin,
                    duration: end - begin,
                });
            }
        });

        return transcript;
    } catch (e) {
        console.error("Failed to parse TTML:", e);
        return [];
    }
};

export const fetchAndParseTranscript = async (
    transcriptUrl: string,
): Promise<TranscriptLine[]> => {
    console.log(`[DEBUG] Fetching transcript content via proxy from: ${transcriptUrl}`);
    const captionContent = await fetchViaProxy(transcriptUrl, 'youtube');
    console.log(`[DEBUG] Successfully fetched transcript via proxy.`);

    if (captionContent) {
        if (captionContent.trim().startsWith('WEBVTT')) {
            return parseVtt(captionContent);
        } else if (captionContent.trim().startsWith('<?xml')) {
            return parseTtml(captionContent);
        }
        throw new Error(`Unsupported transcript format received from ${transcriptUrl}`);
    }
    throw new Error('Empty transcript content received.');
};

export const fetchAvailableCaptionChoices = async (videoId: string): Promise<CaptionChoice[]> => {
    console.log('[DEBUG] Fetching available captions for video via Invidious API.');

    const promises = INVIDIOUS_INSTANCES.map(instance => 
        (async () => {
            const captionsListUrl = `${instance}/api/v1/captions/${videoId}`;
            try {
                const content = await fetchViaProxy(captionsListUrl, 'youtube');
                const captionsData = JSON.parse(content);
                const availableCaptions: any[] = captionsData.captions;

                if (!Array.isArray(availableCaptions) || availableCaptions.length === 0) {
                    throw new Error(`No captions array found on instance ${instance}`);
                }

                const choices: CaptionChoice[] = availableCaptions.map(c => ({
                    label: c.label,
                    language_code: c.language_code || 'unknown',
                    url: new URL(c.url, instance).href
                }));
                
                if (choices.length === 0) {
                     throw new Error(`No captions found on instance ${instance}`);
                }

                return choices;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`[DEBUG] Caption choices from instance ${instance} failed: ${message}.`);
                throw error; // Re-throw to allow promiseAny to work correctly
            }
        })()
    );

    try {
        // Promise.any will return the first successful promise's result.
        const choices = await promiseAny(promises);
        return choices;
    } catch (e) {
        // This catch block is for when ALL promises reject.
        console.warn(`[DEBUG] All Invidious instances failed for video ${videoId}.`, e);
        return [];
    }
};


export const summarizeText = async (text: string, model: AiModel): Promise<string> => {
    const aiClient = getAiClient();
    if (!text) throw new Error("Cannot summarize empty text.");
    
    const response: GenerateContentResponse = await aiClient.models.generateContent({
        model: model,
        contents: `First, identify the language of the following text. Then, summarize the text in that same language in a concise and clear manner:\n\n---\n\n${text}`,
        config: {
            temperature: 0.2,
            topP: 0.9,
            topK: 20,
        },
    });

    const summary = response.text;
    if (!summary) throw new Error("The AI returned an empty summary.");
    return summary;
};

export const summarizeYouTubeVideo = async (
    videoTitle: string,
    transcript: TranscriptLine[],
    model: AiModel
): Promise<StructuredVideoSummary> => {
    const aiClient = getAiClient();

    if (!transcript || transcript.length === 0) {
        throw new Error("Transcript is empty and cannot be summarized.");
    }

    // Helper to format seconds into MM:SS or HH:MM:SS
    const formatTranscriptTime = (seconds: number): string => {
        if (isNaN(seconds) || seconds < 0) return '00:00';
        const date = new Date(0);
        date.setSeconds(seconds);
        const timeString = date.toISOString().substr(11, 8);
        return timeString.startsWith('00:') ? timeString.substr(3) : timeString;
    };

    const transcriptWithTimestamps = transcript
        .map(line => `[${formatTranscriptTime(line.start)}] ${line.text}`)
        .join('\n');

    const prompt = `You are a professional video editor. You are given a transcript of the video titled "${videoTitle}". Your task is to:
1.  First, identify the primary language of the transcript.
2.  Summarize the full content clearly and concisely. This will be the 'overallSummary'.
3.  Break the transcript down into 5 to 10 logical, sequential sections based on topic, flow, or speaker intent.
4.  For each section, you must provide the following details:
    - 'title': A descriptive title for what the section is about.
    - 'summary': A brief summary (2–4 sentences) of the section. Avoid redundancy between section summaries.
    - 'timestamp': The starting timestamp of that section in seconds. This must be as accurate as possible.
    - 'startingPhrase': The first 5-10 words of the exact transcript line that corresponds to the 'timestamp' to ensure accuracy.

Important Notes:
- Your entire response (all summaries and titles) MUST be in the same language as the transcript.
- Ensure each section has a distinct theme or transition.
- Each section must cover more than 60 seconds of content, except for the final section if the remaining transcript is shorter.
- The sections must cover the video's main topics in chronological order.

Here is the transcript with timestamps:
---
${transcriptWithTimestamps}
---
`;

    const response: GenerateContentResponse = await aiClient.models.generateContent({
        model: model,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    overallSummary: {
                        type: Type.STRING,
                        description: 'A concise overall summary of the entire video.'
                    },
                    sections: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                timestamp: {
                                    type: Type.INTEGER,
                                    description: `The starting timestamp of the section in seconds. Must be the exact start time of the line where the topic begins.`
                                },
                                title: {
                                    type: Type.STRING,
                                    description: 'A short title for the video section.'
                                },
                                summary: {
                                    type: Type.STRING,
                                    description: 'A concise summary of the video section.'
                                },
                                startingPhrase: {
                                    type: Type.STRING,
                                    description: 'The first 5-10 words of the transcript line that corresponds to the timestamp.'
                                }
                            },
                            required: ["timestamp", "title", "summary", "startingPhrase"],
                        },
                    }
                },
                required: ["overallSummary", "sections"],
            },
            temperature: 0.2,
        },
    });

    let jsonStr = (response.text ?? '').trim();
    if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.substring(7, jsonStr.length - 3).trim();
    }
    
    try {
        // Define local interfaces to handle the AI's response including the new field.
        interface AiSummarySection extends SummarySection {
            startingPhrase: string;
        }
        interface AiStructuredVideoSummary {
            overallSummary: string;
            sections: AiSummarySection[];
        }

        const parsedSummary = JSON.parse(jsonStr) as AiStructuredVideoSummary;
        
        // More robust validation
        if (
            !parsedSummary || 
            typeof parsedSummary.overallSummary !== 'string' || 
            !Array.isArray(parsedSummary.sections) ||
            parsedSummary.sections.some(s => 
                typeof s.timestamp !== 'number' || 
                !s.title || 
                !s.summary ||
                typeof s.startingPhrase !== 'string'
            )
        ) {
            throw new Error("AI returned a malformed structured summary.");
        }
        
        const validatedSections = parsedSummary.sections
            .filter(section => 
                section.timestamp >= 0 && 
                section.startingPhrase.trim() !== ''
            )
            .map(section => {
                const { timestamp: aiTimestamp, startingPhrase } = section;
                const normalizedPhrase = startingPhrase.trim().toLowerCase();

                // Define a search window around the AI's timestamp to improve efficiency and accuracy.
                const searchWindowStart = Math.max(0, aiTimestamp - 30);
                const searchWindowEnd = aiTimestamp + 15;

                const candidateLines = transcript.filter(line => line.start >= searchWindowStart && line.start <= searchWindowEnd);

                let bestMatchLine: TranscriptLine | null = null;

                // 1. Exact start match (highest priority)
                for (const line of candidateLines) {
                    if (line.text.trim().toLowerCase().startsWith(normalizedPhrase)) {
                        bestMatchLine = line;
                        break;
                    }
                }

                // 2. Contains match (second priority, takes first found in window)
                if (!bestMatchLine) {
                    for (const line of candidateLines) {
                        if (line.text.trim().toLowerCase().includes(normalizedPhrase)) {
                            bestMatchLine = line;
                            break;
                        }
                    }
                }

                // 3. Fallback to closest timestamp in the whole transcript if no phrase match found.
                if (!bestMatchLine) {
                    bestMatchLine = transcript.reduce((prev, curr) => 
                        (Math.abs(curr.start - aiTimestamp) < Math.abs(prev.start - aiTimestamp) ? curr : prev)
                    );
                }

                // Return a clean section object without the temporary 'startingPhrase'.
                return {
                    title: section.title,
                    summary: section.summary,
                    timestamp: bestMatchLine.start,
                };
            })
            // Ensure the summary is in chronological order after corrections.
            .sort((a, b) => a.timestamp - b.timestamp);

        return {
            overallSummary: parsedSummary.overallSummary,
            sections: validatedSections,
        };

    } catch (e) {
        console.error("Failed to parse or validate structured summary from AI:", e);
        throw new Error("The AI returned an invalid summary format. Please try again.");
    }
};

export const generateTranscriptDigest = async (
    transcripts: { title: string; link: string; content: TranscriptLine[] }[],
    viewTitle: string,
    model: AiModel
): Promise<HistoryDigest> => {
    const aiClient = getAiClient();
    if (transcripts.length === 0) {
        throw new Error("No transcripts were provided to generate a digest.");
    }

    const transcriptContent = transcripts.map(t => 
        `Video Title: ${t.title}\nTranscript: ${t.content.map(l => l.text).join(' ')}`
    ).join('\n\n---\n\n');

    const sourceLinksToExclude = transcripts.map(t => `- ${t.link}`).join('\n');

    const prompt = `
You are a helpful research assistant. Based on the following video transcripts from a user's feed titled "${viewTitle}", do the following:

1.  **Identify Language**: First, determine the primary language used across all transcripts.
2.  **Synthesize and Structure**: Write a cohesive synthesis of the main topics. The synthesis MUST be in the same language as the transcripts and formatted using markdown with the following structure:
    - A main title for the digest (e.g., "# Tech News Roundup").
    - A brief introductory summary paragraph.
    - A bulleted list of 3-5 key takeaways (e.g., "* Key takeaway one.").
    - Detailed paragraphs expanding on the topics.
    - Cite your synthesis using [number] format, referencing the web pages you find, not the source videos.
3.  **Find Recent & Valid Links**: Use Google Search to find 3-5 high-quality, relevant web pages (articles, blogs, etc.). These links MUST be:
    - Published within the last month.
    - Verified to be active and accessible.
    - Provide additional context or different perspectives on the summarized topics.
4.  **Exclusion Rule**: Crucially, you **MUST NOT** include links to the original source videos provided below in your list of related links. Your goal is to find new, supplementary information from different sources.
5.  **Format Sources**: After your synthesis, add a special block for sources. Start the block with '---SOURCES---' and end it with '---ENDSOURCES---'. Inside this block, list each source you used. For each source, you MUST provide its Title, URL, and a brief Description explaining its relevance. Format each entry exactly like this:
    Title: [The page title]
    URL: [The full URL]
    Description: [A brief, relevant description]

Source Videos to Exclude from search results:
${sourceLinksToExclude}

Transcripts:
---
${transcriptContent}
---

Your entire response, including the markdown formatting and the sources block, must be in the language you identified.
`;

    const response = await aiClient.models.generateContent({
        model,
        contents: prompt,
        config: {
            tools: [{googleSearch: {}}],
        }
    });

    let synthesis = response.text;
    if (!synthesis) {
        throw new Error("The AI failed to generate a digest synthesis.");
    }

    let sources: WebSource[] = [];
    const sourcesBlockRegex = /---SOURCES---([\s\S]*?)---ENDSOURCES---/;
    const sourcesBlockMatch = synthesis.match(sourcesBlockRegex);

    if (sourcesBlockMatch && sourcesBlockMatch[1]) {
        synthesis = synthesis.replace(sourcesBlockRegex, '').trim(); // Remove the sources block from the main synthesis
        const sourcesText = sourcesBlockMatch[1].trim();
        const sourceEntries = sourcesText.split(/Title:/).slice(1);

        for (const entry of sourceEntries) {
            const lines = entry.trim().split('\n');
            const title = lines[0]?.trim();
            const urlLine = lines.find(line => line.startsWith('URL:'));
            const descriptionLine = lines.find(line => line.startsWith('Description:'));

            if (title && urlLine) {
                const uri = sanitizeSourceUrl(urlLine.substring(4).trim());
                const description = descriptionLine ? descriptionLine.substring(12).trim() : undefined;
                sources.push({ title, uri, description });
            }
        }
    } else {
        // Fallback to grounding chunks if the special block is not found
        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        sources = (groundingChunks || [])
            .map((chunk: any) => ({
                uri: sanitizeSourceUrl(chunk.web?.uri || ''),
                title: chunk.web?.title || '',
            }))
            .filter(source => source.uri && source.title);
    }
    
    return { synthesis, sources };
};


export const generateRecommendations = async (
    currentFeeds: Feed[],
    history: Article[],
    model: AiModel,
    customQuery?: string,
    excludeUrls: string[] = []
): Promise<{ recommendations: RecommendedFeed[], sources: WebSource[] }> => {
    const aiClient = getAiClient();
    const existingUrls = new Set([...currentFeeds.map(f => f.url), ...excludeUrls]);

    const feedProfile = currentFeeds.slice(0, 20).map(f => `- ${f.title} (${(f.tags || []).join(', ')})`).join('\n');
    const historyProfile = history.slice(0, 20).map(a => `- ${a.title}`).join('\n');

    let prompt = `
        Based on the user's subscriptions and reading history, please use Google Search to find and recommend 5 new, recently active YouTube channels that have posted in the last month.
        
        User's Subscriptions (a sample):
        ${feedProfile}

        User's Recent Reading History (a sample):
        ${historyProfile}
    `;

    if (customQuery) {
        prompt += `\n\nThe user has also provided a specific request: "${customQuery}"\nPlease prioritize recommendations that match this request while still being relevant to their general interests.`;
    }

    prompt += `
        
        For each recommendation, provide a reason why it's a good suggestion.
        Do not recommend any of these existing subscription URLs:
        ${Array.from(existingUrls).join('\n')}

        Format each recommendation exactly like this, with each field on a new line:
        Title: [The channel title]
        URL: [The full YouTube channel URL, using the modern @handle format, e.g., https://www.youtube.com/@handle]
        Reason: [A brief reason for the recommendation]
    `;
    
    const response: GenerateContentResponse = await aiClient.models.generateContent({
        model: model,
        contents: prompt,
        config: {
            tools: [{googleSearch: {}}],
        }
    });

    const text = response.text;
    if (!text) {
        throw new Error("The AI returned an empty response for recommendations.");
    }

    const recommendations: RecommendedFeed[] = [];
    const recommendationBlocks = text.split('Title:').slice(1);

    for (const block of recommendationBlocks) {
        const lines = block.trim().split('\n');
        const title = lines[0]?.trim();
        const urlLine = lines.find((line: string) => line.startsWith('URL:'));
        const reasonLine = lines.find((line: string) => line.startsWith('Reason:'));

        if (title && urlLine && reasonLine) {
            const url = urlLine.substring(4).trim();
            const reason = reasonLine.substring(7).trim();
            if (!existingUrls.has(url)) {
                recommendations.push({ title, url, reason });
            }
        }
    }
    
    const verificationPromises = recommendations.map(async (rec) => {
        const verifiedUrl = await verifyAndGetCanonicalUrl(rec.url);
        if (verifiedUrl) {
            return { ...rec, url: verifiedUrl };
        }
        console.log(`Skipping recommendation "${rec.title}" due to invalid or unverifiable URL: ${rec.url}`);
        return null;
    });

    const verifiedResults = await Promise.all(verificationPromises);
    const finalRecommendations = verifiedResults.filter((rec): rec is RecommendedFeed => rec !== null);

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sources: WebSource[] = (groundingChunks || [])
        .map((chunk: any) => ({
            uri: sanitizeSourceUrl(chunk.web?.uri || ''),
            title: chunk.web?.title || '',
        }))
        .filter((source: any) => source.uri && source.title);

    return { recommendations: finalRecommendations, sources };
};

export const generateRelatedChannels = async (
    sourceFeed: Feed,
    excludeUrls: string[],
    model: AiModel
): Promise<{ recommendations: RecommendedFeed[], sources: WebSource[] }> => {
    const aiClient = getAiClient();
    const existingUrls = new Set(excludeUrls);

    const prompt = `
        Based on the following source channel, please use Google Search to find and recommend 5 similar and recently active YouTube channels that have posted in the last month.
        
        Source Channel:
        - Title: ${sourceFeed.title}
        - Description: ${sourceFeed.description || 'N/A'}
        - Tags: ${(sourceFeed.tags || []).join(', ')}

        For each recommendation, provide a reason why it's a good suggestion based on the source channel.
        Do not recommend channels that are already in this list of existing subscription URLs:
        ${Array.from(existingUrls).map(url => `- ${url}`).join('\n')}

        Format each recommendation exactly like this, with each field on a new line:
        Title: [The channel title]
        URL: [The full YouTube channel URL, using the modern @handle format, e.g., https://www.youtube.com/@handle]
        Reason: [A brief reason for the recommendation]
    `;

    const response: GenerateContentResponse = await aiClient.models.generateContent({
        model: model,
        contents: prompt,
        config: {
            tools: [{googleSearch: {}}],
        }
    });

    const text = response.text;
    if (!text) {
        throw new Error("The AI returned an empty response for related channels.");
    }

    const recommendations: RecommendedFeed[] = [];
    const recommendationBlocks = text.split('Title:').slice(1);

    for (const block of recommendationBlocks) {
        const lines = block.trim().split('\n');
        const title = lines[0]?.trim();
        const urlLine = lines.find((line: string) => line.startsWith('URL:'));
        const reasonLine = lines.find((line: string) => line.startsWith('Reason:'));

        if (title && urlLine && reasonLine) {
            const url = urlLine.substring(4).trim();
            const reason = reasonLine.substring(7).trim();
            if (!existingUrls.has(url)) {
                recommendations.push({ title, url, reason });
            }
        }
    }

    const verificationPromises = recommendations.map(async (rec) => {
        const verifiedUrl = await verifyAndGetCanonicalUrl(rec.url);
        if (verifiedUrl) {
            return { ...rec, url: verifiedUrl };
        }
        console.log(`Skipping related channel recommendation "${rec.title}" due to invalid or unverifiable URL: ${rec.url}`);
        return null;
    });

    const verifiedResults = await Promise.all(verificationPromises);
    const finalRecommendations = verifiedResults.filter((rec): rec is RecommendedFeed => rec !== null);

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sources: WebSource[] = (groundingChunks || [])
        .map((chunk: any) => ({
            uri: sanitizeSourceUrl(chunk.web?.uri || ''),
            title: chunk.web?.title || '',
        }))
        .filter((source: any) => source.uri && source.title);

    return { recommendations: finalRecommendations, sources };
};

export const translateDigestContent = async (digest: HistoryDigest, targetLanguage: string, model: AiModel): Promise<{ synthesis: string }> => {
    const aiClient = getAiClient();
    
    const prompt = `
        Translate the following synthesis into ${targetLanguage}.
        Maintain the original meaning and tone.
        Return only the translated text, with no extra formatting or commentary.

        Synthesis to Translate:
        ---
        ${digest.synthesis}
        ---
    `;

    const response: GenerateContentResponse = await aiClient.models.generateContent({
        model: model,
        contents: prompt,
    });

    const translatedSynthesis = response.text;
    if (!translatedSynthesis) {
        throw new Error("The AI returned an empty translation.");
    }

    return { synthesis: translatedSynthesis };
};
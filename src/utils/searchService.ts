import MiniSearch from 'minisearch';
import type { Article, TranscriptLine } from '../types';

export interface SearchResult {
  id: string;
  feedId: string;
  title: string;
  feedTitle: string;
  imageUrl: string | null;
  pubDateTimestamp: number | null;
  isVideo: boolean | undefined;
  duration: number | null | undefined;
  tags: string[] | undefined;
  score: number;
}

interface ArticleDocument {
  id: string;
  feedId: string;
  title: string;
  description: string;
  summary: string;
  tags: string;
  transcript: string;
  content: string;
  // Stored fields (returned in results but not indexed for full-text search)
  feedTitle: string;
  imageUrl: string | null;
  pubDateTimestamp: number | null;
  isVideo: boolean | undefined;
  duration: number | null | undefined;
  articleTags: string[] | undefined;
}

let miniSearch: MiniSearch<ArticleDocument> | null = null;
let indexVersion = 0;
let rebuildTimer: ReturnType<typeof setTimeout> | null = null;

const REBUILD_DEBOUNCE_MS = 300;

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
}

function articleToDocument(article: Article): ArticleDocument {
  const transcriptText = article.transcript
    ? article.transcript.map((line: TranscriptLine) => line.text).join(' ')
    : '';

  return {
    id: article.id,
    feedId: article.feedId,
    title: article.title || '',
    description: stripHtml(article.description || ''),
    summary: stripHtml(article.summary || ''),
    tags: (article.tags || []).join(' '),
    transcript: transcriptText,
    content: stripHtml(article.content || '').substring(0, 5000),
    feedTitle: article.feedTitle || '',
    imageUrl: article.imageUrl || null,
    pubDateTimestamp: article.pubDateTimestamp || null,
    isVideo: article.isVideo,
    duration: article.duration,
    articleTags: article.tags,
  };
}

function createIndex(): MiniSearch<ArticleDocument> {
  return new MiniSearch<ArticleDocument>({
    fields: ['title', 'description', 'summary', 'tags', 'transcript', 'content'],
    storeFields: [
      'id',
      'feedId',
      'title',
      'feedTitle',
      'imageUrl',
      'pubDateTimestamp',
      'isVideo',
      'duration',
      'articleTags',
    ],
    searchOptions: {
      boost: {
        title: 3,
        description: 2,
        summary: 2,
        tags: 2,
        transcript: 1,
        content: 1,
      },
      fuzzy: 0.2,
      prefix: true,
      combineWith: 'AND',
    },
    idField: 'id',
  });
}

/**
 * Build (or rebuild) the MiniSearch index from the given articles.
 * Debounced to avoid rebuilding on every rapid state change.
 */
export function buildSearchIndex(articles: Article[]): void {
  if (rebuildTimer) {
    clearTimeout(rebuildTimer);
  }

  rebuildTimer = setTimeout(() => {
    ++indexVersion;
    const index = createIndex();
    const documents = articles.map(articleToDocument);
    index.addAll(documents);
    miniSearch = index;
    rebuildTimer = null;
  }, REBUILD_DEBOUNCE_MS);
}

/**
 * Search articles using the full-text index. Falls back to empty results
 * if the index is not yet built.
 */
export function searchArticles(query: string, limit = 100): SearchResult[] {
  if (!miniSearch || !query.trim()) {
    return [];
  }

  const results = miniSearch.search(query).slice(0, limit);

  return results.map(result => ({
    id: result.id as string,
    feedId: result.feedId as string,
    title: result.title as string,
    feedTitle: result.feedTitle as string,
    imageUrl: result.imageUrl as string | null,
    pubDateTimestamp: result.pubDateTimestamp as number | null,
    isVideo: result.isVideo as boolean | undefined,
    duration: result.duration as number | null | undefined,
    tags: result.articleTags as string[] | undefined,
    score: result.score,
  }));
}

/**
 * Check if the search index has been built and is ready.
 */
export function isSearchIndexReady(): boolean {
  return miniSearch !== null;
}

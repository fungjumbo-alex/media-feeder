/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Feed } from '../types';

type PartialFeed = Omit<Feed, 'id' | 'items' | 'error'>;

/**
 * Generates an OPML XML string from a list of feeds, grouping them by tags.
 * @param feeds The array of Feed objects to export.
 * @returns A formatted OPML XML string.
 */
export const generateOpml = (feeds: Feed[]): string => {
  const doc = document.implementation.createDocument(null, 'opml', null);
  const opmlElement = doc.documentElement;
  opmlElement.setAttribute('version', '2.0');

  const head = doc.createElement('head');
  const title = doc.createElement('title');
  title.textContent = 'Media-Feeder Subscriptions';
  head.appendChild(title);
  opmlElement.appendChild(head);

  const body = doc.createElement('body');

  const feedsByTag: { [key: string]: Feed[] } = {};
  const untaggedFeeds: Feed[] = [];

  feeds.forEach(feed => {
    if (feed.tags && feed.tags.length > 0) {
      feed.tags.forEach(tag => {
        if (!feedsByTag[tag]) {
          feedsByTag[tag] = [];
        }
        feedsByTag[tag].push(feed);
      });
    } else {
      untaggedFeeds.push(feed);
    }
  });

  // Use a Set to track URLs that have been added to prevent duplicates in the final XML
  const addedUrls = new Set<string>();

  Object.keys(feedsByTag)
    .sort()
    .forEach(tag => {
      const tagOutline = doc.createElement('outline');
      tagOutline.setAttribute('text', tag);
      tagOutline.setAttribute('title', tag);

      const uniqueFeedsInTag = [...new Map(feedsByTag[tag].map(item => [item.url, item])).values()];

      uniqueFeedsInTag.forEach(feed => {
        const feedOutline = doc.createElement('outline');
        feedOutline.setAttribute('type', 'rss');
        feedOutline.setAttribute('text', feed.title);
        feedOutline.setAttribute('title', feed.title);
        feedOutline.setAttribute('xmlUrl', feed.url);
        tagOutline.appendChild(feedOutline);
        addedUrls.add(feed.url);
      });

      body.appendChild(tagOutline);
    });

  untaggedFeeds.forEach(feed => {
    // Only add untagged feeds if they weren't already added under a tag
    if (addedUrls.has(feed.url)) return;

    const feedOutline = doc.createElement('outline');
    feedOutline.setAttribute('type', 'rss');
    feedOutline.setAttribute('text', feed.title);
    feedOutline.setAttribute('title', feed.title);
    feedOutline.setAttribute('xmlUrl', feed.url);
    body.appendChild(feedOutline);
  });

  opmlElement.appendChild(body);

  const serializer = new XMLSerializer();
  const xmlString = serializer.serializeToString(doc);

  // Basic pretty-printing for readability
  return `<?xml version="1.0" encoding="UTF-8"?>\n` + xmlString;
};

/**
 * Parses an OPML XML string and returns an array of feed objects.
 * @param opmlString The raw OPML XML content.
 * @returns An array of partial Feed objects.
 */
export const parseOpml = (opmlString: string): PartialFeed[] => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(opmlString, 'application/xml');

  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('Could not parse the file. Please ensure it is a valid OPML or XML file.');
  }

  const feeds: PartialFeed[] = [];

  const processOutline = (outline: Element, currentTags: string[]) => {
    const xmlUrl = outline.getAttribute('xmlUrl');
    const text = outline.getAttribute('text') || outline.getAttribute('title');
    const description = outline.getAttribute('description');

    // It's a feed if it has xmlUrl and a title
    if (xmlUrl && text) {
      feeds.push({
        url: xmlUrl,
        title: text,
        description: description || undefined,
        isPlaylist: false, // Default assumption
        tags: currentTags.length > 0 ? [...new Set(currentTags)] : undefined,
        maxArticles: 50, // A higher default for imports
      });
    }

    // It's a folder/category if it has child outlines but no xmlUrl.
    if (text && !xmlUrl) {
      const newTags = [...currentTags, text];
      for (const child of Array.from(outline.children)) {
        if (child.tagName.toLowerCase() === 'outline') {
          processOutline(child, newTags);
        }
      }
    }
  };

  doc.querySelectorAll('body > outline').forEach(outline => {
    processOutline(outline, []);
  });

  return feeds;
};

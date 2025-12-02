/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import JSZip from 'jszip';
import type { Article } from '../types';
import { PROXIES } from '../services/proxyService';
import { getYouTubeId } from '../services/youtubeService';
import { fetchAvailableCaptionChoices, fetchAndParseTranscript } from '../services/geminiService';
import { formatTranscriptTime } from './dateUtils';

const IMAGE_PROXIES = [
    {
        name: 'Google Image Proxy',
        buildUrl: (url: string) => `https://images1-focus-opensocial.googleusercontent.com/gadgets/proxy?container=focus&url=${encodeURIComponent(url)}`
    },
    ...PROXIES
];

const generateUUID = (): string => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

const escapeXml = (unsafe: string): string => {
    if (typeof unsafe !== 'string') return '';
    return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
};

const fetchBlobViaProxy = async (url: string, referer?: string | null): Promise<Response> => {
    let lastError: unknown = null;

    for (const proxy of IMAGE_PROXIES) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
            const proxyUrl = proxy.buildUrl(url);
            
            const headers: HeadersInit = {};
            if (referer && proxy.name !== 'Google Image Proxy') {
                headers['Referer'] = referer;
            }

            const response = await fetch(proxyUrl, { 
                signal: controller.signal,
                headers: headers
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Proxy ${proxy.name} responded with status ${response.status}`);
            }

            const contentType = response.headers.get('Content-Type');
            if (!contentType || !contentType.startsWith('image/')) {
                 throw new Error(`Response from ${proxy.name} is not an image. Content-Type: ${contentType}`);
            }

            const blob = await response.blob();
            if (blob.size < 100) { // Reject tiny files which are likely errors/trackers
                throw new Error(`Proxy ${proxy.name} returned a tiny file (${blob.size} bytes), likely an error page or tracking pixel.`);
            }

            return new Response(blob, { status: response.status, statusText: response.statusText, headers: response.headers });
        } catch (error) {
            lastError = error;
            console.warn(`Failed to fetch image via ${proxy.name}:`, error);
        }
    }
    
    const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`Failed to fetch image after trying all proxies. Last error: ${errorMessage}`);
};

const getMimeType = (filenameOrUrl: string, responseContentType?: string): string => {
    if (responseContentType && responseContentType.startsWith('image/')) {
        return responseContentType.split(';')[0];
    }
    const ext = filenameOrUrl.split('.').pop()?.toLowerCase() || '';
    switch (ext) {
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        case 'png':
            return 'image/png';
        case 'gif':
            return 'image/gif';
        case 'svg':
            return 'image/svg+xml';
        case 'webp':
            return 'image/webp';
        default:
            return 'application/octet-stream';
    }
};

const sanitizeHtmlForXhtml = (html: string): string => {
    if (!html) return '';

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Remove unwanted elements
    doc.querySelectorAll('script, style, link[rel="stylesheet"]').forEach(el => el.remove());

    // Remove event handlers
    doc.querySelectorAll('*').forEach(el => {
        for (const attr of Array.from(el.attributes)) {
            if (attr.name.startsWith('on')) {
                el.removeAttribute(attr.name);
            }
        }
    });

    let htmlString = doc.body.innerHTML;

    // Ensure void elements are self-closing
    const voidTags = ['img', 'br', 'hr', 'wbr', 'input', 'meta', 'link'];
    voidTags.forEach(tag => {
        const regex = new RegExp(`<${tag}([^>]*?)(?<!/)>`, 'gi');
        htmlString = htmlString.replace(regex, `<${tag}$1 />`);
    });

    return htmlString;
};

const getContainerXml = () => `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

const getContentOpf = (title: string, manifestItems: string[], spineItems: string[], bookId: string) => {
    const now = new Date().toISOString().split('.')[0] + 'Z';
    return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator opf:role="aut">Media-Feeder</dc:creator>
    <dc:identifier id="BookId">urn:uuid:${bookId}</dc:identifier>
    <dc:language>en</dc:language>
    <meta name="cover" content="cover-image" />
    <dc:date opf:event="modification">${now}</dc:date>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spineItems.join('\n    ')}
  </spine>
</package>`;
};

const getTocNcx = (title: string, navPoints: string[], bookId: string) => {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${bookId}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${escapeXml(title)}</text>
  </docTitle>
  <navMap>
    ${navPoints.join('\n    ')}
  </navMap>
</ncx>`;
};

const getTocXhtml = (title: string, articles: Article[]) => {
    const items = articles.map((article, index) => {
        const chapterId = `chapter-${index + 1}`;
        const fileName = `${chapterId}.xhtml`;
        return `<li><a href="${fileName}">${escapeXml(article.title)}</a></li>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>Table of Contents</title>
  <style type="text/css">
    body { font-family: sans-serif; }
    h1, h2 { text-align: center; }
    ol { list-style-type: none; padding-left: 0; }
    li { margin: 1em 0; }
    a { text-decoration: none; color: #0077cc; }
  </style>
</head>
<body>
  <h1>${escapeXml(title)}</h1>
  <h2>Table of Contents</h2>
  <ol>
    ${items}
  </ol>
</body>
</html>`;
};

const getChapterXhtml = (article: Article) => {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${escapeXml(article.title)}</title>
  <style type="text/css">
    body { font-family: sans-serif; line-height: 1.5; margin: 1em; }
    h1 { font-size: 1.5em; text-align: center; }
    h2 { font-size: 1.2em; border-bottom: 1px solid #ccc; padding-bottom: 0.2em; margin-top: 2em; }
    h3 { font-size: 1.1em; margin-top: 1.5em; }
    img { max-width: 100%; height: auto; display: block; margin: 1em auto; border-radius: 8px; }
    p { margin: 1em 0; }
    a { color: #0077cc; text-decoration: none; }
    hr { border: 0; border-top: 1px solid #555; margin: 2em 0; }
  </style>
</head>
<body>
  <h1>${escapeXml(article.title)}</h1>
  <div>
    ${article.content}
  </div>
</body>
</html>`;
};

export const createEpub = async (articles: Article[], title: string): Promise<Blob> => {
    const zip = new JSZip();

    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
    const metaInfFolder = zip.folder('META-INF');
    if (!metaInfFolder) throw new Error("Could not create META-INF folder.");
    metaInfFolder.file('container.xml', getContainerXml());
    
    const contentFolder = zip.folder('OEBPS');
    if (!contentFolder) throw new Error("Could not create OEBPS folder.");
    const imagesFolder = contentFolder.folder('images');
    if (!imagesFolder) throw new Error("Could not create images folder.");

    const bookId = generateUUID();
    const manifestItems: string[] = [];
    const spineItems: string[] = [];
    const tocNavPoints: string[] = [];
    let imageCounter = 0;

    const tocId = 'toc';
    const tocFileName = 'toc.xhtml';
    manifestItems.push(`<item id="${tocId}" href="${tocFileName}" media-type="application/xhtml+xml" />`);
    spineItems.push(`<itemref idref="${tocId}" />`);
    contentFolder.file(tocFileName, getTocXhtml(title, articles));
    tocNavPoints.push(`<navPoint id="navpoint-toc" playOrder="1"><navLabel><text>Table of Contents</text></navLabel><content src="${tocFileName}"/></navPoint>`);

    for (let i = 0; i < articles.length; i++) {
        const article = articles[i];
        const chapterId = `chapter-${i + 1}`;
        const fileName = `${chapterId}.xhtml`;

        let summaryHtml = '';
        if (article.structuredSummary) {
            summaryHtml += `<h2>AI Summary</h2>`;
            summaryHtml += `<p>${escapeXml(article.structuredSummary.overallSummary).replace(/\n/g, '</p><p>')}</p>`;
            if (article.structuredSummary.sections && article.structuredSummary.sections.length > 0) {
                summaryHtml += `<h3>Key Moments</h3>`;
                article.structuredSummary.sections.forEach(section => {
                    const timestampLink = article.link ? `${article.link}&t=${Math.floor(section.timestamp)}s` : '#';
                    summaryHtml += `<p><strong><a href="${escapeXml(timestampLink)}">${formatTranscriptTime(section.timestamp)}</a> - ${escapeXml(section.title)}</strong>: ${escapeXml(section.summary)}</p>`;
                });
            }
        } else if (article.summary) {
            summaryHtml += `<h2>AI Summary</h2>`;
            summaryHtml += `<p>${escapeXml(article.summary).replace(/\n/g, '</p><p>')}</p>`;
        }
        
        if (summaryHtml) {
            summaryHtml += '<hr />';
        }

        let articleContent = article.content || '';

        if (article.isVideo) {
            let videoHeader = '';
            // 1. Add thumbnail (if not already in content)
            if (article.imageUrl && !articleContent.includes(article.imageUrl)) {
                videoHeader += `<img src="${escapeXml(article.imageUrl)}" alt="${escapeXml(article.title)}" />`;
            }

            // 2. Add YouTube link
            if (article.link) {
                videoHeader += `<p style="text-align:center; font-weight:bold;"><a href="${escapeXml(article.link)}">Watch on YouTube</a></p>`;
            }

            if(videoHeader){
                videoHeader += '<hr />';
            }

            let transcriptHtml = '';
            if (article.link) {
                const videoId = getYouTubeId(article.link);
                if (videoId) {
                    try {
                        const choices = await fetchAvailableCaptionChoices(videoId);
                        if (choices.length > 0) {
                            const transcriptLines = await fetchAndParseTranscript(choices[0].url);
                            
                            if (transcriptLines.length > 0) {
                                transcriptHtml += `<hr /><h2>Transcript</h2>`;
                                if (choices.length > 1) {
                                    transcriptHtml += `<p><em>Transcript from ${escapeXml(choices[0].label)}.</em></p>`;
                                }
                                transcriptLines.forEach(line => {
                                    const timestampLink = `${article.link}&t=${Math.floor(line.start)}s`;
                                    // Add non-breaking space for empty lines to preserve them
                                    const lineText = line.text.trim() === '' ? '&nbsp;' : escapeXml(line.text);
                                    transcriptHtml += `<p><a href="${escapeXml(timestampLink)}">${formatTranscriptTime(line.start)}</a> ${lineText}</p>`;
                                });
                            }
                        }
                    } catch (e) {
                        console.warn(`Could not fetch transcript for article "${article.title}":`, e);
                        transcriptHtml += `<p><em>(Transcript could not be loaded.)</em></p>`;
                    }
                }
            }
            // Combine all parts
            articleContent = videoHeader + articleContent + transcriptHtml;
        }

        // Prepend the summary to the final content
        articleContent = summaryHtml + articleContent;

        const doc = new DOMParser().parseFromString(articleContent, 'text/html');
        const images = Array.from(doc.querySelectorAll('img'));
        
        const imagePromises = images.map(async (img) => {
            const srcset = img.getAttribute('srcset');
            let src = img.dataset.src || img.getAttribute('src');

            if (srcset) {
                const sources = srcset.split(',').map(s => s.trim().split(' ')[0]);
                if (sources.length > 0 && sources[0]) {
                    src = sources[0];
                }
            }

            if (!src || src.startsWith('data:')) return;

            try {
                src = new URL(src, article.link || window.location.href).href;
            } catch (e) {
                console.warn(`Invalid image URL found: ${src}. Skipping.`);
                return;
            }

            try {
                const response = await fetchBlobViaProxy(src, article.link);
                const blob = await response.blob();
                
                const imageId = `image-${imageCounter++}`;
                const extension = (src.split('.').pop() || 'jpg').split('?')[0].split('#')[0];
                const imageFileName = `${imageId}.${extension}`;
                const mimeType = getMimeType(imageFileName, response.headers.get('Content-Type') || undefined);

                imagesFolder.file(imageFileName, blob);
                
                manifestItems.push(`<item id="${imageId}" href="images/${imageFileName}" media-type="${mimeType}" />`);
                
                img.setAttribute('src', `images/${imageFileName}`);
            } catch (e) {
                console.warn(`Could not embed image for EPUB: ${src}`, e);
                const altText = img.getAttribute('alt');
                if (altText) {
                    const p = doc.createElement('p');
                    p.style.fontStyle = 'italic';
                    p.textContent = `[Image: ${altText}]`;
                    img.parentNode?.replaceChild(p, img);
                } else {
                    img.remove();
                }
            }
        });

        await Promise.all(imagePromises);

        const processedContent = doc.body.innerHTML;
        const sanitizedContent = sanitizeHtmlForXhtml(processedContent);
        const articleWithProcessedContent = { ...article, content: sanitizedContent };

        manifestItems.push(`<item id="${chapterId}" href="${fileName}" media-type="application/xhtml+xml" />`);
        spineItems.push(`<itemref idref="${chapterId}" />`);
        tocNavPoints.push(
            `<navPoint id="navpoint-${i + 2}" playOrder="${i + 2}">
              <navLabel><text>${escapeXml(article.title)}</text></navLabel>
              <content src="${fileName}"/>
            </navPoint>`
        );
        contentFolder.file(fileName, getChapterXhtml(articleWithProcessedContent));
    }

    contentFolder.file('content.opf', getContentOpf(title, manifestItems, spineItems, bookId));
    contentFolder.file('toc.ncx', getTocNcx(title, tocNavPoints, bookId));
    
    return zip.generateAsync({
        type: 'blob',
        mimeType: 'application/epub+zip',
    });
};
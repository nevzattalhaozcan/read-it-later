// Highlight utility functions for text-based matching with context
import { logger } from './utils/logger';

export interface Highlight {
  id: string;
  text: string;
  prefix: string;
  suffix: string;
  startOffset: number;
  note: string;
  createdAt: string;
}

export const CONTEXT_LENGTH = 40;

/**
 * Generate a unique ID for a highlight
 */
export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
};

/**
 * Get the absolute character offset of a node and offset within a container
 */
const getAbsoluteOffset = (container: HTMLElement, node: Node, offset: number): number => {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let currentPos = 0;
  while (walker.nextNode()) {
    if (walker.currentNode === node) {
      return currentPos + offset;
    }
    currentPos += (walker.currentNode.textContent || '').length;
  }
  return -1;
};

/**
 * When user selects text, capture the selection context (surrounding text)
 * to uniquely identify this highlight even if the same text appears multiple times
 */
export const captureSelectionContext = (
  containerEl: HTMLElement,
  selection: Selection
): { text: string; prefix: string; suffix: string; startOffset: number } | null => {
  if (!selection || selection.isCollapsed) return null;
  
  const originalText = selection.toString();
  const text = originalText.trim();
  
  // Requirement: Don't allow highlighting single characters or just whitespace
  if (text.length <= 1) return null;

  const range = selection.getRangeAt(0);

  // Get full text content of the container
  const fullText = containerEl.textContent || '';

  // Get absolute start position of the selection
  const rawStartOffset = getAbsoluteOffset(containerEl, range.startContainer, range.startOffset);
  if (rawStartOffset === -1) return null;

  // Adjust startPos to skip leading whitespace of the original selection
  const leadingWhitespaceLength = originalText.match(/^\s*/)?.[0].length || 0;
  const startOffset = rawStartOffset + leadingWhitespaceLength;

  // Extract prefix and suffix context based on the TRIMMED text
  const prefix = fullText.slice(Math.max(0, startOffset - CONTEXT_LENGTH), startOffset);
  const suffix = fullText.slice(startOffset + text.length, startOffset + text.length + CONTEXT_LENGTH);

  return { text, prefix, suffix, startOffset };
};

/**
 * Check if a new selection is already fully covered by an existing highlight.
 * Uses startOffset ranges for precise comparison.
 */
export const isAlreadyHighlighted = (
  highlights: Highlight[],
  newStartOffset: number,
  newText: string
): boolean => {
  const newEnd = newStartOffset + newText.length;
  return highlights.some(h => {
    if (h.startOffset === undefined) return false;
    const hEnd = h.startOffset + h.text.length;
    // New selection is fully inside an existing highlight
    return h.startOffset <= newStartOffset && hEnd >= newEnd;
  });
};

/**
 * When a new highlight encompasses existing highlights, absorb them.
 * Returns the updated highlights array with overlapping ones removed,
 * and a merged note from any absorbed highlights that had notes.
 */
export const mergeOverlappingHighlights = (
  existingHighlights: Highlight[],
  newStartOffset: number,
  newText: string
): { remainingHighlights: Highlight[]; absorbedNote: string; mergedStart: number; mergedEnd: number } => {
  const newEnd = newStartOffset + newText.length;
  const absorbed: Highlight[] = [];
  const remaining: Highlight[] = [];

  for (const h of existingHighlights) {
    if (h.startOffset === undefined) {
      remaining.push(h);
      continue;
    }
    const hEnd = h.startOffset + h.text.length;
    // Full containment OR partial overlap
    if (hEnd > newStartOffset && h.startOffset < newEnd) {
      absorbed.push(h);
    } else {
      remaining.push(h);
    }
  }

  const absorbedNote = absorbed
    .map(h => h.note)
    .filter(n => n && n.trim())
    .join('\n\n');

  const mergedStart = absorbed.length > 0
    ? Math.min(newStartOffset, ...absorbed.map(h => h.startOffset))
    : newStartOffset;
  const mergedEnd = absorbed.length > 0
    ? Math.max(newEnd, ...absorbed.map(h => h.startOffset + h.text.length))
    : newEnd;

  return { remainingHighlights: remaining, absorbedNote, mergedStart, mergedEnd };
};

/**
 * Normalized comparison of strings (collapses all whitespace to single space)
 */
const normalizeText = (text: string): string => {
  return (text || '').replace(/\s+/g, ' ').trim();
};

/**
 * Find the character position of a highlight in the full text content
 * using its prefix+text+suffix context for collision-safe matching.
 * This version is more robust against whitespace differences between paragraphs.
 */
const findHighlightPosition = (
  fullText: string,
  highlight: Highlight
): { start: number; end: number } | null => {
  const { text, prefix, suffix, startOffset } = highlight;

  // Strategy 0: High-precision match using stored startOffset
  // This ensures we highlight the EXACT occurrence the user selected
  if (startOffset !== undefined && fullText.slice(startOffset, startOffset + text.length) === text) {
    return { start: startOffset, end: startOffset + text.length };
  }

  const nFull = normalizeText(fullText);
  const nText = normalizeText(text);
  const nPrefix = normalizeText(prefix);
  const nSuffix = normalizeText(suffix);

  // Strategy 1: Try full context match in normalized text
  const contextStr = nPrefix + nText + nSuffix;
  const normPos = nFull.indexOf(contextStr);
  
  if (normPos !== -1) {
    // We found it in normalized space, now we need to map back to real space.
    // This is hard to do perfectly, so let's try a fuzzy search in real space.
    // We create a regex that allows ANY whitespace (including none) between the words.
    const escapedText = text.trim().split(/\s+/).filter(Boolean).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
    const escapedPrefix = prefix.trim().split(/\s+/).filter(Boolean).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
    const escapedSuffix = suffix.trim().split(/\s+/).filter(Boolean).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
    
    // Create a flexible regex pattern
    let pattern = '';
    if (escapedPrefix) pattern += escapedPrefix + '\\s*';
    pattern += `(${escapedText})`;
    if (escapedSuffix) pattern += '\\s*' + escapedSuffix;

    try {
      const regex = new RegExp(pattern, 'g');
      const match = regex.exec(fullText);
      if (match) {
        const start = fullText.indexOf(match[1], match.index);
        return { start, end: start + match[1].length };
      }
    } catch (e) {}
  }

  // Strategy 2: Fallback to basic text search with regex (optional whitespace)
  try {
    const escapedText = text.trim().split(/\s+/).filter(Boolean).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
    const regex = new RegExp(escapedText, 'g');
    const match = regex.exec(fullText);
    if (match) {
      return { start: match.index, end: match.index + match[0].length };
    }
  } catch (e) {}

  return null;
};

/**
 * Apply highlights to the DOM after the article content has been rendered.
 * This works because React doesn't manage the children of dangerouslySetInnerHTML.
 * 
 * IMPORTANT: Call this in useEffect after content renders.
 */
export const applyHighlightsToDOM = (
  container: HTMLElement,
  highlights: Highlight[],
  onClickHighlight: (highlightId: string) => void
): void => {
  if (!highlights?.length || !container) return;

  const fullText = container.textContent || '';

  // Find positions for all highlights and sort by position (reverse) to avoid offset drift
  const positioned = highlights
    .map(h => {
      const pos = findHighlightPosition(fullText, h);
      return pos ? { ...h, ...pos } : null;
    })
    .filter((h): h is Highlight & { start: number; end: number } => h !== null)
    .sort((a, b) => b.start - a.start); // reverse order

  for (const h of positioned) {
    wrapTextRange(container, h.start, h.end, h.id, !!h.note, onClickHighlight);
  }
};

/**
 * Walk through text nodes to find the character position range
 * and wrap it in a <mark> element.
 */
const wrapTextRange = (
  container: HTMLElement,
  startPos: number,
  endPos: number,
  id: string,
  hasNote: boolean,
  onClick: (id: string) => void
): void => {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let currentPos = 0;
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const nodeLen = (node.textContent || '').length;

    if (!startNode && currentPos + nodeLen > startPos) {
      startNode = node;
      startOffset = startPos - currentPos;
    }

    if (currentPos + nodeLen >= endPos) {
      endNode = node;
      endOffset = endPos - currentPos;
      break;
    }

    currentPos += nodeLen;
  }

  if (!startNode || !endNode) return;

  try {
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);

    const mark = document.createElement('mark');
    mark.className = 'article-highlight';
    mark.dataset.highlightId = id;
    if (hasNote) mark.classList.add('has-note');

    // This works when the range is within a single parent element
    range.surroundContents(mark);

    mark.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick(id);
    });

    mark.addEventListener('mouseenter', () => {
      container.querySelectorAll(`[data-highlight-id="${id}"]`).forEach(el => {
        el.classList.add('is-hovered');
      });
    });

    mark.addEventListener('mouseleave', () => {
      container.querySelectorAll(`[data-highlight-id="${id}"]`).forEach(el => {
        el.classList.remove('is-hovered');
      });
    });
  } catch {
    // surroundContents fails when range crosses element boundaries.
    // Fallback: wrap text nodes individually within the range
    try {
      wrapRangeAcrossElements(container, startPos, endPos, id, hasNote, onClick);
    } catch {
      logger.warn('Could not apply highlight', { id });
    }
  }
};

/**
 * Fallback: handles highlighting across multiple elements by wrapping
 * each text node's portion individually.
 */
const wrapRangeAcrossElements = (
  container: HTMLElement,
  startPos: number,
  endPos: number,
  id: string,
  hasNote: boolean,
  onClick: (id: string) => void
): void => {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let currentPos = 0;
  const nodesToWrap: { node: Text; from: number; to: number }[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const text = node.textContent || '';
    const nodeStart = currentPos;
    const nodeEnd = currentPos + text.length;

    if (nodeEnd > startPos && nodeStart < endPos) {
      const from = Math.max(0, startPos - nodeStart);
      const to = Math.min(text.length, endPos - nodeStart);
      nodesToWrap.push({ node, from, to });
    }

    if (nodeEnd >= endPos) break;
    currentPos += text.length;
  }

  // Wrap in reverse order to avoid offset shifts
  for (const { node, from, to } of nodesToWrap.reverse()) {
    const range = document.createRange();
    range.setStart(node, from);
    range.setEnd(node, to);

    const mark = document.createElement('mark');
    mark.className = 'article-highlight';
    mark.dataset.highlightId = id;
    if (hasNote) mark.classList.add('has-note');

    range.surroundContents(mark);
    mark.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick(id);
    });

    mark.addEventListener('mouseenter', () => {
      container.querySelectorAll(`[data-highlight-id="${id}"]`).forEach(el => {
        el.classList.add('is-hovered');
      });
    });

    mark.addEventListener('mouseleave', () => {
      container.querySelectorAll(`[data-highlight-id="${id}"]`).forEach(el => {
        el.classList.remove('is-hovered');
      });
    });
  }
};

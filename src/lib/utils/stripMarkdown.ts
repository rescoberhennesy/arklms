/**
 * Turns Markdown into plain text for short previews (notifications, etc.).
 * "Good morning, **no classes** tomorrow" → "Good morning, no classes tomorrow"
 */
export function stripMarkdown(md: string | null | undefined): string {
  if (!md) return '';
  return md
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')        // images → alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')          // links → link text
    .replace(/`([^`]*)`/g, '$1')                      // inline code
    .replace(/(\*\*|__)(.+?)\1/g, '$2')               // bold
    .replace(/(\*|_)(.+?)\1/g, '$2')                  // italic
    .replace(/~~(.+?)~~/g, '$1')                      // strikethrough
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')               // headings
    .replace(/^\s{0,3}>\s?/gm, '')                    // quotes
    .replace(/^\s*([-*+]|\d+\.)\s+/gm, '')            // list markers
    .replace(/\\([\\`*_{}\[\]()#+\-.!~>])/g, '$1')    // escaped characters
    .replace(/[*_~`]{2,}/g, '')                       // leftovers from cut-off previews
    .replace(/\s+/g, ' ')
    .trim();
}
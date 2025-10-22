/**
 * JIRA formatting utilities
 * Handles conversion of text content to Atlassian Document Format (ADF)
 */

export interface ADFNode {
  type: string;
  version?: number;
  attrs?: Record<string, any>;
  content?: ADFNode[];
  text?: string;
  marks?: Array<{ type: string }>;
}

export class JiraFormatter {
  /**
   * Convert text to ADF (Atlassian Document Format) for Jira descriptions
   */
  static textToADF(text: string): ADFNode {
    const content = JiraFormatter.parseTextToADFContent(text);

    return {
      type: 'doc',
      version: 1,
      content,
    };
  }

  /**
   * Parse text and convert to ADF content nodes
   */
  static parseTextToADFContent(text: string): ADFNode[] {
    const lines = text.split('\n');
    const content: ADFNode[] = [];
    let currentParagraph: string[] = [];
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];
    let codeBlockLanguage = '';

    const flushParagraph = () => {
      if (currentParagraph.length > 0) {
        const paragraphText = currentParagraph.join('\n').trim();
        if (paragraphText) {
          content.push({
            type: 'paragraph',
            content: JiraFormatter.parseInlineFormatting(paragraphText),
          });
        }
        currentParagraph = [];
      }
    };

    const flushCodeBlock = () => {
      if (codeBlockContent.length > 0) {
        content.push({
          type: 'codeBlock',
          attrs: { language: codeBlockLanguage || 'text' },
          content: [
            {
              type: 'text',
              text: codeBlockContent.join('\n'),
            },
          ],
        });
        codeBlockContent = [];
        codeBlockLanguage = '';
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue; // Skip undefined lines
      const trimmedLine = line.trim();

      // Handle code blocks
      if (trimmedLine.startsWith('```')) {
        if (inCodeBlock) {
          flushCodeBlock();
          inCodeBlock = false;
        } else {
          flushParagraph();
          inCodeBlock = true;
          codeBlockLanguage = trimmedLine.substring(3).trim();
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockContent.push(line);
        continue;
      }

      // Handle headers (# Header)
      if (trimmedLine.startsWith('#')) {
        flushParagraph();
        const hashMatch = trimmedLine.match(/^#+/);
        const level = Math.min(6, hashMatch ? hashMatch[0]!.length : 1);
        const headerText = trimmedLine.replace(/^#+\s*/, '');

        content.push({
          type: 'heading',
          attrs: { level },
          content: [{ type: 'text', text: headerText }],
        });
        continue;
      }

      // Handle bullet lists (- item or * item)
      if (trimmedLine.match(/^[-*]\s/)) {
        flushParagraph();
        const listItems: ADFNode[] = [];
        let j = i;

        while (j < lines.length && lines[j]?.trim().match(/^[-*]\s/)) {
          const itemText = lines[j]!.trim().replace(/^[-*]\s/, '');
          listItems.push({
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: JiraFormatter.parseInlineFormatting(itemText),
              },
            ],
          });
          j++;
        }

        content.push({
          type: 'bulletList',
          content: listItems,
        });

        i = j - 1;
        continue;
      }

      // Handle numbered lists (1. item)
      if (trimmedLine.match(/^\d+\.\s/)) {
        flushParagraph();
        const listItems: ADFNode[] = [];
        let j = i;

        while (j < lines.length && lines[j]?.trim().match(/^\d+\.\s/)) {
          const itemText = lines[j]!.trim().replace(/^\d+\.\s/, '');
          listItems.push({
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: JiraFormatter.parseInlineFormatting(itemText),
              },
            ],
          });
          j++;
        }

        content.push({
          type: 'orderedList',
          content: listItems,
        });

        i = j - 1;
        continue;
      }

      // Handle empty lines (paragraph breaks)
      if (trimmedLine === '') {
        flushParagraph();
        continue;
      }

      // Regular text - add to current paragraph
      currentParagraph.push(line);
    }

    // Flush any remaining content
    flushParagraph();
    flushCodeBlock();

    return content.length > 0
      ? content
      : [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }];
  }

  /**
   * Parse inline formatting (bold, italic, code)
   */
  static parseInlineFormatting(text: string): ADFNode[] {
    const content: ADFNode[] = [];
    let currentText = '';
    let i = 0;

    const flushText = () => {
      if (currentText) {
        content.push({ type: 'text', text: currentText });
        currentText = '';
      }
    };

    while (i < text.length) {
      // Handle inline code (`code`)
      if (text[i] === '`' && text[i + 1] !== '`') {
        flushText();
        const codeStart = i + 1;
        let codeEnd = text.indexOf('`', codeStart);
        if (codeEnd === -1) codeEnd = text.length;

        content.push({
          type: 'text',
          text: text.substring(codeStart, codeEnd),
          marks: [{ type: 'code' }],
        });

        i = codeEnd + 1;
        continue;
      }

      // Handle bold (**text**)
      if (text.substring(i, i + 2) === '**') {
        flushText();
        const boldStart = i + 2;
        const boldEnd = text.indexOf('**', boldStart);
        if (boldEnd !== -1) {
          content.push({
            type: 'text',
            text: text.substring(boldStart, boldEnd),
            marks: [{ type: 'strong' }],
          });
          i = boldEnd + 2;
          continue;
        }
      }

      // Handle italic (*text*)
      if (text[i] === '*' && text[i + 1] !== '*') {
        flushText();
        const italicStart = i + 1;
        const italicEnd = text.indexOf('*', italicStart);
        if (italicEnd !== -1) {
          content.push({
            type: 'text',
            text: text.substring(italicStart, italicEnd),
            marks: [{ type: 'em' }],
          });
          i = italicEnd + 1;
          continue;
        }
      }

      // Regular character
      const char = text[i];
      if (char) {
        currentText += char;
      }
      i++;
    }

    flushText();
    return content.length > 0 ? content : [{ type: 'text', text }];
  }
}

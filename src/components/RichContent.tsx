import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import type { Components } from 'react-markdown';

// Convert Google Drive share/view URLs to direct-embed URLs
function normalizeDriveImageUrl(src: string): string {
  if (!src) return src;
  const fileMatch = src.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return `https://drive.google.com/uc?export=view&id=${fileMatch[1]}`;
  const openMatch = src.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (openMatch) return `https://drive.google.com/uc?export=view&id=${openMatch[1]}`;
  return src;
}

// Scope CSS selectors to a container class to prevent styles leaking outside.
// In Tailwind v4 (which uses @layer), any <style> tag injected outside a layer
// overrides utility classes — this scoping prevents that.
function scopeStyles(css: string, scope: string): string {
  let result = '';
  let i = 0;
  const n = css.length;

  while (i < n) {
    // Skip block comments
    if (i + 1 < n && css[i] === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      result += end === -1 ? css.slice(i) : css.slice(i, end + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }

    // Find next brace character
    let nextBrace = n;
    let braceChar = '';
    for (let k = i; k < n; k++) {
      if (css[k] === '{' || css[k] === '}') { nextBrace = k; braceChar = css[k]; break; }
    }

    if (nextBrace === n) { result += css.slice(i); break; }

    const before = css.slice(i, nextBrace);
    const selector = before.trim();

    if (braceChar === '}') {
      result += before + '}';
    } else if (
      !selector ||
      selector.startsWith('@') ||
      /^(from|to|\d+(\.\d+)?%)/.test(selector) // keyframe selectors
    ) {
      result += before + '{';
    } else {
      // Scope each comma-separated selector to the container class
      const scoped = selector
        .split(',')
        .map(s => {
          const t = s.trim();
          if (!t) return t;
          // Replace document-root selectors with the scope itself
          if (['html', 'body', ':root', '*'].includes(t)) return scope;
          return `${scope} ${t}`;
        })
        .join(', ');
      result += scoped + ' {';
    }

    i = nextBrace + 1;
  }

  return result;
}

// Custom renderers for react-markdown
const markdownComponents: Components = {
  img({ src, alt, width, height, style, ...rest }) {
    const resolved = normalizeDriveImageUrl(src ?? '');
    const hasExplicitSize = width || height || (style as any)?.width || (style as any)?.height;
    return (
      <img
        src={resolved}
        alt={alt ?? ''}
        width={width}
        height={height}
        style={{
          maxWidth: '100%',
          height: hasExplicitSize ? height : 'auto',
          display: 'block',
          borderRadius: '8px',
          ...(style as React.CSSProperties),
        }}
        {...rest}
      />
    );
  },
  // Render iframes (embedded Drive videos, YouTube, etc.) responsively
  iframe({ src, width, height, ...rest }) {
    return (
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', borderRadius: '8px', overflow: 'hidden', margin: '12px 0' }}>
        <iframe
          src={src}
          width={width ?? '100%'}
          height={height ?? '100%'}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          {...rest}
        />
      </div>
    );
  },
  // Scope <style> tags so their rules only apply inside .rich-content
  style({ children }) {
    const rawCss = typeof children === 'string'
      ? children
      : Array.isArray(children)
        ? (children as unknown[]).filter(c => typeof c === 'string').join('')
        : '';
    if (!rawCss.trim()) return null;
    const scoped = scopeStyles(rawCss, '.rich-content');
    return <style dangerouslySetInnerHTML={{ __html: scoped }} />;
  },
  // Block <script> tags for security
  script() {
    return null;
  },
};

interface RichContentProps {
  content: string;
  className?: string;
}

export default function RichContent({ content, className = '' }: RichContentProps) {
  return (
    <div className={`rich-content ${className}`}>
      <ReactMarkdown
        rehypePlugins={[rehypeRaw]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

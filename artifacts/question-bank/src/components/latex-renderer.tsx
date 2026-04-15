import React from "react";
import katex from "katex";

interface LatexRendererProps {
  content: string;
  className?: string;
}

function hasMathDelimiters(text: string): boolean {
  return /\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/.test(text);
}

function looksLikeLatexExpression(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  return (
    /\\[a-zA-Z]+/.test(trimmed) ||
    /[\^_][{(\w-]/.test(trimmed) ||
    /\{[^}]*\}/.test(trimmed)
  );
}

export function LatexRenderer({ content, className = "" }: LatexRendererProps) {
  const renderLatex = (text: string) => {
    if (!hasMathDelimiters(text) && looksLikeLatexExpression(text)) {
      try {
        const html = katex.renderToString(text.trim(), {
          displayMode: false,
          throwOnError: false,
        });

        return [
          <span
            key="auto-latex"
            dangerouslySetInnerHTML={{ __html: html }}
            className="inline-block overflow-x-auto"
          />,
        ];
      } catch {
        // Fall through to mixed text+math parser below.
      }
    }

    const parts: Array<{ type: "text" | "inline" | "block"; content: string }> = [];
    let currentIndex = 0;

    // Supports $$...$$, $...$, \[...\], and \(...\)
    const regex = /(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > currentIndex) {
        parts.push({ type: "text", content: text.slice(currentIndex, match.index) });
      }

      const token = match[0];

      if (token.startsWith("$$") && token.endsWith("$$")) {
        parts.push({ type: "block", content: token.slice(2, -2) });
      } else if (token.startsWith("\\[") && token.endsWith("\\]")) {
        parts.push({ type: "block", content: token.slice(2, -2) });
      } else if (token.startsWith("\\(") && token.endsWith("\\)")) {
        parts.push({ type: "inline", content: token.slice(2, -2) });
      } else {
        parts.push({ type: "inline", content: token.slice(1, -1) });
      }

      currentIndex = regex.lastIndex;
    }

    if (currentIndex < text.length) {
      parts.push({ type: "text", content: text.slice(currentIndex) });
    }

    return parts.map((part, index) => {
      if (part.type === "text") {
        return (
          <span key={index} className="whitespace-pre-wrap">
            {part.content}
          </span>
        );
      }

      try {
        const html = katex.renderToString(part.content, {
          displayMode: part.type === "block",
          throwOnError: false,
        });
        return (
          <span
            key={index}
            dangerouslySetInnerHTML={{ __html: html }}
            className={part.type === "block" ? "block my-2 overflow-x-auto" : "inline-block"}
          />
        );
      } catch (error) {
        console.error("KaTeX error:", error);
        return (
          <span key={index} className="text-destructive">
            {part.content}
          </span>
        );
      }
    });
  };

  return (
    <div className={`prose dark:prose-invert max-w-none ${className}`}>
      {renderLatex(content)}
    </div>
  );
}

import React from "react";
import katex from "katex";

interface LatexRendererProps {
  content: string;
  className?: string;
}

export function LatexRenderer({ content, className = "" }: LatexRendererProps) {
  const renderLatex = (text: string) => {
    // Basic regex to find block ($$) and inline ($) latex
    const parts = [];
    let currentIndex = 0;
    
    // Regex for $$...$$ or $...$
    const regex = /(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      // Add text before match
      if (match.index > currentIndex) {
        parts.push({
          type: "text",
          content: text.slice(currentIndex, match.index),
        });
      }

      const matchText = match[0];
      const isBlock = matchText.startsWith("$$");
      const latexContent = isBlock
        ? matchText.slice(2, -2)
        : matchText.slice(1, -1);

      parts.push({
        type: isBlock ? "block" : "inline",
        content: latexContent,
      });

      currentIndex = regex.lastIndex;
    }

    // Add remaining text
    if (currentIndex < text.length) {
      parts.push({
        type: "text",
        content: text.slice(currentIndex),
      });
    }

    return parts.map((part, index) => {
      if (part.type === "text") {
        return <React.Fragment key={index}>{part.content}</React.Fragment>;
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
            className={part.type === "block" ? "block my-2" : "inline-block"}
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

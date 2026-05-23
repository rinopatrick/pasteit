import { useEffect, useRef } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-go";
import "prismjs/components/prism-java";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-css";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-markdown";

const LANG_MAP: Record<string, string> = {
  text: "none",
  javascript: "javascript",
  typescript: "typescript",
  python: "python",
  rust: "rust",
  go: "go",
  java: "java",
  c: "c",
  cpp: "cpp",
  html: "markup",
  css: "css",
  json: "json",
  yaml: "yaml",
  sql: "sql",
  bash: "bash",
  markdown: "markdown",
};

export const THEMES = [
  { id: "tomorrow", label: "Tomorrow Night" },
  { id: "dracula", label: "Dracula" },
  { id: "monokai", label: "Monokai" },
  { id: "solarized", label: "Solarized Light" },
];

interface Props {
  code: string;
  language: string;
  showLineNumbers?: boolean;
  theme?: string;
}

export default function SyntaxHighlight({
  code,
  language,
  showLineNumbers = true,
  theme = "tomorrow",
}: Props) {
  const codeRef = useRef<HTMLElement>(null);
  const prismLang = LANG_MAP[language] || "none";

  useEffect(() => {
    if (codeRef.current && prismLang !== "none") {
      Prism.highlightElement(codeRef.current);
    }
  }, [code, prismLang]);

  if (prismLang === "none") {
    return (
      <pre className={`theme-${theme} bg-slate-900/60 rounded-xl p-5 overflow-x-auto text-sm font-mono text-slate-200 whitespace-pre-wrap break-words`}>
        {code}
      </pre>
    );
  }

  const lines = code.split("\n");

  return (
    <div className={`theme-${theme} relative`}>
      {showLineNumbers && (
        <div className="absolute left-0 top-0 w-10 text-right pr-3 pt-5 text-slate-600 text-xs font-mono select-none leading-relaxed">
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
      )}
      <pre
        className={`bg-slate-900/60 rounded-xl overflow-x-auto text-sm font-mono ${
          showLineNumbers ? "pl-12" : "pl-5"
        } pr-5 pt-5 pb-5`}
      >
        <code ref={codeRef} className={`language-${prismLang}`}>
          {code}
        </code>
      </pre>
    </div>
  );
}

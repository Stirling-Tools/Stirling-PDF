import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionIcon, Box, Button, Group, Stack, Text, ScrollArea, TextInput } from "@mantine/core";
import LocalIcon from "@app/components/shared/LocalIcon";
import "@app/components/tools/showJS/ShowJSView.css";
import { useTranslation } from "react-i18next";
import { useFileActionTerminology } from "@app/hooks/useFileActionTerminology";

import {
  tokenizeToLines,
  computeBlocks,
  computeSearchMatches,
  copyTextToClipboard,
  triggerDownload,
  type ShowJsToken,
} from "@app/components/tools/showJS/utils";

interface ScriptData {
  scriptText: string;
  downloadUrl?: string | null;
  downloadFilename?: string | null;
}

interface ShowJSViewProps {
  data: string | ScriptData;
}

const ShowJSView: React.FC<ShowJSViewProps> = ({ data }) => {
  const { t } = useTranslation();
  const terminology = useFileActionTerminology();
  const text = useMemo(() => {
    if (typeof data === "string") return data;
    return data?.scriptText ?? "";
  }, [data]);
  const downloadUrl = useMemo(() => {
    if (typeof data === "string") return null;
    return data?.downloadUrl ?? null;
  }, [data]);
  const downloadFilename = useMemo(() => {
    if (typeof data === "string") return null;
    return data?.downloadFilename ?? null;
  }, [data]);
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaInnerRef = useRef<HTMLDivElement | null>(null);

  const handleCopy = useCallback(async () => {
    const ok = await copyTextToClipboard(text || "", codeRef.current);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }, [text]);

  const handleDownload = useCallback(() => {
    if (!downloadUrl) return;
    triggerDownload(downloadUrl, downloadFilename || "extracted.js");
  }, [downloadUrl, downloadFilename]);

  const [lines, setLines] = useState<ShowJsToken[][]>([]);
  const [blocks, setBlocks] = useState<Array<{ start: number; end: number }>>([]);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  useEffect(() => {
    const src = text || "";
    setLines(tokenizeToLines(src));
    setBlocks(computeBlocks(src));
    setCollapsed(new Set());
  }, [text]);

  const startToEnd = useMemo(() => {
    const m = new Map<number, number>();
    for (const b of blocks) if (!m.has(b.start)) m.set(b.start, b.end);
    return m;
  }, [blocks]);

  const isHidden = useCallback(
    (ln: number) => {
      for (const s of collapsed) {
        const e = startToEnd.get(s);
        if (e != null && ln > s && ln <= e) return true;
      }
      return false;
    },
    [collapsed, startToEnd],
  );

  const toggleFold = (ln: number) => {
    if (!startToEnd.has(ln)) return;
    setCollapsed((prev) => {
      const n = new Set(prev);
      if (n.has(ln)) n.delete(ln);
      else n.add(ln);
      return n;
    });
  };

  // Search
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Array<{ line: number; start: number; end: number }>>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!query) {
      setMatches([]);
      setActive(0);
      return;
    }
    const list = computeSearchMatches(lines, query);
    setMatches(list);
    setActive(list.length ? 0 : 0);
  }, [query, lines]);

  useEffect(() => {
    const m = matches[active];
    if (!m) return;
    for (const [s, e] of startToEnd.entries()) {
      if (m.line > s && m.line <= e && collapsed.has(s)) {
        setCollapsed((prev) => {
          const n = new Set(prev);
          n.delete(s);
          return n;
        });
      }
    }
    if (scrollAreaInnerRef.current) {
      const el = scrollAreaInnerRef.current.querySelector(`[data-code-line="${m.line}"]`) as HTMLElement | null;
      if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [active, matches, startToEnd, collapsed]);

  return (
    <Stack gap="sm" p="sm" className="showjs-root">
      <Box className="showjs-container">
        <div className="showjs-toolbar">
          <Group gap="xs" align="center" className="showjs-toolbar-controls">
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              size="xs"
              placeholder={t("search.placeholder", "Enter search term...")}
              className="showjs-search-input"
            />
            <Text size="xs" c="dimmed">
              {matches.length ? `${active + 1}/${matches.length}` : "0/0"}
            </Text>
            <ActionIcon
              size="sm"
              variant="subtle"
              onClick={() => {
                if (matches.length) setActive((p) => (p - 1 + matches.length) % matches.length);
              }}
              aria-label={t("common.previous", "Previous")}
            >
              <LocalIcon icon="arrow-upward-rounded" width={20} height={20} />
            </ActionIcon>
            <ActionIcon
              size="sm"
              variant="subtle"
              onClick={() => {
                if (matches.length) setActive((p) => (p + 1) % matches.length);
              }}
              aria-label={t("common.next", "Next")}
            >
              <LocalIcon icon="arrow-downward-rounded" width={20} height={20} />
            </ActionIcon>
          </Group>
          <Group gap="xs" align="center" className="showjs-toolbar-controls">
            <Button
              size="xs"
              variant="subtle"
              className="showjs-outline-button"
              onClick={handleDownload}
              disabled={!downloadUrl}
              leftSection={<LocalIcon icon="download-rounded" width={20} height={20} />}
            >
              {terminology.download}
            </Button>
            <Button
              size="xs"
              variant="subtle"
              className="showjs-outline-button"
              onClick={handleCopy}
              leftSection={<LocalIcon icon="content-copy-rounded" width={20} height={20} />}
            >
              {copied ? t("common.copied", "Copied!") : t("common.copy", "Copy")}
            </Button>
          </Group>
        </div>
        <ScrollArea className="showjs-scrollarea" offsetScrollbars>
          <div ref={scrollAreaInnerRef} className="showjs-inner">
            <div ref={codeRef} className="showjs-code">
              {lines.map((tokens, ln) => {
                if (isHidden(ln)) return null;
                const end = startToEnd.get(ln);
                const folded = end != null && collapsed.has(ln);
                let pos = 0;
                const lineMatches = matches.map((m, idx) => ({ ...m, idx })).filter((m) => m.line === ln);
                const content: React.ReactNode[] = [];
                tokens.forEach((tok, ti) => {
                  const textSeg = tok.text;
                  const tokenStart = pos;
                  const tokenEnd = pos + textSeg.length;

                  if (!query || lineMatches.length === 0) {
                    const cls = tok.type === "plain" ? undefined : `tok-${tok.type}`;
                    content.push(
                      <span key={`t-${ln}-${ti}`} className={cls}>
                        {textSeg}
                      </span>,
                    );
                    pos = tokenEnd;
                    return;
                  }

                  // Collect matches that intersect this token
                  const matchesInToken = lineMatches
                    .filter((m) => m.start < tokenEnd && m.end > tokenStart)
                    .sort((a, b) => a.start - b.start);

                  if (matchesInToken.length === 0) {
                    const cls = tok.type === "plain" ? undefined : `tok-${tok.type}`;
                    content.push(
                      <span key={`t-${ln}-${ti}`} className={cls}>
                        {textSeg}
                      </span>,
                    );
                    pos = tokenEnd;
                    return;
                  }

                  let cursor = 0;
                  const tokenCls = tok.type === "plain" ? "" : `tok-${tok.type}`;

                  matchesInToken.forEach((m, mi) => {
                    const localStart = Math.max(0, m.start - tokenStart);
                    const localEnd = Math.min(textSeg.length, m.end - tokenStart);

                    // before match
                    if (localStart > cursor) {
                      const beforeText = textSeg.slice(cursor, localStart);
                      const cls = tokenCls || undefined;
                      content.push(
                        <span key={`t-${ln}-${ti}-b-${cursor}`} className={cls}>
                          {beforeText}
                        </span>,
                      );
                    }
                    // matched piece
                    const hitText = textSeg.slice(localStart, localEnd);
                    const hitCls =
                      ["search-hit", m.idx === active ? "search-hit-active" : "", tokenCls].filter(Boolean).join(" ") ||
                      undefined;
                    content.push(
                      <span key={`t-${ln}-${ti}-h-${localStart}-${mi}`} className={hitCls}>
                        {hitText}
                      </span>,
                    );
                    cursor = localEnd;
                  });

                  // tail after last match
                  if (cursor < textSeg.length) {
                    const tailText = textSeg.slice(cursor);
                    const cls = tokenCls || undefined;
                    content.push(
                      <span key={`t-${ln}-${ti}-a-${cursor}`} className={cls}>
                        {tailText}
                      </span>,
                    );
                  }

                  pos = tokenEnd;
                });
                return (
                  <div key={`l-${ln}`} className="code-line" data-code-line={ln}>
                    <div className="code-gutter">
                      {end != null ? (
                        <button
                          className={`fold-toggle ${folded ? "fold-collapsed" : ""}`}
                          onClick={() => toggleFold(ln)}
                          aria-label={folded ? t("common.expand", "Expand") : t("common.collapse", "Collapse")}
                        >
                          {folded ? "▸" : "▾"}
                        </button>
                      ) : (
                        <span className="fold-placeholder" />
                      )}
                      <span className="line-number">{ln + 1}</span>
                    </div>
                    <div className="code-content">
                      {content}
                      {folded && <span className="collapsed-inline">{"{...}"}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </ScrollArea>
      </Box>
    </Stack>
  );
};

export default ShowJSView;

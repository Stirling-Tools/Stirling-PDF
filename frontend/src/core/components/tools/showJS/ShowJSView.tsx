import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionIcon, Box, Button, Group, Stack, Text, ScrollArea, TextInput } from '@mantine/core';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import '@app/components/tools/showJS/ShowJSView.css';
import { useTranslation } from 'react-i18next';

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
	const text = useMemo(() => {
		if (typeof data === 'string') return data;
		return data?.scriptText ?? '';
	}, [data]);
	const downloadUrl = useMemo(() => {
		if (typeof data === 'string') return null;
		return data?.downloadUrl ?? null;
	}, [data]);
	const downloadFilename = useMemo(() => {
		if (typeof data === 'string') return null;
		return data?.downloadFilename ?? null;
	}, [data]);
	const [copied, setCopied] = useState(false);
	const codeRef = useRef<HTMLDivElement | null>(null);
	const scrollAreaInnerRef = useRef<HTMLDivElement | null>(null);

	const handleCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(text || '');
			setCopied(true);
			setTimeout(() => setCopied(false), 1200);
		} catch {
			// Fallback: try selection copy
			const el = codeRef.current;
			if (!el) return;
			const selection = window.getSelection();
			const range = document.createRange();
			range.selectNodeContents(el);
			selection?.removeAllRanges();
			selection?.addRange(range);
			try {
				document.execCommand('copy');
				setCopied(true);
				setTimeout(() => setCopied(false), 1200);
			} finally {
				selection?.removeAllRanges();
			}
		}
	}, [text]);

	const handleDownload = useCallback(() => {
		if (!downloadUrl) return;
		const a = document.createElement('a');
		a.href = downloadUrl;
		a.download = downloadFilename || 'extracted.js';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}, [downloadUrl, downloadFilename]);

	// Tokenize to lines for highlight, folding and search
	type TokenType = 'kw' | 'str' | 'num' | 'com' | 'plain';
	type Token = { type: TokenType; text: string };
	const KEYWORDS = useMemo(() => new Set([
		'break','case','catch','class','const','continue','debugger','default','delete','do','else','export','extends','finally','for','function','if','import','in','instanceof','let','new','return','super','switch','this','throw','try','typeof','var','void','while','with','yield','await','of'
	]), []);

	const tokenizeToLines = useCallback((src: string): Token[][] => {
		const lines: Token[][] = [];
		let current: Token[] = [];
		let i = 0;
		let inBlockCom = false;
		let inLineCom = false;
		let inString: '"' | "'" | '`' | null = null;
		let escaped = false;
		const push = (type: TokenType, s: string) => { if (s) current.push({ type, text: s }); };
		while (i < src.length) {
			const ch = src[i];
			const next = src[i + 1];
			if (ch === '\n') { lines.push(current); current = []; inLineCom = false; i++; continue; }
			if (inLineCom) { push('com', ch); i++; continue; }
			if (inBlockCom) {
				if (ch === '*' && next === '/') { push('com', '*/'); inBlockCom = false; i += 2; continue; }
				push('com', ch); i++; continue;
			}
			if (inString) {
				push('str', ch);
				if (!escaped) {
					if (ch === '\\') escaped = true;
					else if (ch === inString) inString = null;
				} else { escaped = false; }
				i++; continue;
			}
			if (ch === '/' && next === '/') { push('com', '//'); inLineCom = true; i += 2; continue; }
			if (ch === '/' && next === '*') { push('com', '/*'); inBlockCom = true; i += 2; continue; }
			if (ch === '\'' || ch === '"' || ch === '`') { inString = ch; push('str', ch); i++; continue; }
			if (/[0-9]/.test(ch)) { let j=i+1; while (j<src.length && /[0-9._xobA-Fa-f]/.test(src[j])) j++; push('num', src.slice(i,j)); i=j; continue; }
			if (/[A-Za-z_$]/.test(ch)) { let j=i+1; while (j<src.length && /[A-Za-z0-9_$]/.test(src[j])) j++; const id=src.slice(i,j); push(KEYWORDS.has(id)?'kw':'plain', id); i=j; continue; }
			push('plain', ch); i++;
		}
		lines.push(current);
		return lines;
	}, [KEYWORDS]);

	const computeBlocks = useCallback((src: string) => {
		const res: Array<{ start: number; end: number }> = [];
		let i=0, line=0;
		let inBlock=false, inLine=false, str: '"' | "'" | '`' | null = null, esc=false;
		const stack: number[] = [];
		while (i < src.length) {
			const ch = src[i], nx = src[i+1];
			if (ch === '\n') { line++; inLine=false; i++; continue; }
			if (inLine) { i++; continue; }
			if (inBlock) { if (ch==='*'&&nx=== '/') { inBlock=false; i+=2; } else i++; continue; }
			if (str) { if (!esc) { if (ch==='\\') esc=true; else if (ch===str) str=null; } else esc=false; i++; continue; }
			if (ch==='/'&&nx==='/' ){ inLine=true; i+=2; continue; }
			if (ch==='/'&&nx==='*' ){ inBlock=true; i+=2; continue; }
			if (ch=== '\'' || ch=== '"' || ch==='`'){ str=ch; i++; continue; }
			if (ch === '{') { stack.push(line); i++; continue; }
			if (ch === '}') { const s = stack.pop(); if (s!=null && line>s) res.push({ start:s, end:line }); i++; continue; }
			i++;
		}
		return res;
	}, []);

	const [lines, setLines] = useState<Token[][]>([]);
	const [blocks, setBlocks] = useState<Array<{ start: number; end: number }>>([]);
	const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

	useEffect(() => {
		const src = text || '';
		setLines(tokenizeToLines(src));
		setBlocks(computeBlocks(src));
		setCollapsed(new Set());
	}, [text, tokenizeToLines, computeBlocks]);

	const startToEnd = useMemo(() => {
		const m = new Map<number, number>();
		for (const b of blocks) if (!m.has(b.start)) m.set(b.start, b.end);
		return m;
	}, [blocks]);

	const isHidden = useCallback((ln: number) => {
		for (const s of collapsed) {
			const e = startToEnd.get(s);
			if (e != null && ln > s && ln <= e) return true;
		}
		return false;
	}, [collapsed, startToEnd]);

	const toggleFold = (ln: number) => {
		if (!startToEnd.has(ln)) return;
		setCollapsed(prev => {
			const n = new Set(prev);
			if (n.has(ln)) n.delete(ln); else n.add(ln);
			return n;
		});
	};

	// Search
	const [query, setQuery] = useState('');
	const [matches, setMatches] = useState<Array<{ line:number; start:number; end:number }>>([]);
	const [active, setActive] = useState(0);

	useEffect(() => {
		if (!query) { setMatches([]); setActive(0); return; }
		const q = query.toLowerCase();
		const list: Array<{ line:number; start:number; end:number }> = [];
		lines.forEach((toks, ln) => {
			const raw = toks.map(t => t.text).join('');
			let idx = 0;
			while (true) {
				const pos = raw.toLowerCase().indexOf(q, idx);
				if (pos === -1) break;
				list.push({ line: ln, start: pos, end: pos + q.length });
				idx = pos + Math.max(1, q.length);
			}
		});
		setMatches(list);
		setActive(list.length ? 0 : 0);
	}, [query, lines]);

	useEffect(() => {
		const m = matches[active];
		if (!m) return;
		for (const [s,e] of startToEnd.entries()) {
		 if (m.line > s && m.line <= e && collapsed.has(s)) {
		 	setCollapsed(prev => { const n = new Set(prev); n.delete(s); return n; });
		 }
		}
		if (scrollAreaInnerRef.current) {
			const el = scrollAreaInnerRef.current.querySelector(`[data-code-line="${m.line}"]`) as HTMLElement | null;
			if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		}
	}, [active, matches, startToEnd, collapsed]);

	return (
		<Stack gap="sm" p="sm" style={{ height: '100%', marginLeft: '1rem', marginRight: '1rem' }}>
			<Box
				style={{
					position: 'relative',
					height: '100%',
					minHeight: 360,
					border: '1px solid var(--mantine-color-gray-4)',
					borderRadius: 8,
					overflow: 'hidden',
					background: 'var(--right-rail-bg)',
				}}
			>
				<div
					style={{
						position: 'sticky',
						top: 8,
						right: 8,
						display: 'flex',
						justifyContent: 'space-between',
						alignItems: 'center',
						zIndex: 0,
						padding: 8,
						background: 'transparent',
                        marginBottom: '10px',
                        marginLeft: '6px',
						pointerEvents: 'none',
					}}
				>
					<Group gap="xs" align="center" style={{ pointerEvents: 'auto' }}>
						<TextInput
							value={query}
							onChange={(e) => setQuery(e.currentTarget.value)}
							size="xs"
							placeholder={t('search.placeholder', 'Enter search term...')}
							style={{ width: 220 }}
						/>
						<Text size="xs" c="dimmed">
							{matches.length ? `${active + 1}/${matches.length}` : '0/0'}
						</Text>
						<ActionIcon size="sm" variant="subtle" onClick={() => { if (matches.length) setActive((p)=>(p-1+matches.length)%matches.length); }} aria-label={t('common.previous', 'Previous')}>
							<ArrowUpwardRoundedIcon fontSize="small" />
						</ActionIcon>
						<ActionIcon size="sm" variant="subtle" onClick={() => { if (matches.length) setActive((p)=>(p+1)%matches.length); }} aria-label={t('common.next', 'Next')}>
							<ArrowDownwardRoundedIcon fontSize="small" />
						</ActionIcon>
					</Group>
					<Group gap="xs" align="center" style={{ pointerEvents: 'auto' }}>
						<Button
							size="xs"
							variant="subtle"
							style={{
								background: 'transparent',
								border: '1px solid currentColor',
								color: 'var(--mantine-color-blue-5)'
							}}
							onClick={handleDownload}
							disabled={!downloadUrl}
							leftSection={<DownloadRoundedIcon fontSize="small" />}
						>
							{t('download', 'Download')}
						</Button>
						<Button
						size="xs"
						variant="subtle"
							style={{
								background: 'transparent',
								border: '1px solid currentColor',
								color: 'var(--mantine-color-blue-5)'
							}}
							onClick={handleCopy}
							leftSection={<ContentCopyRoundedIcon fontSize="small" />}
						>
							{copied ? t('common.copied', 'Copied!') : t('common.copy', 'Copy')}
						</Button>
					</Group>
				</div>
				<ScrollArea
					style={{ height: 'calc(100vh - 220px)' }}
					offsetScrollbars
				>
					<div ref={scrollAreaInnerRef} style={{ padding: '40px 24px 24px 24px' }}>
						<div
							ref={codeRef}
							className="showjs-code"
						>
							{lines.map((tokens, ln) => {
								if (isHidden(ln)) return null;
								const end = startToEnd.get(ln);
								const folded = end != null && collapsed.has(ln);
								let pos = 0;
								const lineMatches = matches.map((m, idx) => ({ ...m, idx })).filter(m => m.line === ln);
								const content: React.ReactNode[] = [];
								tokens.forEach((tok, ti) => {
									const textSeg = tok.text;
									const tokenStart = pos;
									const tokenEnd = pos + textSeg.length;

									if (!query || lineMatches.length === 0) {
										const cls = tok.type === 'plain' ? undefined : `tok-${tok.type}`;
										content.push(<span key={`t-${ln}-${ti}`} className={cls}>{textSeg}</span>);
										pos = tokenEnd;
										return;
									}

									// Collect matches that intersect this token
									const matchesInToken = lineMatches
										.filter(m => m.start < tokenEnd && m.end > tokenStart)
										.sort((a, b) => a.start - b.start);

									if (matchesInToken.length === 0) {
										const cls = tok.type === 'plain' ? undefined : `tok-${tok.type}`;
										content.push(<span key={`t-${ln}-${ti}`} className={cls}>{textSeg}</span>);
										pos = tokenEnd;
										return;
									}

									let cursor = 0;
									const tokenCls = tok.type === 'plain' ? '' : `tok-${tok.type}`;

									matchesInToken.forEach((m, mi) => {
										const localStart = Math.max(0, m.start - tokenStart);
										const localEnd = Math.min(textSeg.length, m.end - tokenStart);

										// before match
										if (localStart > cursor) {
											const beforeText = textSeg.slice(cursor, localStart);
											const cls = tokenCls || undefined;
											content.push(<span key={`t-${ln}-${ti}-b-${cursor}`} className={cls}>{beforeText}</span>);
										}
										// matched piece
										const hitText = textSeg.slice(localStart, localEnd);
										const hitCls = ['search-hit', (m.idx === active ? 'search-hit-active' : ''), tokenCls]
											.filter(Boolean).join(' ') || undefined;
										content.push(<span key={`t-${ln}-${ti}-h-${localStart}-${mi}`} className={hitCls}>{hitText}</span>);
										cursor = localEnd;
									});

									// tail after last match
									if (cursor < textSeg.length) {
										const tailText = textSeg.slice(cursor);
										const cls = tokenCls || undefined;
										content.push(<span key={`t-${ln}-${ti}-a-${cursor}`} className={cls}>{tailText}</span>);
									}

									pos = tokenEnd;
								});
								return (
									<div key={`l-${ln}`} className="code-line" data-code-line={ln}>
										<div className="code-gutter">
											{end != null ? (
												<button
													className={`fold-toggle ${folded ? 'fold-collapsed' : ''}`}
													onClick={() => toggleFold(ln)}
													aria-label={folded ? t('common.expand', 'Expand') : t('common.collapse', 'Collapse')}
												>
													{folded ? '▸' : '▾'}
												</button>
											) : <span className="fold-placeholder" />}
											<span className="line-number">{ln + 1}</span>
										</div>
										<div className="code-content">
											{content}
											{folded && (
												<span className="collapsed-inline">{"{...}"}</span>
											)}
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



import { Combobox, ScrollArea, useCombobox } from '@mantine/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NavigationDropdownProps } from '@app/types/compare';

const CompareNavigationDropdown = ({
  changes,
  placeholder,
  className,
  onNavigate,
  renderedPageNumbers,
}: NavigationDropdownProps) => {
  const { t } = useTranslation();
  const newLineLabel = t('compare.newLine', 'new-line');
  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption();
      // Cache scrollTop so we can restore on next open
      const viewport = viewportRef.current;
      if (viewport) scrollTopRef.current = viewport.scrollTop;
      setIsOpen(false);
    },
    onDropdownOpen: () => {
      setIsOpen(true);
      // Restore scrollTop after mount and rebuild offsets
      requestAnimationFrame(() => {
        const viewport = viewportRef.current;
        if (viewport) viewport.scrollTop = scrollTopRef.current;
        const headers = Array.from((viewportRef.current?.querySelectorAll('.compare-dropdown-group') ?? [])) as HTMLElement[];
        groupOffsetsRef.current = headers.map((el) => {
          const text = el.textContent || '';
          const page = parseInt(text.replace(/[^0-9]/g, ''), 10) || 0;
          return { top: el.offsetTop, page };
        });
        // Update sticky label based on current scroll position
        handleScrollPos({ x: 0, y: scrollTopRef.current });
      });
    },
  });

  const sanitize = (s: string) => {
    // Normalize and remove control/separator characters without regex ranges
    return s
      .normalize('NFKC')
      .split('')
      .map(char => {
        const code = char.charCodeAt(0);
        // Replace control chars (0-31, 127) and special separators with space
        if (code <= 31 || code === 127 || code === 0x2028 || code === 0x2029 || (code >= 0x200B && code <= 0x200F)) {
          return ' ';
        }
        return char;
      })
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const isMeaningful = (s: string) => {
    const t = sanitize(s);
  
    // Build a unicode-aware regex if supported; otherwise fall back to a plain ASCII class.
    const rx =
      (() => {
        try {
          // Construct at runtime so old engines don’t fail parse-time
          return new RegExp('[\\p{L}\\p{N}\\p{P}\\p{S}]', 'u');
        } catch {
          // Fallback (no Unicode props): letters, digits, and common punctuation/symbols
          return /[A-Za-z0-9.,!?;:(){}"'`~@#$%^&*+=|<>/[\]]/;
        }
      })();
  
    if (!rx.test(t)) return false;
    return t.length > 0;
  };

  
  const [query, setQuery] = useState('');
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [stickyPage, setStickyPage] = useState<number | null>(null);
  const groupOffsetsRef = useRef<Array<{ top: number; page: number }>>([]);
  const scrollTopRef = useRef(0);
  const [isOpen, setIsOpen] = useState(false);

  const normalizedChanges = useMemo(() => {
    // Helper to strip localized new-line marker occurrences from labels
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const stripNewLine = (s: string) =>
      s
        .replace(new RegExp(`\\b${esc(newLineLabel)}\\b`, 'gi'), ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const cleaned = changes
      .map((c) => ({ value: c.value, label: stripNewLine(sanitize(c.label)), pageNumber: c.pageNumber }))
      .filter((c) => isMeaningful(c.label) && c.label.length > 0 && c.label.toLowerCase() !== newLineLabel.toLowerCase());
    const q = sanitize(query).toLowerCase();
    if (!q) return cleaned;
    return cleaned.filter((c) => c.label.toLowerCase().includes(q));
  }, [changes, query, newLineLabel]);

  useEffect(() => {
    // Build offsets for group headers whenever list changes while open
    if (!isOpen) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const headers = Array.from(viewport.querySelectorAll('.compare-dropdown-group')) as HTMLElement[];
    groupOffsetsRef.current = headers.map((el) => {
      const text = el.textContent || '';
      const page = parseInt(text.replace(/[^0-9]/g, ''), 10) || 0;
      return { top: el.offsetTop, page };
    });
    // Update sticky based on current scroll position
    handleScrollPos({ x: 0, y: viewport.scrollTop });
  }, [normalizedChanges, isOpen]);

  const handleScrollPos = ({ y }: { x: number; y: number }) => {
    const offsets = groupOffsetsRef.current;
    if (offsets.length === 0) return;
    // Find the last header whose top is <= scroll, so the next header replaces it
    let low = 0;
    let high = offsets.length - 1;
    let idx = 0;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (offsets[mid].top <= y + 1) { // +1 to avoid jitter at exact boundary
        idx = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    const page = offsets[idx]?.page ?? offsets[0].page;
    if (page !== stickyPage) setStickyPage(page);
  };

  return (
    <Combobox
      store={combobox}
      withinPortal={false}
      onOptionSubmit={(value) => {
        const pn = normalizedChanges.find((c) => c.value === value)?.pageNumber;
        onNavigate(value, pn);
        combobox.closeDropdown();
      }}
      // Mantine Combobox does not accept controlled search props; handle via Combobox.Search directly
    >
      <Combobox.Target>
        <div
          className={['compare-changes-select', className].filter(Boolean).join(' ')}
          onClick={() => combobox.toggleDropdown()}
        >
          <span className="compare-changes-select__placeholder">{placeholder}</span>
          <Combobox.Chevron />
        </div>
      </Combobox.Target>

      <Combobox.Dropdown className="compare-changes-dropdown">
        {/* Header sits outside scroll so it stays fixed at top */}
        <div>
          <Combobox.Search
            placeholder={t('compare.dropdown.searchPlaceholder', 'Search changes...')}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
          />
        </div>
        {/* Lazy render the scrollable content only when open */}
        {isOpen && (
          <div className="compare-dropdown-scrollwrap">
            <ScrollArea.Autosize mah={300} viewportRef={viewportRef} onScrollPositionChange={handleScrollPos}>
              {stickyPage != null && (
                <div className="compare-dropdown-sticky" style={{ top: 0 }}>
                  {t('compare.summary.pageLabel', 'Page')}{' '}{stickyPage}
                  {renderedPageNumbers && !renderedPageNumbers.has(stickyPage) && (
                    <span className="compare-dropdown-rendering-flag"> — {t('compare.rendering.rendering', 'rendering')}</span>
                  )}
                </div>
              )}
              <Combobox.Options className="compare-dropdown-options">
              {normalizedChanges.length > 0 ? (
                (() => {
                  const nodes: React.ReactNode[] = [];
                  let lastPage: number | null = null;
                  for (const item of normalizedChanges) {
                    if (item.pageNumber && item.pageNumber !== lastPage) {
                      lastPage = item.pageNumber;
                      nodes.push(
                        <div
                          className={["compare-dropdown-group", stickyPage === lastPage ? "compare-dropdown-group--hidden" : ""].filter(Boolean).join(" ")}
                          key={`group-${lastPage}`}
                        >
                          {t('compare.summary.pageLabel', 'Page')}{' '}{lastPage}
                          {renderedPageNumbers && !renderedPageNumbers.has(lastPage) && (
                            <span className="compare-dropdown-rendering-flag"> — {t('compare.rendering.rendering', 'rendering')}</span>
                          )}
                        </div>
                      );
                    }
                    nodes.push(
                      <Combobox.Option
                        value={item.value}
                        key={item.value}
                        onClick={() => {
                          onNavigate(item.value, item.pageNumber);
                          combobox.closeDropdown();
                        }}
                      >
                        <div className="compare-dropdown-option">
                          <span className="compare-dropdown-option__text">{item.label}</span>
                        </div>
                      </Combobox.Option>
                    );
                  }
                  return nodes;
                })()
              ) : (
                <Combobox.Empty>{t('compare.dropdown.noResults', 'No changes found')}</Combobox.Empty>
              )}
              </Combobox.Options>
            </ScrollArea.Autosize>
          </div>
        )}
      </Combobox.Dropdown>
    </Combobox>
  );
};

export default CompareNavigationDropdown;

import { Combobox, ScrollArea, useCombobox } from '@mantine/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface NavigationDropdownProps {
  changes: Array<{ value: string; label: string; pageNumber?: number }>;
  placeholder: string;
  className?: string;
  onNavigate: (value: string, pageNumber?: number) => void;
}

const CompareNavigationDropdown = ({
  changes,
  placeholder,
  className,
  onNavigate,
}: NavigationDropdownProps) => {
  const { t } = useTranslation();
  const newLineLabel = t('compare.newLine', 'new-line');
  const formatPageLabel = (page: number) =>
    t('compare.dropdown.pagePrefix', { page, defaultValue: 'Page {{page}}' });
  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption();
      // Reset sticky header state when dropdown closes
      setStickyPage(null);
      groupOffsetsRef.current = [];
      const viewport = viewportRef.current;
      if (viewport) viewport.scrollTop = 0;
    },
    onDropdownOpen: () => {
      // Ensure we start at the top and initialize sticky to first page
      const viewport = viewportRef.current;
      if (viewport) viewport.scrollTop = 0;
      requestAnimationFrame(() => {
        const headers = Array.from((viewportRef.current?.querySelectorAll('.compare-dropdown-group') ?? [])) as HTMLElement[];
        // Rebuild offsets so scrolling after reopen updates correctly
        groupOffsetsRef.current = headers.map((el) => {
          const text = el.textContent || '';
          const page = parseInt(text.replace(/[^0-9]/g, ''), 10) || 0;
          return { top: el.offsetTop, page };
        });
        if (groupOffsetsRef.current.length > 0) {
          setStickyPage(groupOffsetsRef.current[0].page);
        } else {
          setStickyPage(null);
        }
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
    // Keep only items that have at least one letter or digit (unicode-aware)
    try {
      if (!/[\p{L}\p{N}]/u.test(t)) return false;
    } catch {
      if (!/[A-Za-z0-9]/.test(t)) return false;
    }
    return t.length > 0;
  };

  const [query, setQuery] = useState('');
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const [stickyPage, setStickyPage] = useState<number | null>(null);
  const [searchHeight, setSearchHeight] = useState(0);
  const groupOffsetsRef = useRef<Array<{ top: number; page: number }>>([]);

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
    // Measure search height for sticky offset
    setSearchHeight(searchRef.current?.offsetHeight ?? 0);
  }, []);

  useEffect(() => {
    // Build offsets for group headers whenever list changes
    const viewport = viewportRef.current;
    if (!viewport) return;
    const headers = Array.from(viewport.querySelectorAll('.compare-dropdown-group')) as HTMLElement[];
    groupOffsetsRef.current = headers.map((el) => {
      const text = el.textContent || '';
      const page = parseInt(text.replace(/[^0-9]/g, ''), 10) || 0;
      return { top: el.offsetTop, page };
    });
    // Initialize sticky label
    if (groupOffsetsRef.current.length > 0) {
      setStickyPage(groupOffsetsRef.current[0].page);
    } else {
      setStickyPage(null);
    }
  }, [normalizedChanges]);

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
          <span>{placeholder}</span>
          <Combobox.Chevron />
        </div>
      </Combobox.Target>

      <Combobox.Dropdown className="compare-changes-dropdown">
        <div className="compare-dropdown-scrollwrap">
          <ScrollArea.Autosize mah={300} viewportRef={viewportRef} onScrollPositionChange={handleScrollPos}>
            <div ref={searchRef}>
              <Combobox.Search
                placeholder={t('compare.dropdown.searchPlaceholder', 'Search changes...')}
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
              />
            </div>
            {stickyPage != null && (
              <div className="compare-dropdown-sticky" style={{ top: searchHeight }}>
                {t('compare.summary.pageLabel', 'Page')}{' '}{stickyPage}
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
      </Combobox.Dropdown>
    </Combobox>
  );
};

export default CompareNavigationDropdown;

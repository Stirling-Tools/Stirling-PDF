import { Combobox, ScrollArea, useCombobox } from '@mantine/core';
import { useMemo, useState } from 'react';
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
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
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

      <Combobox.Dropdown>
        <ScrollArea.Autosize mah={300}>
          <Combobox.Search placeholder="Search changes..." value={query} onChange={(e) => setQuery(e.currentTarget.value)} />
          <Combobox.Options>
            {normalizedChanges.length > 0 ? (
              normalizedChanges.map((item) => (
                <Combobox.Option
                  value={item.value}
                  key={item.value}
                  onClick={() => {
                    onNavigate(item.value, item.pageNumber);
                    combobox.closeDropdown();
                  }}
                >
                  {item.label}
                </Combobox.Option>
              ))
            ) : (
              <Combobox.Empty>No changes found</Combobox.Empty>
            )}
          </Combobox.Options>
        </ScrollArea.Autosize>
      </Combobox.Dropdown>
    </Combobox>
  );
};

export default CompareNavigationDropdown;

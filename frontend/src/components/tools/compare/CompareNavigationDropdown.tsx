import { Combobox, ScrollArea, useCombobox } from '@mantine/core';

interface NavigationDropdownProps {
  changes: Array<{ value: string; label: string }>;
  placeholder: string;
  className?: string;
  onNavigate: (value: string) => void;
}

const CompareNavigationDropdown = ({
  changes,
  placeholder,
  className,
  onNavigate,
}: NavigationDropdownProps) => {
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  return (
    <Combobox
      store={combobox}
      withinPortal={false}
      onOptionSubmit={(value) => {
        onNavigate(value);
        combobox.closeDropdown();
      }}
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
          <Combobox.Search placeholder="Search changes..." />
          <Combobox.Options>
            {changes.length > 0 ? (
              changes.map((item) => (
                <Combobox.Option
                  value={item.value}
                  key={item.value}
                  onClick={() => {
                    onNavigate(item.value);
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

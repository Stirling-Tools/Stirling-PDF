import React from 'react';
import { TextInput } from '@mantine/core';
import SearchIcon from '@mui/icons-material/Search';
import { useTranslation } from 'react-i18next';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  style?: React.CSSProperties;
}

const SearchInput: React.FC<SearchInputProps> = ({ value, onChange, style }) => {
  const { t } = useTranslation();

  return (
    <TextInput
      placeholder={t('fileManager.searchFiles', 'Search files...')}
      leftSection={<SearchIcon />}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={style}
    />
  );
};

export default SearchInput;
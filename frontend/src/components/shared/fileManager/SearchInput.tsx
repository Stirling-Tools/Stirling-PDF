import React from 'react';
import { TextInput } from '@mantine/core';
import SearchIcon from '@mui/icons-material/Search';
import { useTranslation } from 'react-i18next';
import { useFileManagerContext } from './FileManagerContext';

interface SearchInputProps {
  style?: React.CSSProperties;
}

const SearchInput: React.FC<SearchInputProps> = ({ style }) => {
  const { t } = useTranslation();
  const { searchTerm, onSearchChange } = useFileManagerContext();

  return (
    <TextInput
      placeholder={t('fileManager.searchFiles', 'Search files...')}
      leftSection={<SearchIcon />}
      value={searchTerm}
      onChange={(e) => onSearchChange(e.target.value)}
      style={style}
    />
  );
};

export default SearchInput;
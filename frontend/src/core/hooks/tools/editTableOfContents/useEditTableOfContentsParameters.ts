import { useCallback } from 'react';
import { useBaseParameters, type BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';
import { BookmarkNode } from '@app/utils/editTableOfContents';

export interface EditTableOfContentsParameters {
  replaceExisting: boolean;
  bookmarks: BookmarkNode[];
}

export interface EditTableOfContentsParametersHook extends BaseParametersHook<EditTableOfContentsParameters> {
  setBookmarks: (bookmarks: BookmarkNode[]) => void;
}

const defaultParameters: EditTableOfContentsParameters = {
  replaceExisting: true,
  bookmarks: [],
};

export const useEditTableOfContentsParameters = (): EditTableOfContentsParametersHook => {
  const base = useBaseParameters<EditTableOfContentsParameters>({
    defaultParameters,
    endpointName: 'edit-table-of-contents',
  });

  const setBookmarks = useCallback((bookmarks: BookmarkNode[]) => {
    base.setParameters(prev => ({
      ...prev,
      bookmarks,
    }));
  }, [base.setParameters]);

  return {
    ...base,
    setBookmarks,
  };
};


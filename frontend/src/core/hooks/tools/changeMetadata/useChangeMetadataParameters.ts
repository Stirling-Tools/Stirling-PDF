import { BaseParameters } from '@app/types/parameters';
import { TrappedStatus, CustomMetadataEntry } from '@app/types/metadata';
import { useBaseParameters, BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';

export interface ChangeMetadataParameters extends BaseParameters {
  // Standard PDF metadata fields
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;

  // Date fields
  creationDate: Date | null;
  modificationDate: Date | null;

  // Trapped status
  trapped: TrappedStatus;

  // Custom metadata entries
  customMetadata: CustomMetadataEntry[];

  // Delete all metadata option
  deleteAll: boolean;
}

export const defaultParameters: ChangeMetadataParameters = {
  title: '',
  author: '',
  subject: '',
  keywords: '',
  creator: '',
  producer: '',
  creationDate: null,
  modificationDate: null,
  trapped: TrappedStatus.UNKNOWN,
  customMetadata: [],
  deleteAll: false,
};

// Global counter for custom metadata IDs
let customMetadataIdCounter = 1;

// Utility functions that can work with external parameters
export const createCustomMetadataFunctions = (
  parameters: ChangeMetadataParameters,
  onParameterChange: <K extends keyof ChangeMetadataParameters>(key: K, value: ChangeMetadataParameters[K]) => void
) => {
  const addCustomMetadata = (key: string = '', value: string = '') => {
    const newEntry: CustomMetadataEntry = {
      key,
      value,
      id: `custom${customMetadataIdCounter++}`,
    };

    onParameterChange('customMetadata', [
      ...parameters.customMetadata,
      newEntry,
    ]);
  };

  const removeCustomMetadata = (id: string) => {
    onParameterChange('customMetadata',
      parameters.customMetadata.filter(entry => entry.id !== id)
    );
  };

  const updateCustomMetadata = (id: string, key: string, value: string) => {
    onParameterChange('customMetadata',
      parameters.customMetadata.map(entry =>
        entry.id === id ? { ...entry, key, value } : entry
      )
    );
  };

  return {
    addCustomMetadata,
    removeCustomMetadata,
    updateCustomMetadata
  };
};

// Validation function
const validateParameters = (params: ChangeMetadataParameters): boolean => {
  // If deleteAll is true, no other validation needed
  if (params.deleteAll) {
    return true;
  }

  // At least one field should have content for the operation to be meaningful
  const hasStandardMetadata = !!(
    params.title.trim()
    || params.author.trim()
    || params.subject.trim()
    || params.keywords.trim()
    || params.creator.trim()
    || params.producer.trim()
    || params.creationDate
    || params.modificationDate
    || params.trapped !== TrappedStatus.UNKNOWN
  );

  const hasCustomMetadata = params.customMetadata.some(
    entry => entry.key.trim() && entry.value.trim()
  );

  return hasStandardMetadata || hasCustomMetadata;
};

export type ChangeMetadataParametersHook = BaseParametersHook<ChangeMetadataParameters> & {
  addCustomMetadata: (key?: string, value?: string) => void;
  removeCustomMetadata: (id: string) => void;
  updateCustomMetadata: (id: string, key: string, value: string) => void;
};

export const useChangeMetadataParameters = (): ChangeMetadataParametersHook => {
  const base = useBaseParameters({
    defaultParameters,
    endpointName: 'update-metadata',
    validateFn: validateParameters,
  });

  // Use the utility functions with the hook's parameters and updateParameter
  const { addCustomMetadata, removeCustomMetadata, updateCustomMetadata } = createCustomMetadataFunctions(
    base.parameters,
    base.updateParameter,
  );

  return {
    ...base,
    addCustomMetadata,
    removeCustomMetadata,
    updateCustomMetadata
  };
};

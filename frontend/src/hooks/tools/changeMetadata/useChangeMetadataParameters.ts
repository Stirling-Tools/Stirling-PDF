import { BaseParameters } from '../../../types/parameters';
import { TrappedStatus, CustomMetadataEntry } from '../../../types/metadata';
import { useBaseParameters, BaseParametersHook } from '../shared/useBaseParameters';

export interface ChangeMetadataParameters extends BaseParameters {
  // Standard PDF metadata fields
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;

  // Date fields (format: yyyy/MM/dd HH:mm:ss)
  creationDate: string;
  modificationDate: string;

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
  creationDate: '',
  modificationDate: '',
  trapped: TrappedStatus.UNKNOWN,
  customMetadata: [],
  deleteAll: false,
};

// Global counter for custom metadata IDs
let customMetadataIdCounter = 1;

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
    || params.creationDate.trim()
    || params.modificationDate.trim()
    || params.trapped !== TrappedStatus.UNKNOWN
  );

  const hasCustomMetadata = params.customMetadata.some(
    entry => entry.key.trim() && entry.value.trim()
  );

  // Date validation if provided
  const datePattern = /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/;
  const isValidCreationDate = !params.creationDate.trim() || datePattern.test(params.creationDate);
  const isValidModificationDate = !params.modificationDate.trim() || datePattern.test(params.modificationDate);

  return (hasStandardMetadata || hasCustomMetadata) && isValidCreationDate && isValidModificationDate;
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

  const addCustomMetadata = (key: string = '', value: string = '') => {
    const newEntry: CustomMetadataEntry = {
      key,
      value,
      id: `custom${customMetadataIdCounter++}`,
    };

    base.updateParameter('customMetadata', [
      ...base.parameters.customMetadata,
      newEntry,
    ]);
  };

  const removeCustomMetadata = (id: string) => {
    base.updateParameter('customMetadata',
      base.parameters.customMetadata.filter(entry => entry.id !== id)
    );
  };

  const updateCustomMetadata = (id: string, key: string, value: string) => {
    base.updateParameter('customMetadata',
      base.parameters.customMetadata.map(entry =>
        entry.id === id ? { ...entry, key, value } : entry
      )
    );
  };

  return {
    ...base,
    addCustomMetadata,
    removeCustomMetadata,
    updateCustomMetadata
  };
};

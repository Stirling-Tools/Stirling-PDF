import { createStampTool } from '@app/tools/stamp/createStampTool';

// AddText is text-only annotation (no drawing, no images, no save-to-library)
const AddText = createStampTool({
  toolId: 'addText',
  translationScope: 'addText',
  allowedSignatureSources: ['text'],
  defaultSignatureSource: 'text',
  defaultSignatureType: 'text',
});

export default AddText;

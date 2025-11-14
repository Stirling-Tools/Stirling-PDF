import { createSignatureTool } from '@app/tools/Sign';

// AddText is text-only annotation (no drawing, no images, no save-to-library)
const AddText = createSignatureTool({
  toolId: 'addText',
  translationScope: 'addText',
  allowedSignatureSources: ['text'],
  defaultSignatureSource: 'text',
  defaultSignatureType: 'text',
});

export default AddText;

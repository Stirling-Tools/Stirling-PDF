import { createSignatureTool } from '@app/tools/Sign';

const AddText = createSignatureTool({
  toolId: 'addText',
  translationScope: 'addText',
  allowedSignatureSources: ['text', 'saved'],
  defaultSignatureSource: 'text',
  defaultSignatureType: 'text',
});

export default AddText;

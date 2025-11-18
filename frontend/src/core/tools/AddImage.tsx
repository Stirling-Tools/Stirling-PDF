import { createStampTool } from '@app/tools/stamp/createStampTool';

// AddImage allows users to place image-only stamps
const AddImage = createStampTool({
  toolId: 'addImage',
  translationScope: 'addImage',
  allowedSignatureSources: ['image'],
  defaultSignatureSource: 'image',
  defaultSignatureType: 'image',
});

export default AddImage;

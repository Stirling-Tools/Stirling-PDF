import { createStampTool } from '@app/tools/stamp/createStampTool';

const Sign = createStampTool({
  toolId: 'sign',
  translationScope: 'sign',
  allowedSignatureSources: ['canvas', 'image', 'text', 'saved'],
  defaultSignatureSource: 'canvas',
  defaultSignatureType: 'canvas',
  enableApplyAction: true,
});

export default Sign;

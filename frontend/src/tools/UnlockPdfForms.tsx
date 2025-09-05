import GenericTool from '../components/tools/shared/GenericTool';
import { unlockPdfFormsDefinition } from './definitions/unlockPdfFormsDefinition';
import { BaseToolProps, ToolComponent } from '../types/tool';

const UnlockPdfForms = (props: BaseToolProps) => {
  return <GenericTool definition={unlockPdfFormsDefinition} {...props} />;
};

// Static method to get the operation hook for automation
UnlockPdfForms.tool = () => unlockPdfFormsDefinition.useOperation;

export default UnlockPdfForms as ToolComponent;

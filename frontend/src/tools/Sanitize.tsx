import GenericTool from '../components/tools/shared/GenericTool';
import { sanitizeDefinition } from './definitions/sanitizeDefinition';
import { BaseToolProps, ToolComponent } from '../types/tool';

const Sanitize = (props: BaseToolProps) => {
  return <GenericTool definition={sanitizeDefinition} {...props} />;
};

// Static method to get the operation hook for automation
Sanitize.tool = () => sanitizeDefinition.useOperation;

export default Sanitize as ToolComponent;

import GenericTool from '../components/tools/shared/GenericTool';
import { splitDefinition } from './definitions/splitDefinition';
import { BaseToolProps, ToolComponent } from '../types/tool';

const Split = (props: BaseToolProps) => {
  return <GenericTool definition={splitDefinition} {...props} />;
};

// Static method to get the operation hook for automation
Split.tool = () => splitDefinition.useOperation;

export default Split as ToolComponent;

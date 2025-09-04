import GenericTool from '../components/tools/shared/GenericTool';
import { removePasswordDefinition } from './definitions/removePasswordDefinition';
import { BaseToolProps, ToolComponent } from '../types/tool';

const RemovePassword = (props: BaseToolProps) => {
  return <GenericTool definition={removePasswordDefinition} {...props} />;
};

// Static method to get the operation hook for automation
RemovePassword.tool = () => removePasswordDefinition.useOperation;

export default RemovePassword as ToolComponent;

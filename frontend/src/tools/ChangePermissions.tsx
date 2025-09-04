import GenericTool from '../components/tools/shared/GenericTool';
import { changePermissionsDefinition } from './definitions/changePermissionsDefinition';
import { BaseToolProps, ToolComponent } from '../types/tool';

const ChangePermissions = (props: BaseToolProps) => {
  return <GenericTool definition={changePermissionsDefinition} {...props} />;
};

// Static method to get the operation hook for automation
ChangePermissions.tool = () => changePermissionsDefinition.useOperation;

export default ChangePermissions as ToolComponent;

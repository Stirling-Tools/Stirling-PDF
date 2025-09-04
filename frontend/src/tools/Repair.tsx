import GenericTool from '../components/tools/shared/GenericTool';
import { repairDefinition } from './definitions/repairDefinition';
import { BaseToolProps, ToolComponent } from '../types/tool';

const Repair = (props: BaseToolProps) => {
  return <GenericTool definition={repairDefinition} {...props} />;
};

// Static method to get the operation hook for automation
Repair.tool = () => repairDefinition.useOperation;

export default Repair as ToolComponent;

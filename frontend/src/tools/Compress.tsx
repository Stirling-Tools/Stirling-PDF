import GenericTool from '../components/tools/shared/GenericTool';
import { compressDefinition } from './definitions/compressDefinition';
import { BaseToolProps, ToolComponent } from '../types/tool';

const Compress = (props: BaseToolProps) => {
  return <GenericTool definition={compressDefinition} {...props} />;
};

// Static method to get the operation hook for automation
Compress.tool = () => compressDefinition.useOperation;

export default Compress as ToolComponent;

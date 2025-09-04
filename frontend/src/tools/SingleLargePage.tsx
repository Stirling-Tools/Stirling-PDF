import GenericTool from '../components/tools/shared/GenericTool';
import { singleLargePageDefinition } from './definitions/singleLargePageDefinition';
import { BaseToolProps, ToolComponent } from '../types/tool';

const SingleLargePage = (props: BaseToolProps) => {
  return <GenericTool definition={singleLargePageDefinition} {...props} />;
};

// Static method to get the operation hook for automation
SingleLargePage.tool = () => singleLargePageDefinition.useOperation;

export default SingleLargePage as ToolComponent;

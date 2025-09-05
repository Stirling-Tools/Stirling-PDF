import GenericTool from '../components/tools/shared/GenericTool';
import { removeCertificateSignDefinition } from './definitions/removeCertificateSignDefinition';
import { BaseToolProps, ToolComponent } from '../types/tool';

const RemoveCertificateSign = (props: BaseToolProps) => {
  return <GenericTool definition={removeCertificateSignDefinition} {...props} />;
};

// Static method to get the operation hook for automation
RemoveCertificateSign.tool = () => removeCertificateSignDefinition.useOperation;

export default RemoveCertificateSign as ToolComponent;

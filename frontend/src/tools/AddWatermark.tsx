import { BaseToolProps, ToolComponent } from "../types/tool";
import GenericTool from "../components/tools/shared/GenericTool";
import { addWatermarkDefinition } from "./definitions/addWatermarkDefinition";

const AddWatermark = (props: BaseToolProps) => {
  return <GenericTool definition={addWatermarkDefinition} {...props} />;
};

AddWatermark.tool = () => addWatermarkDefinition.useOperation;

export default AddWatermark as ToolComponent;

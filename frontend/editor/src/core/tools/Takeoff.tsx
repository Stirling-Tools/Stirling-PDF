import { BaseToolProps, ToolComponent } from "@app/types/tool";

// Take Off has no backend operation and no per-tool panel content — its
// full-screen custom workbench view is registered once at the app root by
// TakeoffWorkbenchRegistration (see that file for why it can't be done from
// here: this component gets unmounted the moment the workbench switches to
// Take Off's hideToolPanel:true view, so it can't own that registration).
const Takeoff = (_props: BaseToolProps) => null;

(Takeoff as ToolComponent).tool = () => {
  throw new Error("Take Off does not support automation operations.");
};

(Takeoff as ToolComponent).getDefaultParameters = () => ({});

export default Takeoff as ToolComponent;

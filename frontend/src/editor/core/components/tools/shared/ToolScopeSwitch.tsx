export interface ToolScopeSwitchProps {
  disabled?: boolean;
}

/**
 * Chooses which open files the tool runs on, above its run button. Renders
 * nothing here: the workbench the user is on decides the scope.
 */
export function ToolScopeSwitch(_props: ToolScopeSwitchProps) {
  return null;
}

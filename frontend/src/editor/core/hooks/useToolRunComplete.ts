/** Called once after a manual tool run saves its outputs, regardless of batch size. */
export function useToolRunComplete(): () => void {
  return () => {};
}

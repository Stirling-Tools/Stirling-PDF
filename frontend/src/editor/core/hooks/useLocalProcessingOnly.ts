/** Web deployments have no managed device policy; desktop shadows this hook. */
export function useLocalProcessingOnly(): boolean {
  return false;
}

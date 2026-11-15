import { privateContentClassName } from "@editor/components/shared/privateContentClassName";

/** `className` plus the private-content classes when `isPrivate`, for an element
 * that only sometimes shows the user's content. */
export function privateClassNameIf(
  isPrivate: boolean | undefined,
  className: string,
): string {
  return isPrivate ? `${className} ${privateContentClassName}` : className;
}

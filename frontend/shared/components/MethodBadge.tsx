import "@shared/components/MethodBadge.css";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface MethodBadgeProps {
  method: HttpMethod;
  className?: string;
}

/**
 * Method chip used in the docs and the pipeline row to label HTTP verbs.
 * Colours match the prototype: GET green, POST blue, PUT amber, DELETE red.
 */
export function MethodBadge({ method, className }: MethodBadgeProps) {
  return (
    <span
      className={[
        "sui-method",
        `sui-method--${method.toLowerCase()}`,
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {method}
    </span>
  );
}

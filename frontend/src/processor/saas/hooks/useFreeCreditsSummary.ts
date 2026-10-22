/**
 * SaaS has no link concept — the signed-in account IS the SaaS account, and the
 * editor's cloud wallet hook is already in this build's {@code @app/*} cascade.
 * Delegating to it means the processor footer and the editor footer share one
 * wallet fetch and can't disagree, so there is nothing portal-specific to do.
 */
export { useFreeCreditsSummary } from "@app/hooks/useFreeCreditsSummary";

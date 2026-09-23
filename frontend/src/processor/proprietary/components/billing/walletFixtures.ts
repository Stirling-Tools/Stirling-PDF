/**
 * Moved to {@code @app/billing/walletFixtures} when the billing cards became shared across
 * editions, so the fixtures could not stay above them. Re-exported here because a dozen portal
 * stories and tests import this path and the move is not worth churning them for.
 */
export * from "@app/billing/walletFixtures";

package stirling.software.proprietary.accountlink;

/**
 * The cached entitlement has just been re-read from SaaS.
 *
 * <p>Published by whoever did the read rather than by a timer, so nothing here adds traffic: the
 * instance speaks to SaaS on the daily sync, on the return from a checkout, and at startup, and
 * those are the moments a plan change can be noticed without phoning home more often than the
 * design intends.
 *
 * <p>An event rather than a direct call because the listener is the licence tier, which already
 * reads this package. Calling the other way would point the dependency both ways.
 */
public record EntitlementRefreshedEvent() {}

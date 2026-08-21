package stirling.software.proprietary.model;

/** Published once a new {@link Team} row is inserted, so listeners can seed per-team defaults. */
public record TeamCreatedEvent(Long teamId, String teamName) {}

package stirling.software.proprietary.policy.model;

/**
 * A routing rule with its destination already resolved, the form the engine delivers against.
 *
 * <p>Destinations resolve once when a run is submitted, like the run's fallback outputs, rather
 * than per document: a run should not change where it delivers half way through because a source
 * was edited underneath it.
 */
public record RoutedDestination(RoutingRule rule, OutputSpec destination) {}

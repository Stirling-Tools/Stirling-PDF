@multinode @ratelimit
Feature: Shared rate limiting via the backplane

    Rate limits must be enforced across all nodes, not per node, or a client's effective limit multiplies by the node count - cluster mode routes counters through Valkey (ValkeyRateLimitStore).

    Scenario: Backplane counters are held in Valkey, not per node
        Given the multi-node stack is running
        And both nodes are cluster members using the Valkey backplane
        Then the rate-limit counter should be shared across nodes

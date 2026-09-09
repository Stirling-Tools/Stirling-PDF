@multinode @health
Feature: Multi-node cluster health

    Every node must come up healthy and join the shared Valkey backplane - the precondition for the rest of the suite (stack: testing/compose/docker-compose-multinode.yml).

    @smoke
    Scenario: Both application nodes are healthy
        Given the multi-node stack is running

    @smoke
    Scenario: Both nodes joined the Valkey backplane in cluster mode
        Given the multi-node stack is running
        And both nodes are cluster members using the Valkey backplane

    Scenario: The load balancer answers the health endpoint
        Given the multi-node stack is running
        When I request "/api/v1/info/status" 4 times through the load balancer
        Then every load-balanced response should be 200

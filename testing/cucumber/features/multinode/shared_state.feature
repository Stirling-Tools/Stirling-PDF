@multinode @state
Feature: Shared state across nodes

    All durable state lives in the shared database, so an object created through the LB (landing on whichever node) is immediately visible from every other node - the cluster is a single logical system.

    Scenario: A team created through the LB lands in the shared database
        Given the multi-node stack is running
        And I am logged in as admin
        When I create a team named "regr_shared_team" through the load balancer
        Then the team "regr_shared_team" should exist in the shared database

    Scenario: Every node reports the same sources
        Given the multi-node stack is running
        And I am logged in as admin
        Then every node should report the same number of sources

    Scenario: The seeded org is present in the shared database
        Given the multi-node stack is running
        Then the "users" table should contain at least 40 row(s)
        And the "integration_configs" table should contain at least 1 row(s)

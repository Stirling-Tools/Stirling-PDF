@multinode @cache
Feature: Second-level cache eviction across nodes

    Each node keeps users, roles and teams in its own Hibernate second-level cache. A write on one node is broadcast over the Valkey backplane so every other node drops its copy, and a write made outside Stirling PDF is evicted through the admin cache endpoint.

    Background:
        Given the multi-node stack is running
        And I am logged in as admin

    Scenario: Cluster mode on the Valkey backplane keeps the second-level cache on
        Then every node should run with the second-level cache enabled

    Scenario: A role change on one node is seen on the other straight away
        Given a cache test user "cache-role" with role "ROLE_USER"
        And node 2 has cached "cache-role"
        When the admin changes "cache-role" to role "ROLE_ADMIN" on node 1
        Then node 2 should report "cache-role" with role "ROLE_ADMIN" within 5 seconds

    Scenario: Disabling a user on one node locks them out of the other straight away
        Given a cache test user "cache-disable" with role "ROLE_USER"
        And node 2 has cached "cache-disable"
        When the admin disables "cache-disable" on node 1
        Then node 2 should reject "cache-disable" within 5 seconds

    Scenario: A database write outside Stirling PDF stays cached until it is evicted
        Given a cache test user "cache-external" with role "ROLE_USER"
        And node 1 has cached "cache-external"
        And node 2 has cached "cache-external"
        When the role of "cache-external" is changed to "ROLE_ADMIN" directly in the database
        Then node 1 should still report "cache-external" with role "ROLE_USER"
        And node 2 should still report "cache-external" with role "ROLE_USER"
        When the admin requests a cache eviction for username "cache-external" on node 1
        Then node 1 should report "cache-external" with role "ROLE_ADMIN" within 5 seconds
        And node 2 should report "cache-external" with role "ROLE_ADMIN" within 5 seconds

    Scenario: Evicting by user id reaches every node
        Given a cache test user "cache-by-id" with role "ROLE_USER"
        And node 2 has cached "cache-by-id"
        When the role of "cache-by-id" is changed to "ROLE_ADMIN" directly in the database
        And the admin requests a cache eviction for the user id of "cache-by-id" on node 1
        Then node 2 should report "cache-by-id" with role "ROLE_ADMIN" within 5 seconds

    Scenario: A non-admin cannot evict the cache
        Given a cache test user "cache-nonadmin" with role "ROLE_USER"
        When "cache-nonadmin" requests a cache eviction on node 1
        Then the cache eviction request should be refused

    @destructive
    Scenario: Nodes clear their cache after losing the eviction channel
        Given a cache test user "cache-reconnect" with role "ROLE_USER"
        And node 1 has cached "cache-reconnect"
        And node 2 has cached "cache-reconnect"
        When the role of "cache-reconnect" is changed to "ROLE_ADMIN" directly in the database
        And Valkey drops every pub/sub connection
        Then every node should log that it cleared its second-level cache
        And node 1 should report "cache-reconnect" with role "ROLE_ADMIN" within 15 seconds
        And node 2 should report "cache-reconnect" with role "ROLE_ADMIN" within 15 seconds

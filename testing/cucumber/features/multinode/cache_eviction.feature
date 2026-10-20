@multinode @cache
Feature: Second-level cache eviction across nodes

    A write on one node, or an external write followed by the eviction endpoint, is seen by every node at once.

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

    Scenario: The eviction endpoint refuses callers without an admin role
        Given a cache test user "cache-auth" with role "ROLE_USER"
        Then an eviction request with no credentials should get HTTP 401
        And an eviction request with the global API key should get HTTP 403
        And an eviction request as "cache-auth" should get HTTP 403

    Scenario Outline: The eviction endpoint rejects bad input without evicting
        When the admin sends the eviction body <body> as "<type>" on node 1
        Then the eviction response should be HTTP <status>

        Examples:
            | body                                | type             | status |
            | {"userIds": ["abc"]}                | application/json | 400    |
            | {"supabaseUserIds": ["not-a-uuid"]} | application/json | 400    |
            | {"userIds": [1,                     | application/json | 400    |
            | userIds=1                           | text/plain       | 415    |
            | {}                                  | application/json | 200    |
            | {"userIds": null, "teamIds": [null]} | application/json | 200   |

    Scenario: The eviction endpoint caps each request at 1000 identifiers
        When the admin requests a cache eviction for 1000 user ids on node 1
        Then the eviction response should be HTTP 200
        When the admin requests a cache eviction for 1001 user ids on node 1
        Then the eviction response should be HTTP 400

    Scenario: A username that looks like SQL is treated as data
        Given the users table has been counted
        When the admin requests a cache eviction for the raw username "x' OR '1'='1" on node 1
        Then the eviction response should be HTTP 200
        And the users table should still hold the same number of users

    Scenario: An identifier that no longer resolves evicts every cached user
        Given a cache test user "cache-flush-a" with role "ROLE_USER"
        And a cache test user "cache-flush-b" with role "ROLE_USER"
        And node 2 has cached "cache-flush-a"
        And node 2 has cached "cache-flush-b"
        When the role of "cache-flush-a" is changed to "ROLE_ADMIN" directly in the database
        And the role of "cache-flush-b" is changed to "ROLE_ADMIN" directly in the database
        And the admin requests a cache eviction for an unknown Supabase user on node 1
        Then node 2 should report "cache-flush-a" with role "ROLE_ADMIN" within 5 seconds
        And node 2 should report "cache-flush-b" with role "ROLE_ADMIN" within 5 seconds

    Scenario: A password reset on one node applies to logins on the other straight away
        Given a cache test user "cache-password" with role "ROLE_USER"
        And node 2 has cached "cache-password"
        When the admin resets the password of "cache-password" to "Changed456!" on node 1
        Then logging in as "cache-password" with the old password on node 2 should fail
        And logging in as "cache-password" with password "Changed456!" on node 2 should succeed

    Scenario: A renamed user is found by the new name on the other node straight away
        Given a cache test user "cache-rename" with role "ROLE_USER"
        And node 2 has cached "cache-rename"
        When "cache-rename" renames themselves on node 1
        Then logging in as "cache-rename" by the old name on node 2 should fail
        And logging in as "cache-rename" by the new name on node 2 should succeed

    Scenario: A deleted user is locked out of the other node straight away
        Given a cache test user "cache-delete" with role "ROLE_USER"
        And node 2 has cached "cache-delete"
        When the admin deletes "cache-delete" on node 1
        Then node 2 should stop serving "cache-delete" within 5 seconds
        And node 2 should answer "cache-delete" the same way as node 1
        And logging in as "cache-delete" with the old password on node 2 should fail

    Scenario: Moving a user to another team on one node shows on the other straight away
        Given a cache test user "cache-team" with role "ROLE_USER"
        And a team named "cache-team-dest" exists
        And node 2 has cached "cache-team"
        When the admin moves "cache-team" to team "cache-team-dest" on node 1
        Then node 2 should report "cache-team" in team "cache-team-dest" within 5 seconds

    Scenario: A team renamed outside Stirling PDF stays cached until its id is evicted
        Given a cache test user "cache-teamname" with role "ROLE_USER"
        And a team named "cache-teamname-old" exists
        And "cache-teamname" is in team "cache-teamname-old"
        And node 2 has cached "cache-teamname"
        When the team "cache-teamname-old" is renamed to "cache-teamname-new" directly in the database
        Then node 2 should still report "cache-teamname" in team "cache-teamname-old"
        When the admin requests a cache eviction for the team "cache-teamname-old" on node 1
        Then node 2 should report "cache-teamname" in team "cache-teamname-new" within 5 seconds

    Scenario: A failed write publishes nothing and a committed one publishes its keys
        Given a cache test user "cache-wire" with role "ROLE_USER"
        And I am listening on the cache eviction channel
        When the admin changes a user that does not exist to role "ROLE_ADMIN" on node 1
        Then the cache eviction channel should carry no message
        When the admin changes "cache-wire" to role "ROLE_ADMIN" on node 1
        Then the cache eviction channel should carry an eviction for "stirling.software.proprietary.security.model.Authority"

    @destructive
    Scenario: A malformed message makes every node clear its cache and keep serving
        Given a cache test user "cache-garbage" with role "ROLE_USER"
        And node 1 has cached "cache-garbage"
        And node 2 has cached "cache-garbage"
        When the role of "cache-garbage" is changed to "ROLE_ADMIN" directly in the database
        And someone publishes "not json at all" on the cache eviction channel
        Then node 1 should report "cache-garbage" with role "ROLE_ADMIN" within 5 seconds
        And node 2 should report "cache-garbage" with role "ROLE_ADMIN" within 5 seconds

    @destructive
    Scenario: An unknown entity in a message is skipped and the rest of the batch still applies
        Given a cache test user "cache-unknown" with role "ROLE_USER"
        And node 2 has cached "cache-unknown"
        When the role of "cache-unknown" is changed to "ROLE_ADMIN" directly in the database
        And someone publishes an eviction batch for "cache-unknown" that also names an unknown entity
        Then node 2 should report "cache-unknown" with role "ROLE_ADMIN" within 5 seconds
        And node 2 should have logged that it skipped an unknown eviction

    @destructive
    Scenario: Writes still succeed while Valkey is down, and peers catch up when it returns
        Given a cache test user "cache-outage" with role "ROLE_USER"
        And node 2 has cached "cache-outage"
        When Valkey is stopped
        And the admin changes "cache-outage" to role "ROLE_ADMIN" on node 1
        Then node 1 should have logged that it could not publish an eviction
        And node 2 should still report "cache-outage" with role "ROLE_USER"
        When Valkey is started again
        Then node 2 should report "cache-outage" with role "ROLE_ADMIN" within 60 seconds

    @destructive
    Scenario: A hung Valkey delays a write by the command timeout, not indefinitely
        Given a cache test user "cache-hang" with role "ROLE_USER"
        When Valkey is paused
        Then the admin changing "cache-hang" to role "ROLE_ADMIN" on node 1 should finish within 10 seconds
        When Valkey is unpaused
        Then node 1 should report "cache-hang" with role "ROLE_ADMIN" within 5 seconds

@multinode @mcp
Feature: MCP results across nodes

    MCP results are the caller's temporary stored files in the shared database and S3, so a fileId or share link minted on one node works on every node, and one node at a time purges expired results under the shared backplane lock.

    Background:
        Given the multi-node stack is running
        And I am logged in as admin
        And I have an MCP API key

    Scenario: A result made on one node can be chained on the other
        When I rotate a PDF over MCP on node "1"
        Then the MCP result should be a temporary stored file in the shared database
        And the MCP result should download over MCP on node "2"
        And the MCP result should feed another operation on node "2"

    Scenario: A private result link needs a signed-in user on every node
        When I rotate a PDF over MCP on node "1"
        Then the result link should be a private share link on the load balancer URL
        And the result link should refuse anonymous downloads on every node
        And the result link should download for a signed-in user on every node

    # Restarts node 2 twice: the purger runs once at boot, then every 10 minutes.
    @destructive @slow
    Scenario: Expired results are purged only while the node holds the purge lock
        When I rotate a PDF over MCP on node "1"
        And the MCP result has expired
        And another holder takes the storage purge lock
        And I restart node "2" and wait until it is healthy
        Then the expired MCP result should still be in the shared database after 30s
        When the storage purge lock is released
        And I restart node "2" and wait until it is healthy
        Then within 90s the expired MCP result should be purged from the shared database
        And no node should have logged a storage purge failure

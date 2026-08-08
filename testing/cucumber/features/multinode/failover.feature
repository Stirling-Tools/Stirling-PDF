@multinode @failover @destructive
Feature: Node failover and recovery

    Losing a node must not take the service down: the LB drains it and the survivor keeps serving, then the node rejoins healthy on restart. These scenarios kill/restart containers, so they are @destructive - pass --tags=failover to run them.

    @destructive
    Scenario: The load balancer keeps serving when a node dies
        Given the multi-node stack is running
        When I kill node "2"
        Then the load balancer should still serve requests
        When I restart node "2"
        Then node "2" should become healthy again within 120s

    @destructive
    Scenario: A recovered node validates tokens minted while it was down
        Given the multi-node stack is running
        And I am logged in as admin
        When I kill node "2"
        And I restart node "2"
        Then node "2" should become healthy again within 120s
        And the current token should be accepted by every node

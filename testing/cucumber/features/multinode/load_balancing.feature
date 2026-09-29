@multinode @loadbalancing
Feature: Load balancer distributes across nodes

    Requests must spread across nodes via round-robin with no session affinity, and a client bounced between nodes must never see a spurious failure since the app is stateless at the HTTP layer.

    Scenario: Requests are spread across both nodes
        Given the multi-node stack is running
        When I request "/api/v1/info/status" 12 times through the load balancer
        Then the requests should be served by at least 2 distinct nodes

    Scenario: An authenticated client bounced between nodes never gets a spurious 401
        Given the multi-node stack is running
        And I am logged in as admin
        When I request "/api/v1/sources" 12 times through the load balancer
        Then every load-balanced response should be 200

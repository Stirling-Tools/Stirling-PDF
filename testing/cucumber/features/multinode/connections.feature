@multinode @connections
Feature: S3 connections across nodes

    Integration connections are team-scoped, secret-encrypted rows in the shared DB - a connection created via the LB must resolve (secret masked) from every node and deletion must remove it cluster-wide.

    Scenario: A connection created via the LB resolves everywhere, then deletes cluster-wide
        Given the multi-node stack is running
        And I am logged in as admin
        When I create an S3 connection named "regr_conn_alpha" via the load balancer
        Then the connection "regr_conn_alpha" should resolve from every node with its secret masked
        When I delete the connection via the load balancer
        Then the connection should be gone from every node

@multinode @policy
Feature: Policy management across nodes

    A policy is durable state in the shared DB, so creating, editing, or deleting it on any node must be reflected on every other node, and both nodes must register the same trigger types.

    Scenario: A policy created on one node is edited and deleted from the other
        Given the multi-node stack is running
        And I am logged in as admin
        When I create a policy named "regr_pol_alpha" on node "1"
        Then the policy "regr_pol_alpha" should be visible from every node
        When I rename the policy "regr_pol_alpha" to "regr_pol_beta" via the load balancer
        Then the policy "regr_pol_beta" should be visible from every node
        When I delete the policy "regr_pol_beta" on node "2"
        Then the policy "regr_pol_beta" should be absent from every node

    Scenario: Every node registers the same trigger types
        Given the multi-node stack is running
        And I am logged in as admin
        Then the trigger registry should be identical across nodes

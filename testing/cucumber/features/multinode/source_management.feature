@multinode @sources
Feature: Source management across nodes

    Sources are durable state. A source created on one node must be usable from
    every node, and the guard that stops a referenced source from being deleted
    must hold across nodes - even when the source and the referencing policy were
    created on different nodes.

    Scenario: A source created on one node is visible and deletable from the other
        Given the multi-node stack is running
        And I am logged in as admin
        When I create an S3 source named "regr_src_alpha" on node "1"
        Then the source "regr_src_alpha" should be visible from every node
        When I delete the source "regr_src_alpha" on node "2"
        Then the source "regr_src_alpha" should be absent from every node

    Scenario: A referenced source cannot be deleted from another node
        Given the multi-node stack is running
        And I am logged in as admin
        When I create an S3 source named "regr_src_ref" on node "1"
        And I create a policy named "regr_pol_ref" referencing source "regr_src_ref" via the load balancer
        Then deleting the source "regr_src_ref" from node "2" is rejected because it is referenced
        When I delete the policy "regr_pol_ref" on node "2"
        And I delete the source "regr_src_ref" on node "1"
        Then the source "regr_src_ref" should be absent from every node

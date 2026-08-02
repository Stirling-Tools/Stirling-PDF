@multinode @processor
Feature: Policy run visibility across nodes

    Run state is projected into the shared job store, so the run-view endpoints (/policies/runs, /run/{runId}) show a run from any node, not only the one that executed it - no sticky-session LB required.

    Scenario: A run executed on one node is visible from every node
        Given the multi-node stack is running
        And I am logged in as admin
        When I run the policy "Compress incoming PDFs" on node "1"
        Then the run should be visible from every node

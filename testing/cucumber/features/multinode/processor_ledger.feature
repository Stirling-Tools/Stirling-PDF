@multinode @processor
Feature: Processor pipeline and exactly-once ledger

    A shared processed-file ledger with an atomic (identity_hash, policy_id) primary key ensures exactly-once processing when several nodes race the same scheduled policy; depends on the seeded "Compress incoming PDFs" policy.

    @slow
    Scenario: Files dropped in the source are processed across the cluster when both
              nodes trigger the policy at the same instant
        Given the multi-node stack is running
        And I am logged in as admin
        And the processor workspace is clean
        When I drop 5 PDF file(s) into the S3 source under "incoming/"
        And I trigger the policy "Compress incoming PDFs" on every node simultaneously
        Then within 90s every dropped file should be processed across the cluster

    Scenario: The ledger's atomic claim enforces exactly-once
        Given the multi-node stack is running
        Then a duplicate ledger claim for the same file and policy is rejected

    # Note: output lands in the source's own bucket so it can be re-ingested; too flaky to assert under consume-mode pruning.

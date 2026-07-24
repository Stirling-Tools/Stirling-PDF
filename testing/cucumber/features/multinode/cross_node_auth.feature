@multinode @auth
Feature: Cross-node authentication

    JWTs are signed RS256 and verified by key id, so the signing keys (stored in the shared DB, private half encrypted) must be shared for a token minted on one node to validate on another.

    Scenario: A token minted through the LB validates on every node directly
        Given the multi-node stack is running
        And I am logged in as admin
        Then the current token should be accepted by every node

    Scenario: Signing keys are persisted in the shared database, encrypted
        Given the multi-node stack is running
        Then the signing keys should be stored in the shared database
        And every stored private key should be encrypted at rest

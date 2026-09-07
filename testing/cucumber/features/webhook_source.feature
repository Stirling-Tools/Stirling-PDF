@policies @webhook
Feature: Webhook input source
  # Requires the proprietary policy feature (webhook sources). Scenarios are
  # skipped automatically when webhook sources are unavailable (see environment.py).
  # A webhook source mints a delivery URL + signing secret; senders POST signed
  # documents which are spooled for the referencing policies.

  Scenario: A validly signed delivery is accepted
    Given I create a webhook source named "Cucumber webhook"
    When I deliver "hello from cucumber" to the webhook with a valid signature
    Then the webhook response status should be 202

  Scenario: A wrongly signed delivery is rejected
    Given I create a webhook source named "Cucumber webhook reject"
    When I deliver "tampered body" to the webhook with signature "sha256=deadbeef"
    Then the webhook response status should be 401

  Scenario: Delivering to an unknown webhook id is not found
    When I deliver "orphan" to webhook id "doesnotexistwebhook0"
    Then the webhook response status should be 404

  Scenario: The signing secret is revealed once on create then masked on read
    Given I create a webhook source named "Cucumber webhook secret"
    Then the webhook create response includes a signing secret
    And reading the webhook source back masks the signing secret

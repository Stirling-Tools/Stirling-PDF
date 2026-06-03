Feature: PAYG shadow-mode charging
  # End-to-end coverage for the PAYG shadow charging engine via the filter +
  # interceptor stack landed in PR #6519. Runs against the saas-profile
  # docker-compose target (testing/compose/docker-compose-saas.yml).
  #
  # Each scenario sets up a test team in PAYG_SHADOW mode, hits a real tool
  # endpoint, then asserts the shape of the rows written to payg_shadow_charge
  # and processing_job / processing_job_step.
  #
  # Lives under features/payg so it's only loaded when the saas-cucumber job
  # explicitly includes this directory (separate from the main behave run
  # which boots the proprietary-flavor stack and has no PAYG tables).

  Background:
    Given the SaaS stack is running with PAYG enabled
    And team "payg-cucumber-team" exists with wallet_policy.engine = "PAYG_SHADOW"
    And I am authenticated as a member of team "payg-cucumber-team"

  Scenario: First tool call writes a CHARGED shadow row
    Given there are no existing shadow charges for team "payg-cucumber-team"
    When I POST a single-page PDF to "/api/v1/security/add-password"
    Then the response status is 200
    And exactly 1 shadow charge row exists for team "payg-cucumber-team"
    And the latest shadow charge row has status "CHARGED"
    And the latest shadow charge row has payg_units >= 1
    And the latest shadow charge row's job is OPEN
    And the latest job has 1 step recorded with status "OK"

  Scenario: Lineage join — second call on the same output joins the first process
    Given there are no existing shadow charges for team "payg-cucumber-team"
    When I POST a single-page PDF to "/api/v1/security/add-password"
    And I take the response body as "step1-output"
    And I POST "step1-output" to "/api/v1/security/sanitize-pdf"
    Then exactly 1 shadow charge row exists for team "payg-cucumber-team"
    # The second call joined the first process — no new shadow row
    And the latest job has step_count = 2
    And the latest job is OPEN

  Scenario: 5xx first-step failure marks the row REFUNDED and closes the job
    Given there are no existing shadow charges for team "payg-cucumber-team"
    When I POST a malformed PDF to "/api/v1/security/add-password" expecting 5xx
    Then the response status is >= 500
    And exactly 1 shadow charge row exists for team "payg-cucumber-team"
    And the latest shadow charge row has status "REFUNDED"
    And the latest shadow charge row's refunded_at is not null
    And the latest shadow charge row's refund_reason starts with "first-step-5xx:"
    And the latest job is CLOSED

  Scenario: 4xx leaves the shadow row CHARGED (customer pays for the attempt)
    Given there are no existing shadow charges for team "payg-cucumber-team"
    When I POST a single-page PDF to "/api/v1/security/add-password" with invalid params expecting 4xx
    Then the response status is >= 400 and < 500
    And exactly 1 shadow charge row exists for team "payg-cucumber-team"
    And the latest shadow charge row has status "CHARGED"
    And the latest job has 1 step recorded with status "FAILED"
    And the latest step's error_code matches the response status

  Scenario: ZIP-returning tool records OUTPUT signatures per inner PDF
    # /api/v1/general/split returns a ZIP of N per-page PDFs; lineage should
    # be recorded per PDF so a follow-up tool on any inner PDF joins this
    # process.
    Given there are no existing shadow charges for team "payg-cucumber-team"
    When I POST a 3-page PDF to "/api/v1/general/split-pdf-by-sections"
    Then the response status is 200
    And the response Content-Type is "application/zip"
    And exactly 1 shadow charge row exists for team "payg-cucumber-team"
    And the latest job has at least 3 OUTPUT artifact hashes recorded

  Scenario: Multi-file input writes a single shadow row sized by the group
    Given there are no existing shadow charges for team "payg-cucumber-team"
    When I POST two single-page PDFs as a multi-file payload to "/api/v1/general/merge-pdfs"
    Then the response status is 200
    And exactly 1 shadow charge row exists for team "payg-cucumber-team"
    And the latest shadow charge row has payg_units >= 1

  Scenario: PIPELINE header sets the job source
    Given there are no existing shadow charges for team "payg-cucumber-team"
    When I POST a single-page PDF to "/api/v1/security/add-password" with header "X-Stirling-Automation: true"
    Then the response status is 200
    And exactly 1 shadow charge row exists for team "payg-cucumber-team"
    And the latest job's source is "PIPELINE"

  Scenario: Disabling the filter via config produces zero shadow rows
    # Verifies the kill-switch documented in PAYG_FILTER_DESIGN.md §16 / §19.
    Given there are no existing shadow charges for team "payg-cucumber-team"
    And the SaaS stack is restarted with payg.filter.enabled = false
    When I POST a single-page PDF to "/api/v1/security/add-password"
    Then the response status is 200
    And exactly 0 shadow charge rows exist for team "payg-cucumber-team"
    # Restore default for subsequent scenarios
    Given the SaaS stack is restarted with payg.filter.enabled = true

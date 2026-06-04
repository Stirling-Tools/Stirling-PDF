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

  # ──────────────────────────────────────────────────────────────────────────
  # NOTE: 5xx-refund + kill-switch scenarios are NOT automated.
  # Both require manual verification — see notes/PAYG_DESIGN.md §7.5
  # "PAYG cucumber: manual-only scenarios" for the procedure.
  # ──────────────────────────────────────────────────────────────────────────

  Scenario: 4xx leaves the shadow row CHARGED (customer pays for the attempt)
    # /sanitize-pdf on an encrypted PDF without the password reliably 400s
    # via GlobalExceptionHandler's PdfPasswordException → ProblemDetail path.
    # We chain: first call encrypts a PDF (CHARGED), second call tries to
    # sanitize WITHOUT the password and 400s. The 4xx assertion is on the
    # SECOND call's behaviour.
    Given there are no existing shadow charges for team "payg-cucumber-team"
    When I POST a single-page PDF to "/api/v1/security/add-password"
    And I take the response body as "encrypted"
    And I POST "encrypted" to "/api/v1/security/sanitize-pdf"
    Then the response status is >= 400 and < 500
    # Note: shadow_charges count is 1 because the second call lineage-joins
    # the first (its input matches the first's output). The 4xx therefore
    # appears as a FAILED step on the existing process, not a new shadow row.
    And exactly 1 shadow charge row exists for team "payg-cucumber-team"
    And the latest shadow charge row has status "CHARGED"
    And the latest job has step_count = 2
    And the latest step's error_code matches the response status

  Scenario: ZIP-returning tool records OUTPUT signatures per inner PDF
    # /split-pages with multiple page numbers returns a ZIP. Stirling sends
    # application/octet-stream rather than application/zip — the extractor
    # sniffs the PK\x03\x04 magic so the ZIP unpack path still fires.
    Given there are no existing shadow charges for team "payg-cucumber-team"
    When I POST a 3-page PDF to "/api/v1/general/split-pages" with form fields:
      | pageNumbers | 1,2 |
    Then the response status is 200
    And exactly 1 shadow charge row exists for team "payg-cucumber-team"
    And the latest job has at least 2 OUTPUT artifact hashes recorded

  Scenario: Multi-file input writes a single shadow row sized by the group
    Given there are no existing shadow charges for team "payg-cucumber-team"
    When I POST two single-page PDFs as a multi-file payload to "/api/v1/general/merge-pdfs"
    Then the response status is 200
    And exactly 1 shadow charge row exists for team "payg-cucumber-team"
    And the latest shadow charge row has payg_units >= 1

  Scenario: PIPELINE header sets the job source
    Given there are no existing shadow charges for team "payg-cucumber-team"
    When I POST a single-page PDF with header "X-Stirling-Automation: true" to "/api/v1/security/add-password"
    Then the response status is 200
    And exactly 1 shadow charge row exists for team "payg-cucumber-team"
    And the latest job's source is "PIPELINE"

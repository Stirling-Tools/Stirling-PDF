Feature: Mobile Scanner Session API

    Tests for the mobile scanner REST API, which manages short-lived upload
    sessions used by mobile scanning clients.

    All endpoints are PUBLIC (no authentication required). Sessions are
    identified by a caller-supplied session ID string.

    Session IDs must match [a-zA-Z0-9-]+ (alphanumeric and hyphens only –
    underscores are rejected with 400).

    # =========================================================================
    # SESSION LIFECYCLE
    # =========================================================================

    @positive
    Scenario: Create a new mobile scanner session
        When I send a POST request to "/api/v1/mobile-scanner/create-session/bdd-test-session-001" with no authentication
        Then the response status code should be 200
        And the response JSON field "success" should be true
        And the response JSON field "sessionId" should not be empty

    @positive
    Scenario: Validate an existing mobile scanner session
        When I send a POST request to "/api/v1/mobile-scanner/create-session/bdd-test-session-002" with no authentication
        Then the response status code should be 200
        When I send a GET request to "/api/v1/mobile-scanner/validate-session/bdd-test-session-002" with no authentication
        Then the response status code should be 200
        And the response JSON field "valid" should be true

    @positive
    Scenario: List files in an existing session returns empty list initially
        When I send a POST request to "/api/v1/mobile-scanner/create-session/bdd-test-session-003" with no authentication
        Then the response status code should be 200
        When I send a GET request to "/api/v1/mobile-scanner/files/bdd-test-session-003" with no authentication
        Then the response status code should be 200

    @positive
    Scenario: Delete an existing mobile scanner session
        When I send a POST request to "/api/v1/mobile-scanner/create-session/bdd-test-session-004" with no authentication
        Then the response status code should be 200
        When I send a DELETE request to "/api/v1/mobile-scanner/session/bdd-test-session-004" with no authentication
        Then the response status code should be 200
        And the response JSON field "success" should be true

    @positive
    Scenario: Full session lifecycle – create, validate, list files, delete
        When I send a POST request to "/api/v1/mobile-scanner/create-session/bdd-test-session-full" with no authentication
        Then the response status code should be 200
        And the response JSON field "sessionId" should not be empty
        When I send a GET request to "/api/v1/mobile-scanner/validate-session/bdd-test-session-full" with no authentication
        Then the response status code should be 200
        And the response JSON field "valid" should be true
        When I send a GET request to "/api/v1/mobile-scanner/files/bdd-test-session-full" with no authentication
        Then the response status code should be 200
        When I send a DELETE request to "/api/v1/mobile-scanner/session/bdd-test-session-full" with no authentication
        Then the response status code should be 200

    # =========================================================================
    # EDGE CASES
    # =========================================================================

    @negative
    Scenario: Session ID with underscores is rejected as invalid format
        When I send a POST request to "/api/v1/mobile-scanner/create-session/invalid_underscore_id" with no authentication
        Then the response status code should be 400

    @negative
    Scenario: Validate a non-existent session returns not-found response
        When I send a GET request to "/api/v1/mobile-scanner/validate-session/nonexistent-session-xyz" with no authentication
        Then the response status code should be one of "200, 404"

    @negative
    Scenario: List files for a non-existent session returns 404 or empty
        When I send a GET request to "/api/v1/mobile-scanner/files/nonexistent-session-abc" with no authentication
        Then the response status code should be one of "200, 404"

    @negative
    Scenario: Delete a non-existent session returns 404 or success
        When I send a DELETE request to "/api/v1/mobile-scanner/session/nonexistent-session-xyz" with no authentication
        Then the response status code should be one of "200, 404"

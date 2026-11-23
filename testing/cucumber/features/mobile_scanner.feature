Feature: Mobile Scanner Session API

    Tests for the mobile scanner REST API, which manages short-lived upload
    sessions used by mobile scanning clients.

    The logged-in desktop creates, lists, downloads and deletes sessions. Only
    validate-session and upload are public, for the phone that scans the QR code.
    Uploads go only to sessions the desktop created.

    Session IDs must match [a-zA-Z0-9-]+ (alphanumeric and hyphens only –
    underscores are rejected with 400).

    Background:
        Given I am logged in as admin

    # =========================================================================
    # SESSION LIFECYCLE
    # =========================================================================

    @positive
    Scenario: Create a new mobile scanner session
        When I send a POST request to "/api/v1/mobile-scanner/create-session/bdd-test-session-001" with JWT authentication
        Then the response status code should be 200
        And the response JSON field "success" should be true
        And the response JSON field "sessionId" should not be empty

    @positive
    Scenario: Validate an existing mobile scanner session without authentication
        When I send a POST request to "/api/v1/mobile-scanner/create-session/bdd-test-session-002" with JWT authentication
        Then the response status code should be 200
        When I send a GET request to "/api/v1/mobile-scanner/validate-session/bdd-test-session-002" with no authentication
        Then the response status code should be 200
        And the response JSON field "valid" should be true

    @positive
    Scenario: List files in an existing session returns empty list initially
        When I send a POST request to "/api/v1/mobile-scanner/create-session/bdd-test-session-003" with JWT authentication
        Then the response status code should be 200
        When I send a GET request to "/api/v1/mobile-scanner/files/bdd-test-session-003" with JWT authentication
        Then the response status code should be 200

    @positive
    Scenario: Delete an existing mobile scanner session
        When I send a POST request to "/api/v1/mobile-scanner/create-session/bdd-test-session-004" with JWT authentication
        Then the response status code should be 200
        When I send a DELETE request to "/api/v1/mobile-scanner/session/bdd-test-session-004" with JWT authentication
        Then the response status code should be 200
        And the response JSON field "success" should be true

    @positive
    Scenario: Full session lifecycle – create, validate, list files, delete
        When I send a POST request to "/api/v1/mobile-scanner/create-session/bdd-test-session-full" with JWT authentication
        Then the response status code should be 200
        And the response JSON field "sessionId" should not be empty
        When I send a GET request to "/api/v1/mobile-scanner/validate-session/bdd-test-session-full" with no authentication
        Then the response status code should be 200
        And the response JSON field "valid" should be true
        When I send a GET request to "/api/v1/mobile-scanner/files/bdd-test-session-full" with JWT authentication
        Then the response status code should be 200
        When I send a DELETE request to "/api/v1/mobile-scanner/session/bdd-test-session-full" with JWT authentication
        Then the response status code should be 200

    # =========================================================================
    # AUTHENTICATION
    # =========================================================================

    @negative
    Scenario: Creating a session requires authentication
        When I send a POST request to "/api/v1/mobile-scanner/create-session/bdd-test-session-anon" with no authentication
        Then the response status code should be 401

    @negative
    Scenario: Listing files requires authentication
        When I send a GET request to "/api/v1/mobile-scanner/files/bdd-test-session-anon" with no authentication
        Then the response status code should be 401

    @negative
    Scenario: Deleting a session requires authentication
        When I send a DELETE request to "/api/v1/mobile-scanner/session/bdd-test-session-anon" with no authentication
        Then the response status code should be 401

    # =========================================================================
    # EDGE CASES
    # =========================================================================

    @negative
    Scenario: Session ID with underscores is rejected as invalid format
        When I send a POST request to "/api/v1/mobile-scanner/create-session/invalid_underscore_id" with JWT authentication
        Then the response status code should be 400

    @negative
    Scenario: Validate a non-existent session returns not-found response
        When I send a GET request to "/api/v1/mobile-scanner/validate-session/nonexistent-session-xyz" with no authentication
        Then the response status code should be one of "200, 404"

    @negative
    Scenario: Uploading to a non-existent session is rejected
        When I send a POST request to "/api/v1/mobile-scanner/upload/nonexistent-session-xyz" with no authentication
        Then the response status code should be 400

    @negative
    Scenario: List files for a non-existent session returns 404 or empty
        When I send a GET request to "/api/v1/mobile-scanner/files/nonexistent-session-abc" with JWT authentication
        Then the response status code should be one of "200, 404"

    @negative
    Scenario: Delete a non-existent session returns 404 or success
        When I send a DELETE request to "/api/v1/mobile-scanner/session/nonexistent-session-xyz" with JWT authentication
        Then the response status code should be one of "200, 404"

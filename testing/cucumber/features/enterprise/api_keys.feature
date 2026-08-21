@jwt @auth @apikey
Feature: API Keys management API

    Tests for the portal API-keys REST API, which lets a user mint, list, and
    revoke named personal API keys.

    Endpoints (all @EnterpriseEndpoint, JWT/ROLE required):
    - GET    /api/v1/proprietary/ui-data/infrastructure/api-keys        (list)
    - POST   /api/v1/proprietary/ui-data/infrastructure/api-keys        (create)
    - DELETE /api/v1/proprietary/ui-data/infrastructure/api-keys/{id}   (revoke)

    Because these are @EnterpriseEndpoint, authenticated responses may be 200
    (enterprise enabled) or 403 (feature not in this build). Unauthenticated
    requests must always be rejected with 401.

    The legacy single per-user key (the global API key) must keep working so no
    key created before multi-key support is ever lost.

    Admin credentials: username=admin, password=stirling
    Global API key: 123456789

    # =========================================================================
    # LIST
    # =========================================================================

    @positive
    Scenario: Admin can list API keys
        Given I am logged in as admin
        When I send a GET request to "/api/v1/proprietary/ui-data/infrastructure/api-keys" with JWT authentication
        Then the response status code should be one of "200, 403"

    @negative
    Scenario: Unauthenticated list request returns 401
        When I send a GET request to "/api/v1/proprietary/ui-data/infrastructure/api-keys" with no authentication
        Then the response status code should be 401

    # =========================================================================
    # CREATE
    # =========================================================================

    @positive
    Scenario: Admin can create a personal API key
        Given I am logged in as admin
        When I send a JSON POST request to "/api/v1/proprietary/ui-data/infrastructure/api-keys" with JWT authentication and body '{"name": "bdd_personal_key"}'
        Then the response status code should be one of "200, 403"

    @negative
    Scenario: Creating a key without a name is rejected
        Given I am logged in as admin
        When I send a JSON POST request to "/api/v1/proprietary/ui-data/infrastructure/api-keys" with JWT authentication and body '{"name": ""}'
        Then the response status code should be one of "400, 403"

    @negative
    Scenario: Unauthenticated create request returns 401
        When I send a POST request to "/api/v1/proprietary/ui-data/infrastructure/api-keys" with no authentication
        Then the response status code should be 401

    # =========================================================================
    # REVOKE
    # =========================================================================

    @negative
    Scenario: Unauthenticated revoke request returns 401
        When I send a DELETE request to "/api/v1/proprietary/ui-data/infrastructure/api-keys/1" with no authentication
        Then the response status code should be 401

    @positive
    Scenario: Admin revoking a non-existent key is handled, not a bypass
        Given I am logged in as admin
        When I send a DELETE request to "/api/v1/proprietary/ui-data/infrastructure/api-keys/999999" with JWT authentication
        Then the response status code should be one of "204, 403, 404"

    # =========================================================================
    # LEGACY KEY BACKWARD COMPATIBILITY
    # =========================================================================

    @positive
    Scenario: The legacy global API key still authenticates
        When I send a GET request to "/api/v1/auth/me" with API key "123456789"
        Then the response status code should be 200
        And the response JSON should have field "username"

    @negative
    Scenario: An unknown API key is rejected
        When I send a GET request to "/api/v1/auth/me" with API key "not-a-real-api-key-000"
        Then the response status code should be 401

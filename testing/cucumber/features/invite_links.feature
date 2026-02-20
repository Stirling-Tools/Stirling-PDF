@jwt @auth @user_mgmt
Feature: Invite Link API

    Tests for the invite link REST API, which allows admins to generate
    time-limited registration invite links and manage them.

    Endpoints (base: /api/v1/invite — from @InviteApi annotation):
    - POST /api/v1/invite/generate   (admin only)
    - GET  /api/v1/invite/list       (admin only)
    - GET  /api/v1/invite/validate/{token}  (public)
    - DELETE /api/v1/invite/revoke/{inviteId} (admin only)
    - POST /api/v1/invite/cleanup    (admin only)

    Admin credentials: username=admin, password=stirling

    # =========================================================================
    # GENERATE INVITE LINK
    # =========================================================================

    @positive
    Scenario: Admin can generate an invite link
        Given I am logged in as admin
        When I send a POST request to "/api/v1/invite/generate" with JWT authentication and params "role=ROLE_USER&expiryHours=24&sendEmail=false"
        Then the response status code should be one of "200, 201"
        And the response JSON field "token" should not be empty

    @negative
    Scenario: Unauthenticated request to generate invite link returns 401
        When I send a POST request to "/api/v1/invite/generate" with no authentication and params "role=ROLE_USER&expiryHours=24&sendEmail=false"
        Then the response status code should be 401

    # =========================================================================
    # LIST INVITE LINKS
    # =========================================================================

    @positive
    Scenario: Admin can list all active invite links
        Given I am logged in as admin
        When I send a GET request to "/api/v1/invite/list" with JWT authentication
        Then the response status code should be 200
        And the response JSON field "invites" should be a list

    @negative
    Scenario: Unauthenticated request to list invite links returns 401
        When I send a GET request to "/api/v1/invite/list" with no authentication
        Then the response status code should be 401

    # =========================================================================
    # VALIDATE INVITE TOKEN (public endpoint)
    # =========================================================================

    @positive
    Scenario: Admin generates a token then validates it (full lifecycle)
        Given I am logged in as admin
        When I send a POST request to "/api/v1/invite/generate" with JWT authentication and params "role=ROLE_USER&expiryHours=24&sendEmail=false"
        Then the response status code should be one of "200, 201"
        And I store the response JSON field "token"
        When I use the stored value to send a GET request to "/api/v1/invite/validate/{stored}" with no authentication
        Then the response status code should be 200

    @negative
    Scenario: Validating a non-existent invite token returns 404 or 400
        When I send a GET request to "/api/v1/invite/validate/completely-invalid-token-xyz-999" with no authentication
        Then the response status code should be one of "400, 404"

    # =========================================================================
    # REVOKE INVITE LINK
    # =========================================================================

    @positive
    Scenario: Admin can revoke an invite link by its ID
        Given I am logged in as admin
        # Generate an invite to get a real ID to revoke
        When I send a POST request to "/api/v1/invite/generate" with JWT authentication and params "role=ROLE_USER&expiryHours=24&sendEmail=false"
        Then the response status code should be one of "200, 201"
        And I store the response JSON field "id"
        When I use the stored value to send a DELETE request to "/api/v1/invite/revoke/{stored}" with JWT authentication
        Then the response status code should be one of "200, 204"

    @negative
    Scenario: Unauthenticated request to revoke invite link returns 401
        When I send a DELETE request to "/api/v1/invite/revoke/some-id-xyz" with no authentication
        Then the response status code should be 401

    # =========================================================================
    # CLEANUP EXPIRED INVITE LINKS
    # =========================================================================

    @positive
    Scenario: Admin can trigger cleanup of expired invite links
        Given I am logged in as admin
        When I send a POST request to "/api/v1/invite/cleanup" with JWT authentication
        Then the response status code should be 200

    @negative
    Scenario: Unauthenticated request to cleanup invite links returns 401
        When I send a POST request to "/api/v1/invite/cleanup" with no authentication
        Then the response status code should be 401

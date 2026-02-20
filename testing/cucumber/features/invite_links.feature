@jwt @auth @user_mgmt
Feature: Invite Link API

    Tests for the invite link REST API, which allows admins to manage
    registration invite links.

    Endpoints (base: /api/v1/invite — from @InviteApi annotation):
    - POST /api/v1/invite/generate   (admin only, requires MAIL_ENABLEINVITES)
    - GET  /api/v1/invite/list       (admin only)
    - GET  /api/v1/invite/validate/{token}  (public)
    - DELETE /api/v1/invite/revoke/{inviteId} (admin only)
    - POST /api/v1/invite/cleanup    (admin only)

    NOTE: The /generate endpoint requires MAIL_ENABLEINVITES=true AND an SMTP
    server. Since the CI environment has no SMTP, generate-dependent scenarios
    (generate, full lifecycle, revoke-by-id) are omitted. Auth guard tests for
    those endpoints are still covered.

    Admin credentials: username=admin, password=stirling

    # =========================================================================
    # GENERATE INVITE LINK – auth guard only (no SMTP in CI)
    # =========================================================================

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

    @negative
    Scenario: Validating a non-existent invite token returns 404 or 400
        When I send a GET request to "/api/v1/invite/validate/completely-invalid-token-xyz-999" with no authentication
        Then the response status code should be one of "400, 404"

    # =========================================================================
    # REVOKE INVITE LINK – auth guard only
    # =========================================================================

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

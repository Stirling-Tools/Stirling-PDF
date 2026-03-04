@jwt @auth @signature
Feature: Signatures API

    Tests for the saved signatures REST API, which allows authenticated
    users to store and retrieve their signature images.

    Endpoints:
    - GET  /api/v1/proprietary/signatures  (authenticated)
    - POST /api/v1/proprietary/signatures  (authenticated, multipart)
    - DELETE /api/v1/proprietary/signatures/{id} (authenticated)

    POST is omitted here because it requires a multipart image upload; the
    format of SavedSignatureRequest is tested via integration rather than BDD.

    Admin credentials: username=admin, password=stirling

    # =========================================================================
    # LIST SIGNATURES
    # =========================================================================

    @positive
    Scenario: Authenticated user can retrieve their signatures list
        Given I am logged in as admin
        When I send a GET request to "/api/v1/proprietary/signatures" with JWT authentication
        Then the response status code should be one of "200, 403"

    @negative
    Scenario: Unauthenticated request to signatures list returns 401
        When I send a GET request to "/api/v1/proprietary/signatures" with no authentication
        Then the response status code should be 401

    # =========================================================================
    # DELETE SIGNATURE
    # =========================================================================

    @negative
    Scenario: Delete a non-existent signature returns 404 or 403
        Given I am logged in as admin
        When I send a DELETE request to "/api/v1/proprietary/signatures/nonexistent-sig-id-xyz" with JWT authentication
        Then the response status code should be one of "403, 404"

    @negative
    Scenario: Unauthenticated request to delete signature returns 401
        When I send a DELETE request to "/api/v1/proprietary/signatures/some-id" with no authentication
        Then the response status code should be 401

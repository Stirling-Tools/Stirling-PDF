@jwt @auth @admin_settings
Feature: Admin Settings API

    Tests for the admin settings REST API endpoints, which expose application
    configuration values to authenticated admins.

    All endpoints require ROLE_ADMIN. Non-admin / unauthenticated requests must
    receive 401 or 403.

    Admin credentials: username=admin, password=stirling

    # =========================================================================
    # GET ALL SETTINGS
    # =========================================================================

    @positive
    Scenario: Admin can retrieve all application settings
        Given I am logged in as admin
        When I send a GET request to "/api/v1/admin/settings" with JWT authentication
        Then the response status code should be 200
        And the response body should not be empty

    @negative
    Scenario: Unauthenticated request to settings returns 401
        When I send a GET request to "/api/v1/admin/settings" with no authentication
        Then the response status code should be 401

    # =========================================================================
    # GET SETTINGS DELTA
    # =========================================================================

    @positive
    Scenario: Admin can retrieve the settings delta (changed values)
        Given I am logged in as admin
        When I send a GET request to "/api/v1/admin/settings/delta" with JWT authentication
        Then the response status code should be 200

    @negative
    Scenario: Unauthenticated request to settings delta returns 401
        When I send a GET request to "/api/v1/admin/settings/delta" with no authentication
        Then the response status code should be 401

    # =========================================================================
    # GET SETTINGS BY SECTION
    # =========================================================================

    @positive
    Scenario: Admin can retrieve settings for the system section
        Given I am logged in as admin
        When I send a GET request to "/api/v1/admin/settings/section/system" with JWT authentication
        Then the response status code should be one of "200, 404"

    @positive
    Scenario: Admin can retrieve settings for the security section
        Given I am logged in as admin
        When I send a GET request to "/api/v1/admin/settings/section/security" with JWT authentication
        Then the response status code should be one of "200, 404"

    @negative
    Scenario: Unauthenticated request to settings section returns 401
        When I send a GET request to "/api/v1/admin/settings/section/system" with no authentication
        Then the response status code should be 401

    # =========================================================================
    # GET SINGLE SETTING BY KEY
    # =========================================================================

    @positive
    Scenario: Admin can retrieve a single setting by key
        Given I am logged in as admin
        When I send a GET request to "/api/v1/admin/settings/key/system.defaultLocale" with JWT authentication
        Then the response status code should be one of "200, 404"

    @negative
    Scenario: Unauthenticated request to settings key returns 401
        When I send a GET request to "/api/v1/admin/settings/key/system.defaultLocale" with no authentication
        Then the response status code should be 401

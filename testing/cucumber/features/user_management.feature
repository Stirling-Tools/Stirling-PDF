@jwt @auth @user_mgmt
Feature: User Management API

    Tests for the user management REST API, covering API key operations,
    password changes, and admin-level user CRUD (create, role change,
    enable/disable, delete, force password change).

    Admin credentials: username=admin, password=stirling
    Global API key:  123456789

    Each admin CRUD scenario creates and then deletes the test user within
    the same scenario to avoid hitting the licence user limit.

    # =========================================================================
    # API KEY OPERATIONS
    # =========================================================================

    @positive
    Scenario: Authenticated user can retrieve their current API key
        Given I am logged in as admin
        When I send a POST request to "/api/v1/user/get-api-key" with JWT authentication
        Then the response status code should be 200
        And the response body should not be empty

    @positive
    Scenario: Authenticated user can update their API key
        Given I am logged in as admin
        When I send a POST request to "/api/v1/user/update-api-key" with JWT authentication
        Then the response status code should be 200
        And the response body should not be empty

    @negative
    Scenario: Get API key without authentication returns 401
        When I send a POST request to "/api/v1/user/get-api-key" with no authentication
        Then the response status code should be 401

    @negative
    Scenario: Update API key without authentication returns 401
        When I send a POST request to "/api/v1/user/update-api-key" with no authentication
        Then the response status code should be 401

    # =========================================================================
    # PASSWORD CHANGE
    # =========================================================================

    @positive
    Scenario: Admin can change their own password and revert it
        Given I am logged in as admin
        When I send a POST request to "/api/v1/user/change-password" with JWT authentication and params "currentPassword=stirling&newPassword=stirling_temp_bdd"
        Then the response status code should be 200
        # Revert to original password so other tests are not broken
        When I send a POST request to "/api/v1/user/change-password" with JWT authentication and params "currentPassword=stirling_temp_bdd&newPassword=stirling"
        Then the response status code should be 200

    @negative
    Scenario: Change password with wrong current password returns 401
        Given I am logged in as admin
        When I send a POST request to "/api/v1/user/change-password" with JWT authentication and params "currentPassword=completely_wrong_pass_xyz&newPassword=stirling2"
        Then the response status code should be one of "400, 401"

    @negative
    Scenario: Change password without authentication returns 401
        When I send a POST request to "/api/v1/user/change-password" with no authentication and params "currentPassword=stirling&newPassword=stirling2"
        Then the response status code should be 401

    # =========================================================================
    # ADMIN USER CRUD
    # Each scenario is self-contained: creates the test user, runs the
    # operation under test, then deletes the user to free the licence slot.
    # =========================================================================

    @admin @positive
    Scenario: Admin can create and delete a user account
        Given I am logged in as admin
        When I send a POST request to "/api/v1/user/admin/saveUser" with JWT authentication and params "username=bdd_mgmt_test_user&password=TestPass123!&role=ROLE_USER&authType=web&forceChange=false"
        Then the response status code should be one of "200, 201"
        # Clean up immediately so the licence slot is freed for other scenarios
        When I send a POST request to "/api/v1/user/admin/deleteUser/bdd_mgmt_test_user" with JWT authentication
        Then the response status code should be 200

    @admin @positive
    Scenario: Admin can enable and disable a user account
        Given I am logged in as admin
        When I send a POST request to "/api/v1/user/admin/saveUser" with JWT authentication and params "username=bdd_mgmt_test_user&password=TestPass123!&role=ROLE_USER&authType=web&forceChange=false"
        Then the response status code should be one of "200, 201"
        When I send a POST request to "/api/v1/user/admin/changeUserEnabled/bdd_mgmt_test_user" with JWT authentication and params "enabled=true"
        Then the response status code should be 200
        When I send a POST request to "/api/v1/user/admin/changeUserEnabled/bdd_mgmt_test_user" with JWT authentication and params "enabled=false"
        Then the response status code should be 200
        # Clean up
        When I send a POST request to "/api/v1/user/admin/deleteUser/bdd_mgmt_test_user" with JWT authentication
        Then the response status code should be 200

    @admin @positive
    Scenario: Admin can change a user's role
        Given I am logged in as admin
        When I send a POST request to "/api/v1/user/admin/saveUser" with JWT authentication and params "username=bdd_mgmt_test_user&password=TestPass123!&role=ROLE_USER&authType=web&forceChange=false"
        Then the response status code should be one of "200, 201"
        When I send a POST request to "/api/v1/user/admin/changeRole" with JWT authentication and params "username=bdd_mgmt_test_user&role=ROLE_USER"
        Then the response status code should be 200
        # Clean up
        When I send a POST request to "/api/v1/user/admin/deleteUser/bdd_mgmt_test_user" with JWT authentication
        Then the response status code should be 200

    @admin @positive
    Scenario: Admin can force-change a user's password
        Given I am logged in as admin
        When I send a POST request to "/api/v1/user/admin/saveUser" with JWT authentication and params "username=bdd_mgmt_test_user&password=TestPass123!&role=ROLE_USER&authType=web&forceChange=false"
        Then the response status code should be one of "200, 201"
        When I send a POST request to "/api/v1/user/admin/changePasswordForUser" with JWT authentication and params "username=bdd_mgmt_test_user&password=NewTestPass456!"
        Then the response status code should be 200
        # Clean up
        When I send a POST request to "/api/v1/user/admin/deleteUser/bdd_mgmt_test_user" with JWT authentication
        Then the response status code should be 200

    @admin @negative
    Scenario: Non-admin cannot save a user via admin endpoint (returns 401 or 403)
        When I send a POST request to "/api/v1/user/admin/saveUser" with no authentication and params "username=evil_user&password=pass&role=ROLE_ADMIN&authType=web&forceChange=false"
        Then the response status code should be one of "401, 403"

    @admin @negative
    Scenario: Non-admin cannot delete a user via admin endpoint (returns 401 or 403)
        When I send a POST request to "/api/v1/user/admin/deleteUser/admin" with no authentication
        Then the response status code should be one of "401, 403"

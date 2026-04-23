@jwt @auth
Feature: JWT Authentication End-to-End

    Comprehensive end-to-end tests for JWT-based authentication covering login,
    token validation, token refresh, logout, role-based access control, and
    API key authentication.

    Admin credentials: username=admin, password=stirling (see docker-compose-security-with-login.yml)
    Global API key: 123456789

    # =========================================================================
    # LOGIN SCENARIOS
    # =========================================================================

    @login @positive
    Scenario: Successful admin login returns JWT token
        When I login with username "admin" and password "stirling"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response should contain a JWT access token
        And the response JSON should have field "user"
        And the response JSON should have a user with username "admin"
        And the response JSON should have a user with role "ROLE_ADMIN"

    @login @positive
    Scenario: Login response includes token expiry in seconds
        When I login with username "admin" and password "stirling"
        Then the response status code should be 200
        And the response JSON session field "expires_in" should be positive

    @login @positive
    Scenario: JWT access token has valid three-part structure
        When I login with username "admin" and password "stirling"
        Then the response status code should be 200
        And the JWT access token should have three dot-separated parts

    @login @positive
    Scenario: Login response user object contains required fields
        When I login with username "admin" and password "stirling"
        Then the response status code should be 200
        And the response JSON user field "email" should not be empty
        And the response JSON user field "username" should not be empty
        And the response JSON user field "role" should not be empty
        And the response JSON user field "enabled" should not be empty

    @login @positive
    Scenario: Login response user authentication type is WEB
        When I login with username "admin" and password "stirling"
        Then the response status code should be 200
        And the response JSON user field "authenticationType" should equal "web"

    @login @negative
    Scenario: Login with wrong password returns 401
        When I login with username "admin" and password "completely_wrong_password_xyz"
        Then the response status code should be 401
        And the response JSON error should contain "Invalid"

    @login @negative
    Scenario: Login with SQL injection in username is safely rejected
        When I login with username "admin' OR '1'='1" and password "anypass"
        Then the response status code should be 401

    @login @negative
    Scenario: Login with script injection in username is safely rejected
        When I login with username "<script>alert(1)</script>" and password "anypass"
        Then the response status code should be 401

    @login @negative
    Scenario: Login with non-existent user returns 401
        When I login with username "no_such_user_abc999xyz" and password "anypassword123"
        Then the response status code should be 401

    @login @negative
    Scenario: Login with empty username returns 400
        When I login with an empty username and password "stirling"
        Then the response status code should be 400

    @login @negative
    Scenario: Login with empty password returns 400
        When I login with username "admin" and an empty password
        Then the response status code should be 400

    @login @negative
    Scenario: Login with null-equivalent username returns 400
        When I login with only password "stirling"
        Then the response status code should be 400

    @login @negative
    Scenario: Login with null-equivalent password returns 400
        When I login with only username "admin"
        Then the response status code should be 400

    @login @negative
    Scenario: Multiple sequential failed login attempts are all rejected
        When I login with username "admin" and password "badpass1"
        Then the response status code should be 401
        When I login with username "admin" and password "badpass2"
        Then the response status code should be 401
        When I login with username "admin" and password "badpass3"
        Then the response status code should be 401

    @login @negative
    Scenario: Successful login clears lockout after failed attempts
        When I login with username "admin" and password "wrongpass"
        Then the response status code should be 401
        When I login with username "admin" and password "stirling"
        Then the response status code should be 200
        And the response should contain a JWT access token

    # =========================================================================
    # JWT /me ENDPOINT SCENARIOS
    # =========================================================================

    @me @positive
    Scenario: Get current user with valid admin JWT token
        Given I am logged in as admin
        When I send a GET request to "/api/v1/auth/me" with JWT authentication
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response JSON should have field "user"
        And the response JSON should have a user with username "admin"
        And the response JSON should have a user with role "ROLE_ADMIN"

    @me @positive
    Scenario: Get current user with JWT shows correct user data
        Given I am logged in as admin
        When I send a GET request to "/api/v1/auth/me" with JWT authentication
        Then the response status code should be 200
        And the response JSON user field "email" should not be empty
        And the response JSON user field "enabled" should not be empty

    @me @negative
    Scenario: Get current user without any authentication returns 401
        When I send a GET request to "/api/v1/auth/me" with no authentication
        Then the response status code should be 401

    @me @negative
    Scenario: Get current user with completely invalid JWT token returns 401
        When I send a GET request to "/api/v1/auth/me" with an invalid JWT token "not.a.jwt"
        Then the response status code should be 401

    @me @negative
    Scenario: Get current user with random garbage token returns 401
        When I send a GET request to "/api/v1/auth/me" with an invalid JWT token "eyJhbGciOiJSUzI1NiJ9.ZmFrZXBheWxvYWQ.ZmFrZXNpZ25hdHVyZQ"
        Then the response status code should be 401

    @me @negative
    Scenario: Get current user with malformed authorization header returns 401
        When I send a GET request to "/api/v1/auth/me" with a malformed authorization header
        Then the response status code should be 401

    # =========================================================================
    # TOKEN REFRESH SCENARIOS
    # =========================================================================

    @refresh @positive
    Scenario: Refresh a valid JWT token returns a new access token
        Given I am logged in as admin
        When I refresh the JWT token
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response should contain a JWT access token
        And the response JSON should have field "user"
        And the response JSON should have a user with username "admin"

    @refresh @positive
    Scenario: Refreshed token has valid three-part JWT structure
        Given I am logged in as admin
        When I refresh the JWT token
        Then the response status code should be 200
        And the JWT access token should have three dot-separated parts

    @refresh @positive
    Scenario: Refreshed JWT token can be used to authenticate subsequent requests
        Given I am logged in as admin
        When I refresh the JWT token
        Then the response status code should be 200
        And I update the stored JWT token from the response
        When I send a GET request to "/api/v1/auth/me" with JWT authentication
        Then the response status code should be 200
        And the response JSON should have a user with username "admin"

    @refresh @positive
    Scenario: Refreshed token includes positive expiry time
        Given I am logged in as admin
        When I refresh the JWT token
        Then the response status code should be 200
        And the response JSON session field "expires_in" should be positive

    @refresh @negative
    Scenario: Refresh without any token returns 401
        When I send a POST request to "/api/v1/auth/refresh" with no authentication
        Then the response status code should be 401

    @refresh @negative
    Scenario: Refresh with invalid token returns 401
        When I send a POST request to "/api/v1/auth/refresh" with an invalid JWT token "bad.token.value"
        Then the response status code should be 401

    # =========================================================================
    # LOGOUT SCENARIOS
    # =========================================================================

    @logout @positive
    Scenario: Logout with valid admin JWT token succeeds
        Given I am logged in as admin
        When I logout with JWT authentication
        Then the response status code should be 200
        And the response JSON field "message" should equal "Logged out successfully"

    @logout @token @positive
    Scenario: JWT token remains usable after logout (stateless – no server-side revocation)
        # JWT is stateless: logout only clears the server SecurityContext for that request.
        # The signed token itself is not blacklisted, so it stays valid until its expiry.
        # This is expected behaviour; add a token blacklist if revocation is required.
        Given I am logged in as admin
        When I logout with JWT authentication
        Then the response status code should be 200
        When I send a GET request to "/api/v1/auth/me" with JWT authentication
        Then the response status code should be 200
        And the response JSON should have a user with username "admin"

    # =========================================================================
    # ROLE-BASED ACCESS CONTROL SCENARIOS
    # =========================================================================

    @role @admin @positive
    Scenario: Admin JWT allows access to admin-only MFA management endpoint
        Given I am logged in as admin
        When I send a POST request to "/api/v1/auth/mfa/disable/admin/admin" with JWT authentication
        Then the response status code should be 200

    @role @admin @positive
    Scenario: Admin JWT correctly identifies ROLE_ADMIN in /me response
        Given I am logged in as admin
        When I send a GET request to "/api/v1/auth/me" with JWT authentication
        Then the response status code should be 200
        And the response JSON should have a user with role "ROLE_ADMIN"

    @role @negative
    Scenario: Request to admin-only endpoint without JWT returns 401
        When I send a POST request to "/api/v1/auth/mfa/disable/admin/admin" with no authentication
        Then the response status code should be 401

    @role @negative
    Scenario: Request to admin-only endpoint with invalid JWT returns 401
        When I send a POST request to "/api/v1/auth/mfa/disable/admin/admin" with an invalid JWT token "bad.jwt.token"
        Then the response status code should be 401

    # =========================================================================
    # API KEY AUTHENTICATION SCENARIOS
    # =========================================================================

    @apikey @positive
    Scenario: Valid API key allows access to /me endpoint
        When I send a GET request to "/api/v1/auth/me" with API key "123456789"
        Then the response status code should be 200
        And the response JSON should have field "user"

    @apikey @positive
    Scenario: Valid API key /me response contains user information
        When I send a GET request to "/api/v1/auth/me" with API key "123456789"
        Then the response status code should be 200
        And the response JSON user field "username" should not be empty
        And the response JSON user field "role" should not be empty

    @apikey @negative
    Scenario: Invalid API key returns 401
        When I send a GET request to "/api/v1/auth/me" with API key "invalid_key_xyz_999"
        Then the response status code should be 401

    @apikey @negative
    Scenario: Absent API key with no other auth returns 401
        When I send a GET request to "/api/v1/auth/me" with no authentication
        Then the response status code should be 401

    # =========================================================================
    # MFA SETUP SCENARIOS (requires JWT authentication)
    # =========================================================================

    @mfa @positive
    Scenario: Authenticated admin can initiate or is already past MFA setup
        Given I am logged in as admin
        When I send a GET request to "/api/v1/auth/mfa/setup" with JWT authentication
        Then the response status code should be one of "200, 409"

    @mfa @negative
    Scenario: MFA setup endpoint requires authentication
        When I send a GET request to "/api/v1/auth/mfa/setup" with no authentication
        Then the response status code should be 401

    @mfa @negative
    Scenario: MFA enable with a random invalid TOTP code returns an error
        Given I am logged in as admin
        When I send a JSON POST request to "/api/v1/auth/mfa/enable" with JWT authentication and body '{"code": "000000"}'
        Then the response status code should be one of "400, 401, 409"

    @mfa @admin @positive
    Scenario: Admin can disable MFA for any user via admin endpoint
        Given I am logged in as admin
        When I send a POST request to "/api/v1/auth/mfa/disable/admin/admin" with JWT authentication
        Then the response status code should be 200
        And the response JSON field "enabled" should equal "false"

    # =========================================================================
    # USER REGISTRATION SCENARIOS
    # =========================================================================

    @register @positive
    Scenario: Register a new unique user account succeeds or reports license limit
        When I send a JSON POST request to "/api/v1/user/register" with API key "123456789" and body '{"username": "test_register_user_bdd", "password": "SecurePass123!"}'
        Then the response status code should be one of "200, 201, 400"

    @register @negative
    Scenario: Register with duplicate username returns error
        When I send a JSON POST request to "/api/v1/user/register" with API key "123456789" and body '{"username": "admin", "password": "SecurePass123!"}'
        Then the response status code should be 400
        And the response JSON error should contain "already exists"

    @register @negative
    Scenario: Register with empty password returns error
        When I send a JSON POST request to "/api/v1/user/register" with API key "123456789" and body '{"username": "new_user_empty_pass", "password": ""}'
        Then the response status code should be 400

    @register @negative
    Scenario: Newly registered user cannot login before an admin enables the account
        # Registration creates accounts with enabled=false; immediate login must be rejected.
        # Username is intentionally unique to avoid conflicts with other test runs.
        When I send a JSON POST request to "/api/v1/user/register" with API key "123456789" and body '{"username": "bdd_disabled_user_99x", "password": "SecurePass123!"}'
        Then the response status code should be one of "201, 400"
        When I login with username "bdd_disabled_user_99x" and password "SecurePass123!"
        Then the response status code should be 401

    # =========================================================================
    # TOKEN VALIDATION EDGE CASES
    # =========================================================================

    @token @negative
    Scenario: Empty Authorization header value returns 401
        When I send a GET request to "/api/v1/auth/me" with an empty Authorization header
        Then the response status code should be 401

    @token @negative
    Scenario: Authorization header without Bearer prefix returns 401
        When I send a GET request to "/api/v1/auth/me" with Authorization header value "Basic dXNlcjpwYXNz"
        Then the response status code should be 401

    @token @negative
    Scenario: Authorization header with only the Bearer keyword and no token returns 401
        When I send a GET request to "/api/v1/auth/me" with Authorization header value "Bearer"
        Then the response status code should be 401

    @token @negative
    Scenario: Authorization header with Bearer prefix but only whitespace returns 401
        When I send a GET request to "/api/v1/auth/me" with Authorization header value "Bearer "
        Then the response status code should be 401

    @token @positive
    Scenario: Login then immediately use the token verifies token is active
        When I login with username "admin" and password "stirling"
        Then the response status code should be 200
        And I store the JWT token from the login response
        When I send a GET request to "/api/v1/auth/me" with the stored JWT token
        Then the response status code should be 200
        And the response JSON should have a user with username "admin"

    @token @positive
    Scenario: Full login, use, refresh, and re-use flow
        When I login with username "admin" and password "stirling"
        Then the response status code should be 200
        And I store the JWT token from the login response
        When I send a GET request to "/api/v1/auth/me" with the stored JWT token
        Then the response status code should be 200
        When I refresh the stored JWT token
        Then the response status code should be 200
        And I update the stored JWT token from the response
        When I send a GET request to "/api/v1/auth/me" with the stored JWT token
        Then the response status code should be 200
        And the response JSON should have a user with username "admin"

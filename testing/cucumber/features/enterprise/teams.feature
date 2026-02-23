@jwt @auth @team
Feature: Teams API

    Tests for the teams REST API, which provides multi-user grouping
    functionality (a @PremiumEndpoint feature).

    Endpoints:
    - POST /api/v1/teams/create   (admin only, query param: name)
    - POST /api/v1/teams/rename   (admin only, query params: teamId, name)
    - POST /api/v1/teams/delete   (admin only, query param: teamId)
    - POST /api/v1/teams/addUser  (admin only, query params: teamId, username)

    Because this is a @PremiumEndpoint, responses may be 200 (premium enabled)
    or 403 (premium not available in this build).

    There is no GET /teams endpoint, so full CRUD lifecycle cannot be verified
    via ID-based lookup. Tests are limited to exercising each endpoint and
    checking the response is not a security bypass.

    Admin credentials: username=admin, password=stirling

    # =========================================================================
    # CREATE TEAM
    # =========================================================================

    @positive
    Scenario: Admin can attempt to create a new team
        Given I am logged in as admin
        When I send a POST request to "/api/v1/teams/create" with JWT authentication and params "name=bdd_test_team"
        Then the response status code should be one of "200, 201, 403"

    @negative
    Scenario: Unauthenticated request to create team returns 401
        When I send a POST request to "/api/v1/teams/create" with no authentication and params "name=evil_team"
        Then the response status code should be 401

    # =========================================================================
    # RENAME TEAM
    # =========================================================================

    @positive
    Scenario: Admin can attempt to rename a team
        Given I am logged in as admin
        When I send a POST request to "/api/v1/teams/rename" with JWT authentication and params "teamId=1&newName=bdd_renamed_team"
        Then the response status code should be one of "200, 400, 403, 404"

    @negative
    Scenario: Unauthenticated request to rename team returns 401
        When I send a POST request to "/api/v1/teams/rename" with no authentication and params "teamId=1&newName=evil_renamed"
        Then the response status code should be 401

    # =========================================================================
    # ADD USER TO TEAM
    # =========================================================================

    @positive
    Scenario: Admin can attempt to add a user to a team
        Given I am logged in as admin
        When I send a POST request to "/api/v1/teams/addUser" with JWT authentication and params "teamId=1&userId=1"
        Then the response status code should be one of "200, 400, 403, 404"

    @negative
    Scenario: Unauthenticated request to add user to team returns 401
        When I send a POST request to "/api/v1/teams/addUser" with no authentication and params "teamId=1&userId=1"
        Then the response status code should be 401

    # =========================================================================
    # DELETE TEAM
    # =========================================================================

    @positive
    Scenario: Admin can attempt to delete a team
        Given I am logged in as admin
        When I send a POST request to "/api/v1/teams/delete" with JWT authentication and params "teamId=999"
        Then the response status code should be one of "200, 400, 403, 404"

    @negative
    Scenario: Unauthenticated request to delete team returns 401
        When I send a POST request to "/api/v1/teams/delete" with no authentication and params "teamId=1"
        Then the response status code should be 401

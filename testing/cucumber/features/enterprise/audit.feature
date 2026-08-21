@jwt @auth @audit
Feature: Audit Dashboard API

    Tests for the audit dashboard REST API endpoints, which provide
    audit log data, statistics, and export capabilities.

    All endpoints:
    - Require ROLE_ADMIN (JWT authentication)
    - Are gated by @EnterpriseEndpoint (may return 403 on non-enterprise builds)

    Responses are therefore expected to be one of: 200 (enterprise enabled)
    or 403 (enterprise feature not available in this build).

    Admin credentials: username=admin, password=stirling

    # =========================================================================
    # AUDIT DATA
    # =========================================================================

    @positive
    Scenario: Admin can retrieve audit log data
        Given I am logged in as admin
        When I send a GET request to "/api/v1/audit/data" with JWT authentication
        Then the response status code should be one of "200, 403"

    @negative
    Scenario: Unauthenticated request to audit data returns 401
        When I send a GET request to "/api/v1/audit/data" with no authentication
        Then the response status code should be 401

    # =========================================================================
    # AUDIT STATS
    # =========================================================================

    @positive
    Scenario: Admin can retrieve audit statistics
        Given I am logged in as admin
        When I send a GET request to "/api/v1/audit/stats" with JWT authentication
        Then the response status code should be one of "200, 403"

    @negative
    Scenario: Unauthenticated request to audit stats returns 401
        When I send a GET request to "/api/v1/audit/stats" with no authentication
        Then the response status code should be 401

    # =========================================================================
    # AUDIT TYPES
    # =========================================================================

    @positive
    Scenario: Admin can retrieve audit event types
        Given I am logged in as admin
        When I send a GET request to "/api/v1/audit/types" with JWT authentication
        Then the response status code should be one of "200, 403"

    @negative
    Scenario: Unauthenticated request to audit types returns 401
        When I send a GET request to "/api/v1/audit/types" with no authentication
        Then the response status code should be 401

    # =========================================================================
    # AUDIT EXPORT (CSV)
    # =========================================================================

    @positive
    Scenario: Admin can export audit log as CSV
        Given I am logged in as admin
        When I send a GET request to "/api/v1/audit/export/csv" with JWT authentication
        Then the response status code should be one of "200, 403"

    @negative
    Scenario: Unauthenticated request to audit CSV export returns 401
        When I send a GET request to "/api/v1/audit/export/csv" with no authentication
        Then the response status code should be 401

    # =========================================================================
    # AUDIT EXPORT (JSON)
    # =========================================================================

    @positive
    Scenario: Admin can export audit log as JSON
        Given I am logged in as admin
        When I send a GET request to "/api/v1/audit/export/json" with JWT authentication
        Then the response status code should be one of "200, 403"

    @negative
    Scenario: Unauthenticated request to audit JSON export returns 401
        When I send a GET request to "/api/v1/audit/export/json" with no authentication
        Then the response status code should be 401

    # =========================================================================
    # AUDIT CLEANUP
    # =========================================================================

    @positive
    Scenario: Admin can trigger cleanup of old audit records
        Given I am logged in as admin
        When I send a DELETE request to "/api/v1/audit/cleanup/before" with JWT authentication and params "date=2020-01-01"
        Then the response status code should be one of "200, 403"

    @negative
    Scenario: Unauthenticated request to audit cleanup returns 401
        When I send a DELETE request to "/api/v1/audit/cleanup/before" with no authentication and params "date=2020-01-01"
        Then the response status code should be 401

    # =========================================================================
    # PROPRIETARY UI DATA – AUDIT EVENTS (AuditRestController)
    # Endpoint base: /api/v1/proprietary/ui-data
    # =========================================================================

    @positive
    Scenario: Admin can retrieve paginated audit events from UI data API
        Given I am logged in as admin
        When I send a GET request to "/api/v1/proprietary/ui-data/audit-events" with JWT authentication
        Then the response status code should be one of "200, 403"

    @positive
    Scenario: Admin can retrieve audit chart data
        Given I am logged in as admin
        When I send a GET request to "/api/v1/proprietary/ui-data/audit-charts" with JWT authentication
        Then the response status code should be one of "200, 403"

    @positive
    Scenario: Admin can retrieve list of audit event types from UI data API
        Given I am logged in as admin
        When I send a GET request to "/api/v1/proprietary/ui-data/audit-event-types" with JWT authentication
        Then the response status code should be one of "200, 403"

    @positive
    Scenario: Admin can retrieve list of audited users
        Given I am logged in as admin
        When I send a GET request to "/api/v1/proprietary/ui-data/audit-users" with JWT authentication
        Then the response status code should be one of "200, 403"

    @negative
    Scenario: Unauthenticated request to proprietary audit events returns 401
        When I send a GET request to "/api/v1/proprietary/ui-data/audit-events" with no authentication
        Then the response status code should be 401

@info
Feature: Info API Validation

    @status @positive
    Scenario: Get application status
        When I send a GET request to "/api/v1/info/status"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response file should have size greater than 0
        And the JSON value of "status" should be "UP"

    @uptime @positive
    Scenario: Get application uptime
        When I send a GET request to "/api/v1/info/uptime"
        Then the response status code should be 200
        And the response file should have size greater than 0

    @requests @positive
    Scenario: Get total request count
        When I send a GET request to "/api/v1/info/requests"
        Then the response status code should be 200
        And the response file should have size greater than 0

    @requests @positive
    Scenario: Get per-endpoint request counts
        When I send a GET request to "/api/v1/info/requests/all"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response file should have size greater than 0

    @load @positive
    Scenario: Get current system load
        When I send a GET request to "/api/v1/info/load"
        Then the response status code should be 200
        And the response file should have size greater than 0

    @load @positive
    Scenario: Get per-endpoint load statistics
        When I send a GET request to "/api/v1/info/load/all"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response file should have size greater than 0

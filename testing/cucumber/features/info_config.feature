@info @config
Feature: Config, info and UI-data read APIs

    # Read-only JSON endpoints that back the frontend and the admin surfaces.
    # They are cheap, so they run on every PR and each is also checked for
    # consistency under concurrent load.

    @app-config @positive
    Scenario: app-config returns the frontend configuration
        When I send a GET request to "/api/v1/config/app-config"
        And this operation is run 5 times in parallel
        Then the response status code should be 200
        And the response content type should be "application/json"


    @endpoints-availability @positive
    Scenario: endpoints-availability reports per-endpoint availability
        When I send a GET request to "/api/v1/config/endpoints-availability"
        And this operation is run 5 times in parallel
        Then the response status code should be 200
        And the response content type should be "application/json"


    @endpoints-enabled @positive
    Scenario: endpoints-enabled reports the status of a named endpoint
        When I send a GET request to "/api/v1/config/endpoints-enabled" with parameters
            | parameter | value      |
            | endpoints | merge-pdfs |
        Then the response status code should be 200
        And the response content type should be "application/json"


    @endpoints-enabled @negative
    Scenario: endpoints-enabled without the endpoints parameter returns 400
        When I send a GET request to "/api/v1/config/endpoints-enabled"
        Then the response status code should be 400


    @login-disclaimer @positive
    Scenario: login-disclaimer returns its configuration
        When I send a GET request to "/api/v1/config/login-disclaimer"
        Then the response status code should be 200
        And the response JSON field "enabled" should be false


    @health @positive
    Scenario: info health reports the running version
        When I send a GET request to "/api/v1/info/health"
        And this operation is run 5 times in parallel
        Then the response status code should be 200
        And the response JSON field "status" should equal "UP"
        And the response JSON field "version" should not be empty


    @metrics @positive
    Scenario Outline: metrics endpoints return a numeric aggregate
        When I send a GET request to "<endpoint>"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response should match the regex "^[0-9.]+$"

        Examples:
            | endpoint                       |
            | /api/v1/info/load/unique       |
            | /api/v1/info/requests/unique   |


    @metrics @positive
    Scenario Outline: metrics list endpoints return a JSON list
        When I send a GET request to "<endpoint>"
        And this operation is run 5 times in parallel
        Then the response status code should be 200
        And the response JSON should be a list

        Examples:
            | endpoint                          |
            | /api/v1/info/load/all/unique      |
            | /api/v1/info/requests/all/unique  |


    @metrics @positive
    Scenario: weekly active users reports tracking metadata
        When I send a GET request to "/api/v1/info/wau"
        Then the response status code should be 200
        And the response JSON field "trackingSince" should not be empty


    @settings @positive
    Scenario: get-endpoints-status returns the endpoint toggle map
        When I send a GET request to "/api/v1/settings/get-endpoints-status"
        And this operation is run 5 times in parallel
        Then the response status code should be 200
        And the response content type should be "application/json"


    @ui-data @positive
    Scenario Outline: UI data endpoints return JSON for the frontend
        When I send a GET request to "<endpoint>"
        Then the response status code should be 200
        And the response content type should be "application/json"

        Examples:
            | endpoint                      |
            | /api/v1/ui-data/footer-info   |
            | /api/v1/ui-data/home          |
            | /api/v1/ui-data/licenses      |
            | /api/v1/ui-data/pipeline      |


    @ui-data @positive
    Scenario: OCR UI data lists the installed tesseract languages
        When I send a GET request to "/api/v1/ui-data/ocr-pdf"
        Then the response status code should be 200
        And the response JSON field "languages" should be a list


    @ui-data @positive
    Scenario: Sign UI data lists the available signature fonts
        When I send a GET request to "/api/v1/ui-data/sign"
        Then the response status code should be 200
        And the response JSON field "fonts" should be a list


    @hardware-signing @positive
    Scenario: Hardware signing capabilities are reported for the server build
        When I send a GET request to "/api/v1/security/cert-sign/hardware/capabilities"
        And this operation is run 5 times in parallel
        Then the response status code should be 200
        And the response JSON field "desktop" should be false


    @hardware-signing @negative
    Scenario: Windows certificate store is rejected outside the desktop app
        When I send a GET request to "/api/v1/security/cert-sign/hardware/windows-certificates"
        Then the response status code should be 400
        And the response JSON error should contain "desktop"

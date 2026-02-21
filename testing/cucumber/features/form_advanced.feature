@proprietary @forms
Feature: Advanced Forms API Validation (JSON data parts)

    @fill @positive
    Scenario: Fill PDF form with empty JSON data part
        Given I generate a PDF file as "file"
        And the pdf contains 2 pages
        And the pdf has form fields
        And the request includes a JSON part "data" with content "{}"
        When I send the API request to the endpoint "/api/v1/form/fill"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"

    @fill @positive
    Scenario: Fill and flatten PDF form with empty JSON data part
        Given I generate a PDF file as "file"
        And the pdf contains 2 pages
        And the pdf has form fields
        And the request data includes
            | parameter | value |
            | flatten   | true  |
        And the request includes a JSON part "data" with content "{}"
        When I send the API request to the endpoint "/api/v1/form/fill"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"

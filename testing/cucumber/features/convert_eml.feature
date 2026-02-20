@convert
Feature: EML to PDF Conversion API Validation

    @eml-to-pdf @positive
    Scenario: Convert EML email to PDF
        Given I generate an EML email file as "fileInput"
        When I send the API request to the endpoint "/api/v1/convert/eml/pdf"
        Then the response status code should be 200
        And the response file should have size greater than 0

    @eml-to-pdf @positive
    Scenario: Convert EML with subject and body to PDF
        Given I generate an EML email file as "fileInput"
        When I send the API request to the endpoint "/api/v1/convert/eml/pdf"
        Then the response status code should be 200
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"

    @eml-to-pdf @positive
    Scenario: Convert MSG (Outlook) file to PDF
        Given I use an example file at "exampleFiles/example.msg" as parameter "fileInput"
        When I send the API request to the endpoint "/api/v1/convert/eml/pdf"
        Then the response status code should be 200
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"

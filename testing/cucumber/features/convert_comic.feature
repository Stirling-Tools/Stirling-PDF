@convert @image
Feature: Comic Archive Conversion API Validation

    @cbz-to-pdf @positive
    Scenario: Convert CBZ comic archive to PDF
        Given I generate a CBZ comic archive file as "fileInput"
        When I send the API request to the endpoint "/api/v1/convert/cbz/pdf"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"

    @cbz-to-pdf @positive
    Scenario: Convert CBZ comic archive to PDF without ebook optimisation
        Given I generate a CBZ comic archive file as "fileInput"
        And the request data includes
            | parameter         | value |
            | optimizeForEbook  | false |
        When I send the API request to the endpoint "/api/v1/convert/cbz/pdf"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"

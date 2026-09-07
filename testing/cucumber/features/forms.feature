@proprietary @forms
Feature: Forms API Validation

    @fields @positive
    Scenario: Get form fields from plain PDF
        Given I generate a PDF file as "file"
        And the pdf contains 2 pages
        When I send the API request to the endpoint "/api/v1/form/fields"
        And this operation is run 5 times in parallel
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response file should have size greater than 0

    @fields @positive
    Scenario: Get form fields from multi-page PDF
        Given I generate a PDF file as "file"
        And the pdf contains 5 pages
        When I send the API request to the endpoint "/api/v1/form/fields"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response file should have size greater than 0

    @fields-with-coordinates @positive
    Scenario: Get form fields with coordinates from PDF
        Given I generate a PDF file as "file"
        And the pdf contains 2 pages
        When I send the API request to the endpoint "/api/v1/form/fields-with-coordinates"
        And this operation is run 5 times in parallel
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response file should have size greater than 0

    @fields-with-coordinates @positive
    Scenario: Get form fields with coordinates from multi-page PDF
        Given I generate a PDF file as "file"
        And the pdf contains 4 pages
        When I send the API request to the endpoint "/api/v1/form/fields-with-coordinates"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response file should have size greater than 0

    @fill @positive
    Scenario: Fill PDF form with default options
        Given I generate a PDF file as "file"
        And the pdf contains 2 pages
        And the pdf has form fields
        When I send the API request to the endpoint "/api/v1/form/fill"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"

    @fill @positive
    Scenario: Fill and flatten PDF form
        Given I generate a PDF file as "file"
        And the pdf contains 3 pages
        And the pdf has form fields
        And the request data includes
            | parameter | value |
            | flatten   | true  |
        When I send the API request to the endpoint "/api/v1/form/fill"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"

    @modify-fields @negative
    Scenario: Modify form fields with no updates payload returns 400
        Given I generate a PDF file as "file"
        And the pdf contains 2 pages
        When I send the API request to the endpoint "/api/v1/form/modify-fields"
        And this operation is run 5 times in parallel
        Then the response status code should be 400

    @modify-fields @negative
    Scenario: Modify form fields in multi-page PDF with no updates payload returns 400
        Given I generate a PDF file as "file"
        And the pdf contains 5 pages
        When I send the API request to the endpoint "/api/v1/form/modify-fields"
        Then the response status code should be 400

    @delete-fields @negative
    Scenario: Delete form fields with no names payload returns 400
        Given I generate a PDF file as "file"
        And the pdf contains 2 pages
        When I send the API request to the endpoint "/api/v1/form/delete-fields"
        And this operation is run 5 times in parallel
        Then the response status code should be 400

    @delete-fields @negative
    Scenario: Delete form fields from multi-page PDF with no names payload returns 400
        Given I generate a PDF file as "file"
        And the pdf contains 4 pages
        When I send the API request to the endpoint "/api/v1/form/delete-fields"
        Then the response status code should be 400


    @extract-csv @positive
    Scenario: extract-csv returns CSV for a form PDF
        Given I generate a PDF file as "file"
        And the pdf contains 2 pages
        And the pdf has form fields
        When I send the API request to the endpoint "/api/v1/form/extract-csv"
        And this operation is run 5 times in parallel
        Then the response status code should be 200
        And the response content type should be "text/csv"


    @extract-xlsx @positive
    Scenario: extract-xlsx returns a spreadsheet for a form PDF
        Given I generate a PDF file as "file"
        And the pdf contains 2 pages
        And the pdf has form fields
        When I send the API request to the endpoint "/api/v1/form/extract-xlsx"
        And this operation is run 5 times in parallel
        Then the response status code should be 200
        And the response file should have size greater than 200


    @extract-csv @negative
    Scenario: extract-csv rejects a upload sent under the wrong part name
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        When I send the API request to the endpoint "/api/v1/form/extract-csv"
        Then the response status code should be 400
        And the response JSON error should contain "file"

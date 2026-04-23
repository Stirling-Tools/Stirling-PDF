@analysis
Feature: Analysis API Endpoints

    Analysis endpoints inspect a PDF and return structured JSON (HTTP 200).
    No binary output is produced; all responses are application/json with
    a non-empty body.


    # ---------------------------------------------------------------------------
    # /api/v1/analysis/page-count
    # ---------------------------------------------------------------------------

    @page-count @positive
    Scenario Outline: page-count returns JSON with pageCount for different page numbers
        Given I generate a PDF file as "fileInput"
        And the pdf contains <pages> pages
        When I send the API request to the endpoint "/api/v1/analysis/page-count"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response file should have size greater than 0

        Examples:
            | pages |
            | 1     |
            | 5     |
            | 20    |


    # ---------------------------------------------------------------------------
    # /api/v1/analysis/basic-info
    # ---------------------------------------------------------------------------

    @basic-info @positive
    Scenario: basic-info returns JSON for a standard PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 4 pages
        When I send the API request to the endpoint "/api/v1/analysis/basic-info"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response file should have size greater than 0

    @basic-info @positive
    Scenario: basic-info returns JSON for a single-page PDF
        Given I generate a PDF file as "fileInput"
        When I send the API request to the endpoint "/api/v1/analysis/basic-info"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response file should have size greater than 0

    @basic-info @positive
    Scenario: basic-info returns JSON for a PDF with text content
        Given I generate a PDF file as "fileInput"
        And the pdf contains 3 pages with random text
        When I send the API request to the endpoint "/api/v1/analysis/basic-info"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response file should have size greater than 0


    # ---------------------------------------------------------------------------
    # /api/v1/analysis/document-properties
    # ---------------------------------------------------------------------------

    @document-properties @positive
    Scenario: document-properties returns JSON for a plain PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        When I send the API request to the endpoint "/api/v1/analysis/document-properties"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response file should have size greater than 0

    @document-properties @positive
    Scenario: document-properties returns JSON for a multi-page PDF with text
        Given I generate a PDF file as "fileInput"
        And the pdf contains 5 pages with random text
        When I send the API request to the endpoint "/api/v1/analysis/document-properties"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response file should have size greater than 0


    # ---------------------------------------------------------------------------
    # /api/v1/analysis/page-dimensions
    # ---------------------------------------------------------------------------

    @page-dimensions @positive
    Scenario Outline: page-dimensions returns JSON for PDFs of different sizes
        Given I generate a PDF file as "fileInput"
        And the pdf contains <pages> pages
        When I send the API request to the endpoint "/api/v1/analysis/page-dimensions"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response file should have size greater than 0

        Examples:
            | pages |
            | 1     |
            | 3     |
            | 10    |

    @page-dimensions @positive
    Scenario: page-dimensions returns JSON for a LETTER-sized PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages with random text
        When I send the API request to the endpoint "/api/v1/analysis/page-dimensions"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response file should have size greater than 0


    # ---------------------------------------------------------------------------
    # /api/v1/analysis/form-fields
    # ---------------------------------------------------------------------------

    @form-fields @positive
    Scenario: form-fields returns JSON for a PDF without any form fields
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        When I send the API request to the endpoint "/api/v1/analysis/form-fields"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response file should have size greater than 0

    @form-fields @positive
    Scenario: form-fields returns JSON for a multi-page PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 10 pages
        When I send the API request to the endpoint "/api/v1/analysis/form-fields"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response file should have size greater than 0


    # ---------------------------------------------------------------------------
    # /api/v1/analysis/annotation-info
    # ---------------------------------------------------------------------------

    @annotation-info @positive
    Scenario: annotation-info returns JSON for a PDF with no annotations
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        When I send the API request to the endpoint "/api/v1/analysis/annotation-info"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response file should have size greater than 0

    @annotation-info @positive
    Scenario: annotation-info returns JSON for a text-content PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 4 pages with random text
        When I send the API request to the endpoint "/api/v1/analysis/annotation-info"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response file should have size greater than 0


    # ---------------------------------------------------------------------------
    # /api/v1/analysis/font-info
    # ---------------------------------------------------------------------------

    @font-info @positive
    Scenario: font-info returns JSON for a blank PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        When I send the API request to the endpoint "/api/v1/analysis/font-info"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response file should have size greater than 0

    @font-info @positive
    Scenario: font-info returns JSON for a PDF containing text
        Given I generate a PDF file as "fileInput"
        And the pdf contains 3 pages with random text
        When I send the API request to the endpoint "/api/v1/analysis/font-info"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response file should have size greater than 0


    # ---------------------------------------------------------------------------
    # /api/v1/analysis/security-info
    # ---------------------------------------------------------------------------

    @security-info @positive
    Scenario: security-info returns JSON for an unencrypted PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        When I send the API request to the endpoint "/api/v1/analysis/security-info"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response file should have size greater than 0

    @security-info @positive
    Scenario: security-info returns JSON for a multi-page PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 5 pages with random text
        When I send the API request to the endpoint "/api/v1/analysis/security-info"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response file should have size greater than 0

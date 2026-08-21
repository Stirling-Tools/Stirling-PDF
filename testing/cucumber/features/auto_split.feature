@misc
Feature: Auto-Split PDF API Validation

    @auto-split @positive
    Scenario: Auto-split PDF with QR code marker on first page
        Given I generate a PDF file as "fileInput"
        And the pdf contains 4 pages with random text
        And the pdf has a Stirling-PDF QR code split marker on page 1
        When I send the API request to the endpoint "/api/v1/misc/auto-split-pdf"
        Then the response status code should be 200
        And the response file should have size greater than 0

    @auto-split @positive
    Scenario: Auto-split PDF with QR code marker on middle page
        Given I generate a PDF file as "fileInput"
        And the pdf contains 5 pages with random text
        And the pdf has a Stirling-PDF QR code split marker on page 3
        When I send the API request to the endpoint "/api/v1/misc/auto-split-pdf"
        Then the response status code should be 200
        And the response file should have size greater than 0

    @auto-split @positive
    Scenario: Auto-split PDF with duplex mode enabled
        Given I generate a PDF file as "fileInput"
        And the pdf contains 4 pages with random text
        And the pdf has a Stirling-PDF QR code split marker on page 1
        And the request data includes
            | parameter  | value |
            | duplexMode | true  |
        When I send the API request to the endpoint "/api/v1/misc/auto-split-pdf"
        Then the response status code should be 200
        And the response file should have size greater than 0

    @auto-split @positive
    Scenario: Auto-split single-page PDF with QR marker
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages with random text
        And the pdf has a Stirling-PDF QR code split marker on page 1
        When I send the API request to the endpoint "/api/v1/misc/auto-split-pdf"
        Then the response status code should be 200
        And the response file should have size greater than 0

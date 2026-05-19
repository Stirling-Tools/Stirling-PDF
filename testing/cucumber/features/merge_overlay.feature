@general
Feature: Merge and Overlay PDF API Validation

    @merge @positive
    Scenario: Merge two PDFs with default options
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages with random text
        And I also generate a PDF file as "fileInput"
        When I send the API request to the endpoint "/api/v1/general/merge-pdfs"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"

    @merge @positive
    Scenario: Merge three PDFs with byFileName sort
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages with random text
        And I also generate a PDF file as "fileInput"
        And I also generate a PDF file as "fileInput"
        And the request data includes
            | parameter | value      |
            | sortType  | byFileName |
        When I send the API request to the endpoint "/api/v1/general/merge-pdfs"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"

    @merge @positive
    Scenario: Merge PDFs with table of contents
        Given I generate a PDF file as "fileInput"
        And the pdf contains 3 pages with random text
        And I also generate a PDF file as "fileInput"
        And the request data includes
            | parameter   | value |
            | generateToc | true  |
        When I send the API request to the endpoint "/api/v1/general/merge-pdfs"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"

    @overlay @positive
    Scenario: Overlay PDF in sequential mode foreground
        Given I generate a PDF file as "fileInput"
        And the pdf contains 3 pages with random text
        And I also generate a PDF file as "overlayFiles"
        And the request data includes
            | parameter       | value             |
            | overlayMode     | SequentialOverlay |
            | overlayPosition | 0                 |
        When I send the API request to the endpoint "/api/v1/general/overlay-pdfs"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"

    @overlay @positive
    Scenario: Overlay PDF in interleaved mode background
        Given I generate a PDF file as "fileInput"
        And the pdf contains 3 pages with random text
        And I also generate a PDF file as "overlayFiles"
        And the request data includes
            | parameter       | value              |
            | overlayMode     | InterleavedOverlay |
            | overlayPosition | 1                  |
        When I send the API request to the endpoint "/api/v1/general/overlay-pdfs"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"

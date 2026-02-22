@misc-new
Feature: Miscellaneous PDF Operations API Validation


    @add-stamp @positive
    Scenario Outline: add-stamp applies a text stamp at various positions
        Given I generate a PDF file as "fileInput"
        And the pdf contains 3 pages
        And the request data includes
            | parameter    | value      |
            | stampType    | text       |
            | stampText    | Test Stamp |
            | position     | <position> |
            | fontSize     | 20         |
            | rotation     | 0          |
            | opacity      | 0.5        |
            | customColor  | #d3d3d3    |
            | customMargin | medium     |
            | overrideX    | -1         |
            | overrideY    | -1         |
        When I send the API request to the endpoint "/api/v1/misc/add-stamp"
        Then the response content type should be "application/pdf"
        And the response status code should be 200
        And the response file should have size greater than 200
        And the response PDF should contain 3 pages

        Examples:
            | position |
            | 1        |
            | 5        |
            | 9        |


    @add-stamp @positive
    Scenario: add-stamp with rotation and full opacity
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        And the request data includes
            | parameter    | value        |
            | stampType    | text         |
            | stampText    | CONFIDENTIAL |
            | position     | 5            |
            | fontSize     | 30           |
            | rotation     | 45           |
            | opacity      | 1.0          |
            | customColor  | #d3d3d3      |
            | customMargin | medium       |
            | overrideX    | -1           |
            | overrideY    | -1           |
        When I send the API request to the endpoint "/api/v1/misc/add-stamp"
        Then the response content type should be "application/pdf"
        And the response status code should be 200
        And the response file should have size greater than 200
        And the response PDF should contain 2 pages


    @add-page-numbers @positive
    Scenario Outline: add-page-numbers inserts numbers at various positions
        Given I generate a PDF file as "fileInput"
        And the pdf contains 4 pages
        And the request data includes
            | parameter      | value       |
            | startingNumber | 1           |
            | position       | <position>  |
            | fontSize       | 12          |
        When I send the API request to the endpoint "/api/v1/misc/add-page-numbers"
        Then the response content type should be "application/pdf"
        And the response status code should be 200
        And the response file should have size greater than 200
        And the response PDF should contain 4 pages

        Examples:
            | position |
            | 1        |
            | 2        |
            | 3        |
            | 4        |
            | 5        |
            | 6        |
            | 7        |
            | 8        |
            | 9        |


    @add-page-numbers @positive
    Scenario: add-page-numbers starting from a custom number
        Given I generate a PDF file as "fileInput"
        And the pdf contains 5 pages
        And the request data includes
            | parameter      | value |
            | startingNumber | 10    |
            | position       | 2     |
            | fontSize       | 14    |
        When I send the API request to the endpoint "/api/v1/misc/add-page-numbers"
        Then the response content type should be "application/pdf"
        And the response status code should be 200
        And the response file should have size greater than 200
        And the response PDF should contain 5 pages


    @unlock-pdf-forms @positive
    Scenario: unlock-pdf-forms returns a valid unlocked PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        When I send the API request to the endpoint "/api/v1/misc/unlock-pdf-forms"
        Then the response content type should be "application/pdf"
        And the response status code should be 200
        And the response file should have size greater than 0


    @scanner-effect @positive
    Scenario Outline: scanner-effect applies a scan simulation to a PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 1 pages
        And the request data includes
            | parameter  | value        |
            | colorspace | <colorspace> |
            | quality    | <quality>    |
        When I send the API request to the endpoint "/api/v1/misc/scanner-effect"
        Then the response content type should be "application/pdf"
        And the response status code should be 200
        And the response file should have size greater than 0
        And the response PDF should contain 1 pages

        Examples:
            | colorspace | quality |
            | grayscale  | low     |
            | grayscale  | medium  |
            | grayscale  | high    |


    @replace-invert-pdf @positive
    Scenario: replace-invert-pdf returns a valid PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        And the request data includes
            | parameter                    | value               |
            | replaceAndInvertOption       | HIGH_CONTRAST_COLOR |
            | highContrastColorCombination | WHITE_TEXT_ON_BLACK |
        When I send the API request to the endpoint "/api/v1/misc/replace-invert-pdf"
        Then the response content type should be "application/pdf"
        And the response status code should be 200
        And the response file should have size greater than 0
        And the response PDF should contain 2 pages


    @replace-invert-pdf @positive
    Scenario: replace-invert-pdf on a PDF with images returns a valid PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 images of size 100x100 on 1 pages
        And the request data includes
            | parameter                    | value               |
            | replaceAndInvertOption       | FULL_INVERSION      |
            | highContrastColorCombination | WHITE_TEXT_ON_BLACK |
        When I send the API request to the endpoint "/api/v1/misc/replace-invert-pdf"
        Then the response content type should be "application/pdf"
        And the response status code should be 200
        And the response file should have size greater than 0


    @decompress-pdf @positive
    Scenario: decompress-pdf returns a decompressed PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 3 pages
        When I send the API request to the endpoint "/api/v1/misc/decompress-pdf"
        Then the response content type should be "application/pdf"
        And the response status code should be 200
        And the response file should have size greater than 0
        And the response PDF should contain 3 pages


    @decompress-pdf @positive
    Scenario: decompress-pdf on a single-page PDF returns valid output
        Given I generate a PDF file as "fileInput"
        And the pdf contains 1 pages
        When I send the API request to the endpoint "/api/v1/misc/decompress-pdf"
        Then the response content type should be "application/pdf"
        And the response status code should be 200
        And the response file should have size greater than 0
        And the response PDF should contain 1 pages


    @auto-rename @positive
    Scenario: auto-rename renames PDF using first text content as filename
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages with random text
        And the request data includes
            | parameter              | value |
            | useFirstTextAsFallback | true  |
        When I send the API request to the endpoint "/api/v1/misc/auto-rename"
        Then the response content type should be "application/pdf"
        And the response status code should be 200
        And the response file should have size greater than 0


    @auto-rename @positive
    Scenario: auto-rename on a plain text PDF returns a PDF with a derived name
        Given I generate a PDF file as "fileInput"
        And the pdf contains 1 pages with random text
        And the request data includes
            | parameter              | value |
            | useFirstTextAsFallback | true  |
        When I send the API request to the endpoint "/api/v1/misc/auto-rename"
        Then the response content type should be "application/pdf"
        And the response status code should be 200
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"


    @show-javascript @positive
    Scenario: show-javascript returns a response for a PDF without JavaScript
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        When I send the API request to the endpoint "/api/v1/misc/show-javascript"
        Then the response status code should be 200
        And the response file should have size greater than 0


    @show-javascript @positive
    Scenario: show-javascript on a multi-page PDF returns status 200
        Given I generate a PDF file as "fileInput"
        And the pdf contains 5 pages with random text
        When I send the API request to the endpoint "/api/v1/misc/show-javascript"
        Then the response status code should be 200

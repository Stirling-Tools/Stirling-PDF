@general
Feature: Bookmarks and Chapter Splitting API Validation

    @extract-bookmarks @positive
    Scenario: Extract bookmarks from PDF with bookmarks
        Given I generate a PDF file as "file"
        And the pdf contains 3 pages with random text
        And the pdf has bookmarks
        When I send the API request to the endpoint "/api/v1/general/extract-bookmarks"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response file should have size greater than 0

    @extract-bookmarks @positive
    Scenario: Extract bookmarks from plain PDF returns empty list
        Given I generate a PDF file as "file"
        And the pdf contains 2 pages
        When I send the API request to the endpoint "/api/v1/general/extract-bookmarks"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response file should have size greater than 0

    @split-pdf-by-chapters @positive
    Scenario: Split PDF by chapters with top-level bookmarks
        Given I generate a PDF file as "fileInput"
        And the pdf contains 4 pages with random text
        And the pdf has bookmarks
        And the request data includes
            | parameter       | value |
            | bookmarkLevel   | 0     |
            | includeMetadata | false |
            | allowDuplicates | false |
        When I send the API request to the endpoint "/api/v1/general/split-pdf-by-chapters"
        Then the response status code should be 200
        And the response file should have size greater than 0

    @split-pdf-by-chapters @positive
    Scenario: Split PDF by chapters with metadata included
        Given I generate a PDF file as "fileInput"
        And the pdf contains 3 pages with random text
        And the pdf has bookmarks
        And the request data includes
            | parameter       | value |
            | bookmarkLevel   | 0     |
            | includeMetadata | true  |
            | allowDuplicates | false |
        When I send the API request to the endpoint "/api/v1/general/split-pdf-by-chapters"
        Then the response status code should be 200
        And the response file should have size greater than 0

    @split-pdf-by-chapters @positive
    Scenario: Split PDF by chapters allowing duplicate pages
        Given I generate a PDF file as "fileInput"
        And the pdf contains 3 pages with random text
        And the pdf has bookmarks
        And the request data includes
            | parameter       | value |
            | bookmarkLevel   | 0     |
            | includeMetadata | false |
            | allowDuplicates | true  |
        When I send the API request to the endpoint "/api/v1/general/split-pdf-by-chapters"
        Then the response status code should be 200
        And the response file should have size greater than 0

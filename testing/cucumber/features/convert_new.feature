@convert
Feature: Convert API Validation (additional endpoints)

    @ghostscript @positive
    Scenario Outline: Convert PDF to vector format
        Given I generate a PDF file as "fileInput"
        And the pdf contains 1 pages with random text
        And the request data includes
            | parameter    | value    |
            | outputFormat | <format> |
        When I send the API request to the endpoint "/api/v1/convert/pdf/vector"
        Then the response status code should be 200
        And the response file should have size greater than 0
        And the response file should have extension "<extension>"

        @pdf-to-eps
        Examples:
            | format | extension |
            | eps    | .eps      |

        Examples:
            | format | extension |
            | ps     | .ps       |
            | pcl    | .pcl      |
            | xps    | .xps      |

    @image @positive @pdf-to-cbz
    Scenario: Convert PDF to CBZ with default DPI
        Given I generate a PDF file as "fileInput"
        And the pdf contains 3 pages with random text
        When I send the API request to the endpoint "/api/v1/convert/pdf/cbz"
        Then the response status code should be 200
        And the response file should have size greater than 0
        And the response file should have extension ".cbz"

    @image @positive @pdf-to-cbz
    Scenario: Convert PDF to CBZ with low DPI
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages with random text
        And the request data includes
            | parameter | value |
            | dpi       | 72    |
        When I send the API request to the endpoint "/api/v1/convert/pdf/cbz"
        Then the response status code should be 200
        And the response file should have size greater than 0
        And the response file should have extension ".cbz"

    @image @positive @pdf-to-cbz
    Scenario: Convert single-page PDF to CBZ
        Given I generate a PDF file as "fileInput"
        And the pdf contains 1 pages
        And the request data includes
            | parameter | value |
            | dpi       | 72    |
        When I send the API request to the endpoint "/api/v1/convert/pdf/cbz"
        Then the response status code should be 200
        And the response file should have size greater than 0
        And the response file should have extension ".cbz"

    @calibre @positive @pdf-to-epub
    Scenario: Convert PDF to EPUB format
        Given I generate a PDF file as "fileInput"
        And the pdf contains 3 pages with random text
        And the request data includes
            | parameter       | value |
            | outputFormat    | EPUB  |
            | detectChapters  | false |
        When I send the API request to the endpoint "/api/v1/convert/pdf/epub"
        Then the response status code should be 200
        And the response file should have size greater than 0
        And the response file should have extension ".epub"

    @calibre @positive @pdf-to-epub
    Scenario: Convert PDF to AZW3 format
        Given I generate a PDF file as "fileInput"
        And the pdf contains 3 pages with random text
        And the request data includes
            | parameter       | value |
            | outputFormat    | AZW3  |
            | detectChapters  | false |
        When I send the API request to the endpoint "/api/v1/convert/pdf/epub"
        Then the response status code should be 200
        And the response file should have size greater than 0
        And the response file should have extension ".azw3"

    @calibre @positive @pdf-to-epub
    Scenario: Convert PDF to EPUB with chapter detection
        Given I generate a PDF file as "fileInput"
        And the pdf contains 5 pages with random text
        And the request data includes
            | parameter       | value |
            | outputFormat    | EPUB  |
            | detectChapters  | true  |
        When I send the API request to the endpoint "/api/v1/convert/pdf/epub"
        Then the response status code should be 200
        And the response file should have size greater than 0
        And the response file should have extension ".epub"


    @pdf-to-csv @negative
    Scenario: A PDF with no tables is refused instead of returning an empty CSV
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages with random text
        And the request data includes
            | parameter   | value |
            | pageNumbers | all   |
        When I send the API request to the endpoint "/api/v1/convert/pdf/csv"
        Then the response status code should be 422
        And the response JSON field "errorCode" should equal "E088"
        And the response JSON error should contain "No tables were found"


    @pdf-to-csv @negative
    Scenario: A scanned PDF with no text layer is told to run OCR first
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 images of size 100x100 on 2 pages
        And the request data includes
            | parameter   | value |
            | pageNumbers | all   |
        When I send the API request to the endpoint "/api/v1/convert/pdf/csv"
        Then the response status code should be 422
        And the response JSON field "errorCode" should equal "E090"
        And the response JSON error should contain "Run OCR"

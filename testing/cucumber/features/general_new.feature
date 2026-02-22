@general-new
Feature: General PDF Operations API Validation


    @rotate-pdf @positive
    Scenario Outline: rotate-pdf with valid rotation angles
        Given I generate a PDF file as "fileInput"
        And the pdf contains 3 pages
        And the request data includes
            | parameter | value   |
            | angle     | <angle> |
        When I send the API request to the endpoint "/api/v1/general/rotate-pdf"
        Then the response content type should be "application/pdf"
        And the response status code should be 200
        And the response file should have size greater than 200
        And the response PDF should contain 3 pages

        Examples:
            | angle |
            | 90    |
            | 180   |
            | 270   |


    @rotate-pdf @negative @rotate-pdf-negative
    Scenario: rotate-pdf with invalid angle returns error
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        And the request data includes
            | parameter | value |
            | angle     | 45    |
        When I send the API request to the endpoint "/api/v1/general/rotate-pdf"
        Then the response status code should be 400


    @remove-pages @positive
    Scenario: remove-pages removes the specified page from a multi-page PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 5 pages
        And the request data includes
            | parameter   | value |
            | pageNumbers | 3     |
        When I send the API request to the endpoint "/api/v1/general/remove-pages"
        Then the response content type should be "application/pdf"
        And the response status code should be 200
        And the response file should have size greater than 200
        And the response PDF should contain 4 pages


    @remove-pages @positive
    Scenario Outline: remove-pages with various page selections
        Given I generate a PDF file as "fileInput"
        And the pdf contains 6 pages
        And the request data includes
            | parameter   | value         |
            | pageNumbers | <pageNumbers> |
        When I send the API request to the endpoint "/api/v1/general/remove-pages"
        Then the response content type should be "application/pdf"
        And the response status code should be 200
        And the response file should have size greater than 200
        And the response PDF should contain <remaining> pages

        Examples:
            | pageNumbers | remaining |
            | 1           | 5         |
            | 6           | 5         |
            | 2,4         | 4         |
            | 1,2,3       | 3         |


    @rearrange-pages @positive
    Scenario Outline: rearrange-pages with different custom modes
        Given I generate a PDF file as "fileInput"
        And the pdf contains 4 pages
        And the request data includes
            | parameter  | value        |
            | customMode | <customMode> |
        When I send the API request to the endpoint "/api/v1/general/rearrange-pages"
        Then the response content type should be "application/pdf"
        And the response status code should be 200
        And the response file should have size greater than 200
        And the response PDF should contain <expectedPages> pages

        Examples:
            | customMode    | expectedPages |
            | REVERSE_ORDER | 4             |

        @rearrange-duplicate
        Examples:
            | customMode | expectedPages |
            | DUPLICATE  | 8             |

        Examples:
            | customMode     | expectedPages |
            | ODD_EVEN_SPLIT | 4             |


    @scale-pages @positive
    Scenario Outline: scale-pages to various standard page sizes
        Given I generate a PDF file as "fileInput"
        And the pdf contains 3 pages
        And the request data includes
            | parameter | value      |
            | pageSize  | <pageSize> |
        When I send the API request to the endpoint "/api/v1/general/scale-pages"
        Then the response content type should be "application/pdf"
        And the response status code should be 200
        And the response file should have size greater than 200
        And the response PDF should contain 3 pages

        Examples:
            | pageSize |
            | A4       |
            | LETTER   |
            | A3       |
            | LEGAL    |


    @crop @positive
    Scenario: crop PDF pages to a specific region
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        And the request data includes
            | parameter | value |
            | x         | 0     |
            | y         | 0     |
            | width     | 50    |
            | height    | 50    |
        When I send the API request to the endpoint "/api/v1/general/crop"
        Then the response content type should be "application/pdf"
        And the response status code should be 200
        And the response file should have size greater than 200
        And the response PDF should contain 2 pages


    @crop @positive
    Scenario: crop single-page PDF preserves page count
        Given I generate a PDF file as "fileInput"
        And the pdf contains 1 pages
        And the request data includes
            | parameter | value |
            | x         | 0     |
            | y         | 0     |
            | width     | 50    |
            | height    | 50    |
        When I send the API request to the endpoint "/api/v1/general/crop"
        Then the response content type should be "application/pdf"
        And the response status code should be 200
        And the response file should have size greater than 0
        And the response PDF should contain 1 pages


    @pdf-to-single-page @positive
    Scenario: pdf-to-single-page combines all pages into one long page
        Given I generate a PDF file as "fileInput"
        And the pdf contains 5 pages
        When I send the API request to the endpoint "/api/v1/general/pdf-to-single-page"
        Then the response content type should be "application/pdf"
        And the response status code should be 200
        And the response file should have size greater than 200
        And the response PDF should contain 1 pages


    @pdf-to-single-page @positive
    Scenario: pdf-to-single-page with a single-page input returns one page
        Given I generate a PDF file as "fileInput"
        And the pdf contains 1 pages
        When I send the API request to the endpoint "/api/v1/general/pdf-to-single-page"
        Then the response content type should be "application/pdf"
        And the response status code should be 200
        And the response file should have size greater than 0
        And the response PDF should contain 1 pages


    @multi-page-layout @positive
    Scenario Outline: multi-page-layout combines input pages onto fewer sheets
        Given I generate a PDF file as "fileInput"
        And the pdf contains 4 pages
        And the request data includes
            | parameter     | value          |
            | pagesPerSheet | <pagesPerSheet> |
        When I send the API request to the endpoint "/api/v1/general/multi-page-layout"
        Then the response content type should be "application/pdf"
        And the response status code should be 200
        And the response file should have size greater than 200
        And the response PDF should contain <outputPages> pages

        Examples:
            | pagesPerSheet | outputPages |
            | 2             | 2           |
            | 4             | 1           |


    @multi-page-layout @positive
    Scenario: multi-page-layout with 9 pages per sheet on 9 input pages
        Given I generate a PDF file as "fileInput"
        And the pdf contains 9 pages
        And the request data includes
            | parameter     | value |
            | pagesPerSheet | 9     |
        When I send the API request to the endpoint "/api/v1/general/multi-page-layout"
        Then the response content type should be "application/pdf"
        And the response status code should be 200
        And the response file should have size greater than 200
        And the response PDF should contain 1 pages


    @booklet-imposition @positive
    Scenario: booklet-imposition returns a valid PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 4 pages
        And the request data includes
            | parameter     | value |
            | pagesPerSheet | 2     |
        When I send the API request to the endpoint "/api/v1/general/booklet-imposition"
        Then the response content type should be "application/pdf"
        And the response status code should be 200
        And the response file should have size greater than 200


    @booklet-imposition @positive
    Scenario: booklet-imposition with 8-page input returns valid PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 8 pages
        And the request data includes
            | parameter     | value |
            | pagesPerSheet | 2     |
        When I send the API request to the endpoint "/api/v1/general/booklet-imposition"
        Then the response content type should be "application/pdf"
        And the response status code should be 200
        And the response file should have size greater than 200


    @remove-image-pdf @positive
    Scenario: remove-image-pdf strips images from a PDF containing images
        Given I generate a PDF file as "fileInput"
        And the pdf contains 3 images of size 100x100 on 2 pages
        When I send the API request to the endpoint "/api/v1/general/remove-image-pdf"
        Then the response content type should be "application/pdf"
        And the response status code should be 200
        And the response file should have size greater than 0


    @remove-image-pdf @positive
    Scenario: remove-image-pdf on a plain text PDF returns a PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 3 pages with random text
        When I send the API request to the endpoint "/api/v1/general/remove-image-pdf"
        Then the response content type should be "application/pdf"
        And the response status code should be 200
        And the response file should have size greater than 0

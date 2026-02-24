@filter
Feature: Filter API Endpoints

    Filter endpoints return 200 with the original PDF when the filter condition
    is satisfied, or 204 (No Content) when the condition is not satisfied.


    # ---------------------------------------------------------------------------
    # filter-page-count
    # ---------------------------------------------------------------------------

    @filter-page-count @positive
    Scenario Outline: filter-page-count returns 200 when condition is met
        Given I generate a PDF file as "fileInput"
        And the pdf contains 5 pages
        And the request data includes
            | parameter  | value        |
            | pageCount  | <pageCount>  |
            | comparator | <comparator> |
        When I send the API request to the endpoint "/api/v1/filter/filter-page-count"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0

        Examples:
            | pageCount | comparator |
            | 3         | Greater    |
            | 5         | Equal      |
            | 7         | Less       |

    @filter-page-count @negative
    Scenario Outline: filter-page-count returns 204 when condition is not met
        Given I generate a PDF file as "fileInput"
        And the pdf contains 5 pages
        And the request data includes
            | parameter  | value        |
            | pageCount  | <pageCount>  |
            | comparator | <comparator> |
        When I send the API request to the endpoint "/api/v1/filter/filter-page-count"
        Then the response status code should be 204

        Examples:
            | pageCount | comparator |
            | 5         | Greater    |
            | 4         | Equal      |
            | 5         | Less       |


    # ---------------------------------------------------------------------------
    # filter-file-size
    # ---------------------------------------------------------------------------

    @filter-file-size @positive
    Scenario Outline: filter-file-size returns 200 when condition is met
        Given I generate a PDF file as "fileInput"
        And the pdf contains 3 pages
        And the request data includes
            | parameter  | value        |
            | fileSize   | <fileSize>   |
            | comparator | <comparator> |
        When I send the API request to the endpoint "/api/v1/filter/filter-file-size"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0

        Examples:
            | fileSize | comparator |
            | 100      | Greater    |
            | 9999999  | Less       |

    @filter-file-size @negative
    Scenario: filter-file-size returns 204 when file is not large enough
        Given I generate a PDF file as "fileInput"
        And the pdf contains 1 pages
        And the request data includes
            | parameter  | value    |
            | fileSize   | 99999999 |
            | comparator | Greater  |
        When I send the API request to the endpoint "/api/v1/filter/filter-file-size"
        Then the response status code should be 204


    # ---------------------------------------------------------------------------
    # filter-page-rotation
    # ---------------------------------------------------------------------------

    @filter-page-rotation @positive
    Scenario: filter-page-rotation returns 200 for Equal comparator on 0-degree pages
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        And the request data includes
            | parameter  | value |
            | rotation   | 0     |
            | comparator | Equal |
        When I send the API request to the endpoint "/api/v1/filter/filter-page-rotation"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0

    @filter-page-rotation @positive
    Scenario Outline: filter-page-rotation returns 200 for Greater comparator on 0-degree pages
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        And the request data includes
            | parameter  | value        |
            | rotation   | <rotation>   |
            | comparator | <comparator> |
        When I send the API request to the endpoint "/api/v1/filter/filter-page-rotation"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0

        Examples:
            | rotation | comparator |
            | 90       | Less       |
            | 180      | Less       |
            | 270      | Less       |

    @filter-page-rotation @negative
    Scenario Outline: filter-page-rotation returns 204 when condition is not met
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        And the request data includes
            | parameter  | value        |
            | rotation   | <rotation>   |
            | comparator | <comparator> |
        When I send the API request to the endpoint "/api/v1/filter/filter-page-rotation"
        Then the response status code should be 204

        Examples:
            | rotation | comparator |
            | 0        | Greater    |
            | 90       | Equal      |
            | 180      | Equal      |


    # ---------------------------------------------------------------------------
    # filter-page-size
    # Blank pages use LETTER (612x792 points = 484704 sq pts), same as pages
    # with random text. Standard page areas for reference:
    #   A0 ~8031893 sq pts, A4 ~501168 sq pts, LEGAL 616896 sq pts,
    #   LETTER 484704 sq pts, A6 ~124870 sq pts
    # ---------------------------------------------------------------------------

    @filter-page-size @positive
    Scenario Outline: filter-page-size returns 200 when blank PDF is smaller than standard size
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        And the request data includes
            | parameter        | value              |
            | standardPageSize | <standardPageSize> |
            | comparator       | Less               |
        When I send the API request to the endpoint "/api/v1/filter/filter-page-size"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0

        Examples:
            | standardPageSize |
            | A0               |
            | A4               |
            | LEGAL            |

    @filter-page-size @positive
    Scenario: filter-page-size returns 200 when blank PDF equals LETTER size
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        And the request data includes
            | parameter        | value  |
            | standardPageSize | LETTER |
            | comparator       | Equal  |
        When I send the API request to the endpoint "/api/v1/filter/filter-page-size"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0

    @filter-page-size @positive
    Scenario: filter-page-size returns 200 when text PDF equals LETTER size
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages with random text
        And the request data includes
            | parameter        | value  |
            | standardPageSize | LETTER |
            | comparator       | Equal  |
        When I send the API request to the endpoint "/api/v1/filter/filter-page-size"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0

    @filter-page-size @positive
    Scenario: filter-page-size returns 200 when blank PDF is Greater than A6
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        And the request data includes
            | parameter        | value   |
            | standardPageSize | A6      |
            | comparator       | Greater |
        When I send the API request to the endpoint "/api/v1/filter/filter-page-size"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0

    @filter-page-size @negative
    Scenario Outline: filter-page-size returns 204 when blank PDF does not match standard size as Equal
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        And the request data includes
            | parameter        | value              |
            | standardPageSize | <standardPageSize> |
            | comparator       | Equal              |
        When I send the API request to the endpoint "/api/v1/filter/filter-page-size"
        Then the response status code should be 204

        Examples:
            | standardPageSize |
            | A4               |
            | LEGAL            |

    @filter-page-size @negative
    Scenario: filter-page-size returns 204 when blank PDF is not Greater than A4
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        And the request data includes
            | parameter        | value   |
            | standardPageSize | A4      |
            | comparator       | Greater |
        When I send the API request to the endpoint "/api/v1/filter/filter-page-size"
        Then the response status code should be 204


    # ---------------------------------------------------------------------------
    # filter-contains-text
    # ---------------------------------------------------------------------------

    @filter-contains-text @positive
    Scenario: filter-contains-text returns 200 when text is found in PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        And the pdf pages all contain the text "FINDME"
        And the request data includes
            | parameter   | value  |
            | text        | FINDME |
            | pageNumbers | all    |
        When I send the API request to the endpoint "/api/v1/filter/filter-contains-text"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0

    @filter-contains-text @negative
    Scenario: filter-contains-text returns 204 when text is not found in blank PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        And the request data includes
            | parameter   | value      |
            | text        | NOTPRESENT |
            | pageNumbers | all        |
        When I send the API request to the endpoint "/api/v1/filter/filter-contains-text"
        Then the response status code should be 204

    @filter-contains-text @negative
    Scenario: filter-contains-text returns 204 when searched text differs from PDF content
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        And the pdf pages all contain the text "HELLO"
        And the request data includes
            | parameter   | value   |
            | text        | GOODBYE |
            | pageNumbers | all     |
        When I send the API request to the endpoint "/api/v1/filter/filter-contains-text"
        Then the response status code should be 204


    # ---------------------------------------------------------------------------
    # filter-contains-image
    # ---------------------------------------------------------------------------

    @filter-contains-image @positive
    Scenario: filter-contains-image returns 200 when PDF contains images
        Given the pdf contains 2 images of size 100x100 on 1 pages
        And the request data includes
            | parameter   | value |
            | pageNumbers | all   |
        When I send the API request to the endpoint "/api/v1/filter/filter-contains-image"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0

    @filter-contains-image @negative
    Scenario: filter-contains-image returns 204 when PDF has no images
        Given I generate a PDF file as "fileInput"
        And the pdf contains 3 pages
        And the request data includes
            | parameter   | value |
            | pageNumbers | all   |
        When I send the API request to the endpoint "/api/v1/filter/filter-contains-image"
        Then the response status code should be 204

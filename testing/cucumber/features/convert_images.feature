@convert
Feature: Image Conversion API Validation

    @img-to-pdf @positive
    Scenario: Convert single PNG image to PDF
        Given I generate a PNG image file as "fileInput"
        When I send the API request to the endpoint "/api/v1/convert/img/pdf"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"

    @img-to-pdf @positive
    Scenario: Convert PNG image to PDF with fillPage fit option
        Given I generate a PNG image file as "fileInput"
        And the request data includes
            | parameter  | value    |
            | fitOption  | fillPage |
            | colorType  | color    |
            | autoRotate | false    |
        When I send the API request to the endpoint "/api/v1/convert/img/pdf"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"

    @img-to-pdf @positive
    Scenario: Convert multiple PNG images to PDF
        Given I generate a PNG image file as "fileInput"
        And I also generate a PNG image file as "fileInput"
        And I also generate a PNG image file as "fileInput"
        When I send the API request to the endpoint "/api/v1/convert/img/pdf"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"

    @svg-to-pdf @positive
    Scenario: Convert single SVG file to PDF
        Given I generate an SVG file as "fileInput"
        When I send the API request to the endpoint "/api/v1/convert/svg/pdf"
        Then the response status code should be 200
        And the response file should have size greater than 0

    @svg-to-pdf @positive
    Scenario: Convert multiple SVG files to PDF
        Given I generate an SVG file as "fileInput"
        And I also generate an SVG file as "fileInput"
        When I send the API request to the endpoint "/api/v1/convert/svg/pdf"
        Then the response status code should be 200
        And the response file should have size greater than 0

    @add-image @positive
    Scenario: Overlay PNG image onto PDF at default position
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages with random text
        And I generate a PNG image file as "imageFile"
        And the request data includes
            | parameter | value |
            | x         | 0     |
            | y         | 0     |
            | everyPage | false |
        When I send the API request to the endpoint "/api/v1/misc/add-image"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"

    @add-image @positive
    Scenario: Overlay PNG image onto every page of PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 3 pages with random text
        And I generate a PNG image file as "imageFile"
        And the request data includes
            | parameter | value |
            | x         | 10    |
            | y         | 10    |
            | everyPage | true  |
        When I send the API request to the endpoint "/api/v1/misc/add-image"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"

    @add-image @positive
    Scenario: Overlay SVG image onto PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages with random text
        And I generate an SVG file as "imageFile"
        And the request data includes
            | parameter | value |
            | x         | 50    |
            | y         | 50    |
            | everyPage | true  |
        When I send the API request to the endpoint "/api/v1/misc/add-image"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"

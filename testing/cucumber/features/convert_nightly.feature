@nightly @convert
Feature: Heavy conversion endpoints

    # Too slow for every PR: these shell out to LibreOffice, Calibre or Ghostscript.
    # behave.ini excludes @nightly; the nightly job opts back in with --tags=@nightly.

    @pdf-to-xlsx @positive
    Scenario: Convert a PDF containing tables to XLSX
        Given I use an example file at "exampleFiles/tables.pdf" as parameter "fileInput"
        When I send the API request to the endpoint "/api/v1/convert/pdf/xlsx"
        And this operation is run 3 times in parallel
        Then the response status code should be 200
        And the response file should have size greater than 1000
        And the response file should have extension ".xlsx"


    @pdf-to-xlsx @positive
    Scenario: A PDF with no tables converts without producing a spreadsheet
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages with random text
        When I send the API request to the endpoint "/api/v1/convert/pdf/xlsx"
        Then the response status code should be 204


    @text-editor @positive
    Scenario: text-editor metadata describes the document for the editor
        Given I use an example file at "exampleFiles/tables.pdf" as parameter "fileInput"
        When I send the API request to the endpoint "/api/v1/convert/pdf/text-editor/metadata"
        And this operation is run 3 times in parallel
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response JSON field "fonts" should not be empty


    @vector @negative
    Scenario: vector conversion rejects an input format Ghostscript cannot read
        Given I generate an SVG file as "fileInput"
        When I send the API request to the endpoint "/api/v1/convert/vector/pdf"
        Then the response status code should be 400
        And the response JSON error should contain "Unsupported"


    @ebook @positive
    Scenario: An EPUB produced by Stirling converts back to PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 3 pages with random text
        And the request data includes
            | parameter    | value |
            | outputFormat | EPUB  |
        When I send the API request to the endpoint "/api/v1/convert/pdf/epub"
        And this operation is run 3 times in parallel
        Then the response status code should be 200
        And the response file should have size greater than 200

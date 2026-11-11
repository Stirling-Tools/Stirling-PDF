@security
Feature: Security API Validation

    @sanitize @positive
    Scenario: Sanitize PDF with all options enabled
        Given I generate a PDF file as "fileInput"
        And the pdf contains 3 pages
        And the request data includes
            | parameter            | value |
            | removeJavaScript     | true  |
            | removeEmbeddedFiles  | true  |
            | removeXMPMetadata    | true  |
            | removeMetadata       | true  |
            | removeLinks          | true  |
            | removeFonts          | false |
        When I send the API request to the endpoint "/api/v1/security/sanitize-pdf"
        And this operation is run 5 times in parallel
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"

    @sanitize @positive
    Scenario: Sanitize PDF with default options
        Given I generate a PDF file as "fileInput"
        And the pdf contains 1 pages
        When I send the API request to the endpoint "/api/v1/security/sanitize-pdf"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"

    @sanitize @positive
    Scenario: Sanitize PDF removing only metadata
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        And the request data includes
            | parameter         | value |
            | removeMetadata    | true  |
            | removeXMPMetadata | true  |
        When I send the API request to the endpoint "/api/v1/security/sanitize-pdf"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0

    @auto-redact @positive
    Scenario: Auto-redact searchable text in PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 3 pages
        And the pdf pages all contain the text "CONFIDENTIAL"
        And the request data includes
            | parameter      | value        |
            | listOfText     | CONFIDENTIAL |
            | useRegex       | false        |
            | wholeWordSearch| true         |
            | convertPDFToImage | false     |
        When I send the API request to the endpoint "/api/v1/security/auto-redact"
        And this operation is run 5 times in parallel
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"

    @auto-redact @positive
    Scenario: Auto-redact with regex pattern
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        And the pdf pages all contain the text "SECRET-1234"
        And the request data includes
            | parameter   | value          |
            | listOfText  | SECRET-\d+     |
            | useRegex    | true           |
        When I send the API request to the endpoint "/api/v1/security/auto-redact"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"

    @auto-redact @positive
    Scenario: Auto-redact and convert to image
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        And the pdf pages all contain the text "PRIVATE"
        And the request data includes
            | parameter         | value   |
            | listOfText        | PRIVATE |
            | convertPDFToImage | true    |
        When I send the API request to the endpoint "/api/v1/security/auto-redact"
        Then the response status code should be 200
        And the response file should have size greater than 0

    @redact @positive
    Scenario: Redact specific pages fully
        Given I generate a PDF file as "fileInput"
        And the pdf contains 5 pages
        And the request data includes
            | parameter          | value   |
            | pageNumbers        | 2,4     |
            | pageRedactionColor | #000000 |
        When I send the API request to the endpoint "/api/v1/security/redact"
        And this operation is run 5 times in parallel
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"

    @redact @positive
    Scenario: Redact single page with custom color
        Given I generate a PDF file as "fileInput"
        And the pdf contains 3 pages
        And the request data includes
            | parameter          | value   |
            | pageNumbers        | 1       |
            | pageRedactionColor | #ff0000 |
        When I send the API request to the endpoint "/api/v1/security/redact"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0

    @redact @positive
    Scenario: Redact all pages
        Given I generate a PDF file as "fileInput"
        And the pdf contains 4 pages
        And the request data includes
            | parameter   | value |
            | pageNumbers | all   |
        When I send the API request to the endpoint "/api/v1/security/redact"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0

    @verify @positive
    Scenario: Verify PDF-A compliance
        Given I use an example file at "exampleFiles/pdfa1.pdf" as parameter "fileInput"
        When I send the API request to the endpoint "/api/v1/security/verify-pdf"
        And this operation is run 5 times in parallel
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response file should have size greater than 2

    @verify @positive
    Scenario: Verify standard PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        When I send the API request to the endpoint "/api/v1/security/verify-pdf"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response file should have size greater than 2

    @remove-cert-sign @positive
    Scenario: Remove cert signature from unsigned PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        When I send the API request to the endpoint "/api/v1/security/remove-cert-sign"
        And this operation is run 5 times in parallel
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"

    @remove-cert-sign @positive
    Scenario: Remove cert signature from multi-page unsigned PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 5 pages
        When I send the API request to the endpoint "/api/v1/security/remove-cert-sign"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0


    @validate-signature @positive
    Scenario: validate-signature reports no signatures on an unsigned PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 3 pages
        When I send the API request to the endpoint "/api/v1/security/validate-signature"
        And this operation is run 5 times in parallel
        Then the response status code should be 200
        And the response JSON should be a list


    @redact-execute @positive
    Scenario: redact-execute removes the targeted text
        Given I generate a PDF file as "fileInput"
        And the pdf contains 3 pages
        And the pdf pages all contain the text "Hello world"
        And the request data includes
            | parameter  | value |
            | textValues | Hello |
        When I send the API request to the endpoint "/api/v1/security/redact-execute"
        And this operation is run 5 times in parallel
        Then the response status code should be 200
        And the response content type should be "application/pdf"


    @redact-execute @negative
    Scenario: redact-execute without any targets returns 400
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        When I send the API request to the endpoint "/api/v1/security/redact-execute"
        Then the response status code should be 400

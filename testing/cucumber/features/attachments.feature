@misc
Feature: Attachments API Validation

    @add-attachments @positive
    Scenario: Add a single attachment to PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages with random text
        And I also generate a PDF file as "attachments"
        When I send the API request to the endpoint "/api/v1/misc/add-attachments"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"

    @add-attachments @positive
    Scenario: Add multiple attachments to PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages with random text
        And I also generate a PDF file as "attachments"
        And I also generate a PDF file as "attachments"
        When I send the API request to the endpoint "/api/v1/misc/add-attachments"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"

    @list-attachments @positive
    Scenario: List attachments in PDF with embedded attachment
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        And the pdf has an attachment named "test_doc.txt"
        When I send the API request to the endpoint "/api/v1/misc/list-attachments"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response file should have size greater than 0

    @list-attachments @positive
    Scenario: List attachments in plain PDF returns empty list
        Given I generate a PDF file as "fileInput"
        And the pdf contains 1 pages
        When I send the API request to the endpoint "/api/v1/misc/list-attachments"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response file should have size greater than 0

    @extract-attachments @positive
    Scenario: Extract attachments from PDF with embedded attachment
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        And the pdf has an attachment named "report.txt"
        When I send the API request to the endpoint "/api/v1/misc/extract-attachments"
        Then the response status code should be 200
        And the response file should have size greater than 0

    @rename-attachment @positive
    Scenario: Rename attachment in PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        And the pdf has an attachment named "original.txt"
        And the request data includes
            | parameter      | value        |
            | attachmentName | original.txt |
            | newName        | renamed.txt  |
        When I send the API request to the endpoint "/api/v1/misc/rename-attachment"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"

    @delete-attachment @positive
    Scenario: Delete attachment from PDF
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        And the pdf has an attachment named "to_delete.txt"
        And the request data includes
            | parameter      | value          |
            | attachmentName | to_delete.txt  |
        When I send the API request to the endpoint "/api/v1/misc/delete-attachment"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have size greater than 0
        And the response file should have extension ".pdf"

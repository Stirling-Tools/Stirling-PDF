Feature: API Validation

  Scenario: Remove password 
    Given I generate a PDF file as "fileInput"
    And the pdf contains 3 pages
    And the pdf is encrypted with password "password123"
    And the request data includes
      | parameter | value       |
      | password  | password123 |
    When I send the API request to the endpoint "/api/v1/security/remove-password"
    Then the response content type should be "application/pdf"
    And the response file should have size greater than 0
    And the response PDF is not passworded
	And the response status code should be 200
	
  Scenario: Remove password wrong password
    Given I generate a PDF file as "fileInput"
    And the pdf contains 3 pages
    And the pdf is encrypted with password "password123"
    And the request data includes
      | parameter | value       |
      | password  | wrongPassword |
    When I send the API request to the endpoint "/api/v1/security/remove-password"
    Then the response status code should be 500
    And the response should contain error message "Internal Server Error"

  Scenario: Get info
    Given I generate a PDF file as "fileInput"
    When I send the API request to the endpoint "/api/v1/security/get-info-on-pdf"
    Then the response content type should be "application/json"
    And the response file should have size greater than 100
	And the response status code should be 200

  Scenario: Add password
    Given I generate a PDF file as "fileInput"
    And the pdf contains 3 pages
    And the request data includes
      | parameter | value       |
      | password  | password123 |
    When I send the API request to the endpoint "/api/v1/security/add-password"
    Then the response content type should be "application/pdf"
    And the response file should have size greater than 100
    And the response PDF is passworded
	And the response status code should be 200
	
  Scenario: Add password with other params 
    Given I generate a PDF file as "fileInput"
    And the pdf contains 3 pages
    And the request data includes
      | parameter      | value       |
      | ownerPassword  | ownerPass   |
      | password       | password123 |
      | keyLength      | 256         |
      | canPrint       | true        |
      | canModify      | false       |
    When I send the API request to the endpoint "/api/v1/security/add-password"
    Then the response content type should be "application/pdf"
    And the response file should have size greater than 100
    And the response PDF is passworded
	And the response status code should be 200
	
	
  Scenario: Add watermark
    Given I generate a PDF file as "fileInput"
    And the pdf contains 3 pages
    And the request data includes
      | parameter     | value            |
      | watermarkType | text             |
      | watermarkText | Sample Watermark |
      | fontSize      | 30               |
      | rotation      | 45               |
      | opacity       | 0.5              |
      | widthSpacer   | 50               |
      | heightSpacer  | 50               |
    When I send the API request to the endpoint "/api/v1/security/add-watermark"
    Then the response content type should be "application/pdf"
    And the response file should have size greater than 100
	And the response status code should be 200
	


  Scenario: Repair PDF
    Given I generate a PDF file as "fileInput"
    When I send the API request to the endpoint "/api/v1/misc/repair"
    Then the response content type should be "application/pdf"
    And the response file should have size greater than 0
	And the response status code should be 200
	


  Scenario: Remove blank pages
    Given I generate a PDF file as "fileInput"
	And the pdf contains 3 blank pages
    And the request data includes
      | parameter    | value       |
      | threshold    | 90          |
      | whitePercent | 99.9        |
    When I send the API request to the endpoint "/api/v1/misc/remove-blanks"
    Then the response content type should be "application/pdf"
    And the response file should have size greater than 0
    And the response PDF should contain 0 pages
	And the response status code should be 200
	
  @ocr
  Scenario: Process PDF with OCR
    Given I generate a PDF file as "fileInput"
    And the request data includes
      | parameter        | value       |
      | languages        | eng         |
      | sidecar          | false        |
      | deskew           | true        |
      | clean            | true        |
      | cleanFinal       | true        |
      | ocrType          | Normal      |
      | ocrRenderType    | hocr        |
      | removeImagesAfter| false       |
    When I send the API request to the endpoint "/api/v1/misc/ocr-pdf"
    Then the response content type should be "application/pdf"
    And the response file should have size greater than 0
	And the response status code should be 200

  @ocr
  Scenario: Process PDF with text and OCR with type normal 
    Given I generate a PDF file as "fileInput"
    And the pdf contains 3 pages with random text
    And the request data includes
      | parameter        | value       |
      | languages        | eng         |
      | sidecar          | false        |
      | deskew           | true        |
      | clean            | true        |
      | cleanFinal       | true        |
      | ocrType          | Normal      |
      | ocrRenderType    | hocr        |
      | removeImagesAfter| false       |
    When I send the API request to the endpoint "/api/v1/misc/ocr-pdf"
	Then the response status code should be 500
	
  @ocr
  Scenario: Process PDF with OCR
    Given I generate a PDF file as "fileInput"
    And the request data includes
      | parameter        | value       |
      | languages        | eng         |
      | sidecar          | false        |
      | deskew           | true        |
      | clean            | true        |
      | cleanFinal       | true        |
      | ocrType          | Force      |
      | ocrRenderType    | hocr        |
      | removeImagesAfter| false       |
    When I send the API request to the endpoint "/api/v1/misc/ocr-pdf"
    Then the response content type should be "application/pdf"
    And the response file should have size greater than 0
	And the response status code should be 200
	
  @ocr
  Scenario: Process PDF with OCR with sidecar
    Given I generate a PDF file as "fileInput"
    And the request data includes
      | parameter        | value       |
      | languages        | eng         |
      | sidecar          | true        |
      | deskew           | true        |
      | clean            | true        |
      | cleanFinal       | true        |
      | ocrType          | Force      |
      | ocrRenderType    | hocr        |
      | removeImagesAfter| false       |
    When I send the API request to the endpoint "/api/v1/misc/ocr-pdf"
    Then the response content type should be "application/octet-stream"
	And the response file should have extension ".zip"
    And the response file should have size greater than 0
	And the response status code should be 200

	
  Scenario: Flatten PDF
    Given I generate a PDF file as "fileInput"
    And the request data includes
      | parameter         | value   |
      | flattenOnlyForms  | false    |
    When I send the API request to the endpoint "/api/v1/misc/flatten"
    Then the response content type should be "application/pdf"
    And the response file should have size greater than 0
	And the response status code should be 200
	
  Scenario: Update metadata
    Given I generate a PDF file as "fileInput"
    And the request data includes
      | parameter        | value             |
      | author           | John Doe          |
      | title            | Sample Title      |
      | subject          | Sample Subject    |
      | keywords         | sample, test      |
      | producer         | Test Producer     |
    When I send the API request to the endpoint "/api/v1/misc/update-metadata"
    Then the response content type should be "application/pdf"
    And the response file should have size greater than 0
    And the response PDF metadata should include "Author" as "John Doe"
	And the response PDF metadata should include "Keywords" as "sample, test"
	And the response PDF metadata should include "Subject" as "Sample Subject"
	And the response PDF metadata should include "Title" as "Sample Title"
	And the response status code should be 200

  @libre
  Scenario: Convert PDF to DOCX
    Given I generate a PDF file as "fileInput"
    And the pdf contains 3 pages with random text
	And the request data includes
      | parameter        | value      |
      | outputFormat     | docx       |
    When I send the API request to the endpoint "/api/v1/convert/pdf/word"
	Then the response status code should be 200
    And the response file should have size greater than 100
    And the response file should have extension ".docx"
#    And the response DOCX should contain 3 pages

  @libre
  Scenario: Convert PDF to ODT
    Given I generate a PDF file as "fileInput"
    And the pdf contains 3 pages with random text
	And the request data includes
      | parameter        | value     |
      | outputFormat     | odt       |
    When I send the API request to the endpoint "/api/v1/convert/pdf/word"
	Then the response status code should be 200
    And the response file should have size greater than 100
    And the response file should have extension ".odt"
#   And the response ODT should contain 3 pages

  @libre
  Scenario: Convert PDF to DOC
    Given I generate a PDF file as "fileInput"
    And the pdf contains 3 pages with random text
	And the request data includes
      | parameter        | value     |
      | outputFormat     | doc       |
    When I send the API request to the endpoint "/api/v1/convert/pdf/word"
	Then the response status code should be 200
    And the response file should have extension ".doc"
    And the response file should have size greater than 100
#    And the response DOC should contain 3 pages
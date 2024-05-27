Feature: API Validation


  @libre @positive
  Scenario: Repair PDF
    Given I generate a PDF file as "fileInput"
    When I send the API request to the endpoint "/api/v1/misc/repair"
    Then the response content type should be "application/pdf"
    And the response file should have size greater than 0
	And the response status code should be 200
	

  @ocr @positive
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

  @ocr @positive
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
	
  @ocr @positive
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
	
  @ocr @positive
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


  @libre @positive
  Scenario Outline: Convert PDF to various word formats
  Given I generate a PDF file as "fileInput"
  And the pdf contains 3 pages with random text
  And the request data includes
    | parameter    | value       |
    | outputFormat | <format>    |
  When I send the API request to the endpoint "/api/v1/convert/pdf/word"
  Then the response status code should be 200
  And the response file should have size greater than 100
  And the response file should have extension "<extension>"

  Examples:
    | format | extension |
    | docx   | .docx     |
    | odt    | .odt      |
    | doc    | .doc      |



  @compress @ghostscript @positive
  Scenario: Compress
    Given I generate a PDF file as "fileInput"
    And the pdf contains 3 pages with random text
	And the request data includes
      | parameter        | value     |
      | optimizeLevel     | 4       |
    When I send the API request to the endpoint "/api/v1/misc/compress-pdf"
	Then the response status code should be 200
    And the response file should have extension ".pdf"
    And the response file should have size greater than 100
	
  @compress @ghostscript @positive
  Scenario: Compress
    Given I generate a PDF file as "fileInput"
    And the pdf contains 3 pages with random text
	And the request data includes
      | parameter        | value     |
      | optimizeLevel     | 1       |
	  | expectedOutputSize | 5KB |
    When I send the API request to the endpoint "/api/v1/misc/compress-pdf"
	Then the response status code should be 200
    And the response file should have extension ".pdf"
    And the response file should have size greater than 100
	
	
  @compress @ghostscript @positive
  Scenario: Compress
    Given I generate a PDF file as "fileInput"
    And the pdf contains 3 pages with random text
	And the request data includes
      | parameter        | value     |
      | optimizeLevel     | 1       |
	  | expectedOutputSize | 5KB |
    When I send the API request to the endpoint "/api/v1/misc/compress-pdf"
	Then the response status code should be 200
    And the response file should have extension ".pdf"
    And the response file should have size greater than 100	
	
  @libre @positive
  Scenario Outline: Convert PDF to various types
  Given I generate a PDF file as "fileInput"
  And the pdf contains 3 pages with random text
  And the request data includes
    | parameter    | value       |
    | outputFormat | <format>    |
  When I send the API request to the endpoint "/api/v1/convert/pdf/<type>"
  Then the response status code should be 200
  And the response file should have size greater than 100
  And the response file should have extension "<extension>"

  Examples:
   | type | format | extension |
   |  text   | rtf   | .rtf     |
   |  text   | txt    | .txt      |
   |  presentation   | ppt   | .ppt     |
   |  presentation   | pptx    | .pptx      |
   |  presentation   | odp   | .odp     |
   |  html   | html    | .zip      |

	
  @libre @positive @topdf
  Scenario Outline: Convert PDF to various types
  Given I use an example file at "exampleFiles/example<extension>" as parameter "fileInput"
  When I send the API request to the endpoint "/api/v1/convert/file/pdf"
  Then the response status code should be 200
  And the response file should have size greater than 100
  And the response file should have extension ".pdf"

  Examples:
   | extension | 
   |   .docx  |
   |  .odp   |
   |  .odt   | 
   |  .pptx   | 
   |  .rtf   | 


		

@general
Feature: API Validation

	
  @split-pdf-by-sections @positive
  Scenario Outline: split-pdf-by-sections with different parameters
    Given I generate a PDF file as "fileInput"
    And the pdf contains 2 pages
    And the request data includes
      | parameter           | value       |
      | horizontalDivisions | <horizontalDivisions> |
      | verticalDivisions   | <verticalDivisions> |
      | merge               | true |
    When I send the API request to the endpoint "/api/v1/general/split-pdf-by-sections"
    Then the response content type should be "application/pdf"
    And the response file should have size greater than 200
    And the response status code should be 200
    And the response PDF should contain <page_count> pages

  Examples:
    | horizontalDivisions | verticalDivisions | page_count |
    | 0                   | 1                 | 4          |
    | 1                   | 1                 | 8          |
    | 1                   | 2                 | 12          |
    | 2                   | 2                 | 18          |

  @split-pdf-by-sections @positive
  Scenario Outline: split-pdf-by-sections with different parameters
    Given I generate a PDF file as "fileInput"
    And the pdf contains 2 pages
    And the request data includes
      | parameter           | value       |
      | horizontalDivisions | <horizontalDivisions> |
      | verticalDivisions   | <verticalDivisions> |
      | merge               | true |
    When I send the API request to the endpoint "/api/v1/general/split-pdf-by-sections"
    Then the response content type should be "application/pdf"
    And the response file should have size greater than 200
    And the response status code should be 200
    And the response PDF should contain <page_count> pages

  Examples:
    | horizontalDivisions | verticalDivisions | page_count |
    | 0                   | 1                 | 4          |
    | 1                   | 1                 | 8          |
    | 1                   | 2                 | 12          |
    | 2                   | 2                 | 18          |



  @split-pdf-by-pages @positive
  Scenario Outline: split-pdf-by-pages with different parameters
  Given I generate a PDF file as "fileInput"
  And the pdf contains 20 pages
  And the request data includes
    | parameter     | value         |
    | fileInput     | fileInput     |
    | pageNumbers   | <pageNumbers> |
  When I send the API request to the endpoint "/api/v1/general/split-pages"
  Then the response content type should be "application/octet-stream"
  And the response status code should be 200
  And the response file should have size greater than 200
  And the response ZIP should contain <file_count> files

  Examples:
    | pageNumbers | file_count |
    | 1,3,5-9     | 8          |
    | all         | 20         |
    | 2n+1        | 11         |
    | 3n          | 7          |



  @split-pdf-by-size-or-count @positive
  Scenario Outline: split-pdf-by-size-or-count with different parameters
  Given I generate a PDF file as "fileInput"
  And the pdf contains 20 pages
  And the request data includes
    | parameter  | value          |
    | fileInput  | fileInput      |
    | splitType  | <splitType>    |
    | splitValue | <splitValue>   |
  When I send the API request to the endpoint "/api/v1/general/split-by-size-or-count"
  Then the response content type should be "application/octet-stream"
  And the response status code should be 200
  And the response file should have size greater than 200
  And the response ZIP file should contain <doc_count> documents each having <pages_per_doc> pages

  Examples:
    | splitType | splitValue | doc_count | pages_per_doc |
    | 1         | 5          | 4         | 5             |
    | 2         | 2          | 2         | 10            |
    | 2         | 4          | 4         | 5             |
    | 1         | 10         | 2         | 10            |


  @extract-images
  Scenario Outline: Extract Image Scans duplicates
    Given I use an example file at "exampleFiles/images.pdf" as parameter "fileInput"
    And the request data includes
      | parameter        | value       |
      | format        | <format>         |
    When I send the API request to the endpoint "/api/v1/misc/extract-images"
    Then the response content type should be "application/octet-stream"
	And the response file should have extension ".zip"
	And the response ZIP should contain 2 files
    And the response file should have size greater than 0
	And the response status code should be 200
	
	Examples:
    | format | 
    | png        | 
    | gif         |
    | jpeg        | 

@nightly @proprietary @form-detection
Feature: Auto Form Detection API Validation

    # Needs the ONNX runtime and a baked-in model, which only Dockerfile.fat has.
    # behave.ini excludes @nightly; the nightly job opts back in against that image.

    @model-status @positive
    Scenario: Model status reports a ready model and an available engine
        When I send a GET request to "/api/v1/form/form-detection-model/status"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the JSON value of "status" should be "ready"

    @detect @positive
    Scenario: Detect returns field boxes for a printed form
        Given I generate a PDF file as "file"
        And the pdf looks like a printed form
        When I send the API request to the endpoint "/api/v1/form/form-detection/detect"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And the response should contain at least 5 detected fields
        And every detected field should be a usable field box

    @detect @positive
    Scenario: Detect finds fields on every page of a multi-page form
        Given I generate a PDF file as "file"
        And the pdf looks like a printed form on 3 pages
        When I send the API request to the endpoint "/api/v1/form/form-detection/detect"
        Then the response status code should be 200
        And the response should contain at least 15 detected fields
        And every detected field should be a usable field box

    @detect @positive
    Scenario: A stricter confidence threshold is honoured
        Given I generate a PDF file as "file"
        And the pdf looks like a printed form
        And the request data includes
            | parameter     | value |
            | confThreshold | 0.7   |
        When I send the API request to the endpoint "/api/v1/form/form-detection/detect"
        Then the response status code should be 200
        And every detected field should have confidence of at least 0.7

    @detect @positive
    Scenario: applyToPdf returns a fillable PDF instead of JSON
        Given I generate a PDF file as "file"
        And the pdf looks like a printed form
        And the request data includes
            | parameter  | value |
            | applyToPdf | true  |
        When I send the API request to the endpoint "/api/v1/form/form-detection/detect"
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response file should have extension ".pdf"
        And the response PDF should contain 1 pages
        And the response PDF should contain at least 5 form fields

    @detect @positive
    Scenario: A page with nothing form-like yields an empty detection list
        Given I generate a PDF file as "file"
        And the pdf contains 1 blank pages
        When I send the API request to the endpoint "/api/v1/form/form-detection/detect"
        Then the response status code should be 200
        And the response content type should be "application/json"
        And every detected field should be a usable field box

    @detect @negative
    Scenario: Detect rejects a non-PDF upload
        Given I generate a PNG image file as "file"
        When I send the API request to the endpoint "/api/v1/form/form-detection/detect"
        Then the response status code should be 400
        And the JSON value of "reason" should be "INVALID_PDF"

    @detect @negative
    Scenario: An out-of-range confidence threshold is clamped rather than failing
        Given I generate a PDF file as "file"
        And the pdf looks like a printed form
        And the request data includes
            | parameter     | value |
            | confThreshold | 9.5   |
        When I send the API request to the endpoint "/api/v1/form/form-detection/detect"
        Then the response status code should be 200
        And every detected field should be a usable field box

@jobs @noparallel
Feature: Asynchronous job API

    # Any tool endpoint accepts ?async=true and returns a jobId instead of the
    # file. These scenarios cover the whole lifecycle: submit, poll, fetch the
    # result, list and download the produced files, then delete the job.
    #
    # @noparallel because every step after the submit depends on one specific
    # jobId, so repeating the submit concurrently would leave orphan jobs.

    @positive
    Scenario: An async job runs to completion and returns its result
        Given I generate a PDF file as "fileInput"
        And the pdf contains 3 pages
        And the request data includes
            | parameter | value |
            | angle     | 90    |
        When I send the API request to the endpoint "/api/v1/general/rotate-pdf?async=true"
        Then the response status code should be 200
        And the response JSON field "async" should be true

        When I store the job id from the response
        And I wait for the job to complete
        Then the job should be reported complete

        When I request the job result
        Then the response status code should be 200
        And the response content type should be "application/pdf"
        And the response PDF should contain 3 pages


    @positive
    Scenario: Async job results are listed and downloadable as individual files
        Given I generate a PDF file as "fileInput"
        And the pdf contains 4 pages
        And the request data includes
            | parameter   | value |
            | pageNumbers | all   |
        When I send the API request to the endpoint "/api/v1/general/split-pages?async=true"
        Then the response status code should be 200

        When I store the job id from the response
        And I wait for the job to complete
        And I request the job result file list
        Then the response status code should be 200
        And the job result file list should contain at least 4 file(s)

        When I request the first job result file metadata
        Then the response status code should be 200
        And the response JSON field "fileName" should not be empty

        When I download the first job result file
        Then the response status code should be 200
        And the response file should have size greater than 100


    @negative
    Scenario: Cancelling an already-finished job is rejected
        Given I generate a PDF file as "fileInput"
        And the pdf contains 2 pages
        And the request data includes
            | parameter | value |
            | angle     | 180   |
        When I send the API request to the endpoint "/api/v1/general/rotate-pdf?async=true"
        And I store the job id from the response
        And I wait for the job to complete
        And I cancel the job
        Then the response status code should be 400


    @negative
    Scenario: Polling a job id the caller does not own is forbidden
        When I send a GET request to "/api/v1/general/job/does-not-exist-1234"
        Then the response status code should be 403


    @negative
    Scenario: Downloading an unknown file id is rejected
        When I send a GET request to "/api/v1/general/files/does-not-exist-1234"
        Then the response status code should be 404

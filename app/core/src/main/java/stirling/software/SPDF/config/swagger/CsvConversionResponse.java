package stirling.software.SPDF.config.swagger;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;

/**
 * API response annotation for PDF to CSV conversions. Use for endpoints that convert PDF tables to
 * CSV format.
 */
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
@ApiResponses(
        value = {
            @ApiResponse(
                    responseCode = "200",
                    description = "PDF tables extracted successfully to CSV format",
                    content = {
                        @Content(
                                mediaType = "text/csv",
                                schema =
                                        @Schema(
                                                type = "string",
                                                format = "binary",
                                                description =
                                                        "CSV file containing extracted table data")),
                        @Content(
                                mediaType = "application/zip",
                                schema =
                                        @Schema(
                                                type = "string",
                                                format = "binary",
                                                description =
                                                        "ZIP archive containing multiple CSV files when multiple tables are extracted"))
                    }),
            @ApiResponse(
                    responseCode = "400",
                    description = "Invalid PDF file or no tables found for extraction",
                    content =
                            @Content(
                                    mediaType = "application/json",
                                    schema = @Schema(implementation = ErrorResponse.class))),
            @ApiResponse(responseCode = "204", description = "No tables found in the PDF"),
            @ApiResponse(
                    responseCode = "500",
                    description = "Internal server error during table extraction",
                    content =
                            @Content(
                                    mediaType = "application/json",
                                    schema = @Schema(implementation = ErrorResponse.class)))
        })
public @interface CsvConversionResponse {}

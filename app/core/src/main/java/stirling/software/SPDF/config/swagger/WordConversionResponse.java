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
 * API response annotation for PDF to Word document conversions. Use for endpoints that convert PDF
 * to DOCX/DOC formats.
 */
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
@ApiResponses(
        value = {
            @ApiResponse(
                    responseCode = "200",
                    description = "PDF converted successfully to Word document",
                    content = {
                        @Content(
                                mediaType =
                                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                                schema =
                                        @Schema(
                                                type = "string",
                                                format = "binary",
                                                description = "Microsoft Word document (DOCX)")),
                        @Content(
                                mediaType = "application/msword",
                                schema =
                                        @Schema(
                                                type = "string",
                                                format = "binary",
                                                description = "Microsoft Word document (DOC)"))
                    }),
            @ApiResponse(
                    responseCode = "400",
                    description =
                            "Bad request - Invalid input parameters, unsupported format, or corrupted PDF",
                    content =
                            @Content(
                                    mediaType = "application/json",
                                    schema = @Schema(implementation = ErrorResponse.class))),
            @ApiResponse(
                    responseCode = "413",
                    description = "Payload too large - File exceeds maximum allowed size",
                    content =
                            @Content(
                                    mediaType = "application/json",
                                    schema = @Schema(implementation = ErrorResponse.class))),
            @ApiResponse(
                    responseCode = "422",
                    description =
                            "Unprocessable entity - PDF is valid but cannot be converted to Word format",
                    content =
                            @Content(
                                    mediaType = "application/json",
                                    schema = @Schema(implementation = ErrorResponse.class))),
            @ApiResponse(
                    responseCode = "500",
                    description = "Internal server error - Unexpected error during Word conversion",
                    content =
                            @Content(
                                    mediaType = "application/json",
                                    schema = @Schema(implementation = ErrorResponse.class)))
        })
public @interface WordConversionResponse {}

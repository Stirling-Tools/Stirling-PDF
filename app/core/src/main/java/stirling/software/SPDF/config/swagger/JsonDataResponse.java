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
 * API response annotation for operations that return JSON data or analysis results. Use for
 * analysis operations, metadata extraction, info operations, etc.
 */
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
@ApiResponses(
        value = {
            @ApiResponse(
                    responseCode = "200",
                    description = "Analysis or data extraction completed successfully",
                    content =
                            @Content(
                                    mediaType = "application/json",
                                    schema =
                                            @Schema(
                                                    type = "object",
                                                    description =
                                                            "JSON object containing the requested data or analysis results")))
        })
public @interface JsonDataResponse {}

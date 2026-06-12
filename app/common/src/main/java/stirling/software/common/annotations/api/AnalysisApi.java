package stirling.software.common.annotations.api;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;


import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Combined annotation for Analysis API controllers.
 * Includes @RestController, @RequestMapping("/api/v1/analysis"), and OpenAPI @Tag.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
// MIGRATION (Spring->JAX-RS): controllers using this annotation must declare @jakarta.ws.rs.Path("/api/v1/analysis").
// JAX-RS does not honour @Path via meta-annotations, so the path is not inherited from here.
@Tag(
        name = "Analysis",
        description =
                """
                Read-only inspection of PDFs: page count, page sizes, fonts, form fields, annotations, document properties, and security details.
                Use these endpoints to understand what's inside a document without changing it.

                Typical uses:
                • Get page counts and dimensions for layout or print rules
                • List fonts and annotations to spot compatibility issues
                • Inspect form fields before deciding how to fill or modify them
                • Pull metadata and security settings for audits or reports
                """)
public @interface AnalysisApi {}

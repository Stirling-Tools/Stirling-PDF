package stirling.software.common.annotations.api;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Combined annotation for Filter API controllers.
 * Includes @RestController, @RequestMapping("/api/v1/filter"), and OpenAPI @Tag.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@RestController
@RequestMapping("/api/v1/filter")
@Tag(
        name = "Filter",
        description =
                """
                Check basic properties of PDFs before you process them: page count, file size, page size/rotation, and whether they contain text or images.
                Use these endpoints as a "pre-check" step to decide what to do with a file next.

                Typical uses:
                • Reject files that are too big or too small
                • Detect image-only PDFs that should go through OCR
                • Ensure a document has enough pages before it enters a workflow
                • Check orientation of pages before printing or merging
                """)
public @interface FilterApi {}

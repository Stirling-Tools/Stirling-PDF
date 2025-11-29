package stirling.software.common.annotations.api;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Combined annotation for General PDF processing API controllers.
 * Includes @RestController, @RequestMapping("/api/v1/general"), and OpenAPI @Tag.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@RestController
@RequestMapping("/api/v1/general")
@Tag(
        name = "General",
        description =
                """
                Page-level PDF editing: split, merge, rotate, crop, rearrange, and scale pages.
                These endpoints handle most daily "I opened a PDF editor just to…" type tasks.

                Typical uses:
                • Split a large PDF into smaller files (by pages, chapters, or size)
                • Merge several PDFs into one report or pack
                • Rotate or reorder pages before sending or archiving
                • Turn a multi-page document into one long scrolling page
                """)
public @interface GeneralApi {}

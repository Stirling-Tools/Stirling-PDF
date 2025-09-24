package stirling.software.common.annotations.api;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Combined annotation for Miscellaneous API controllers.
 * Includes @RestController, @RequestMapping("/api/v1/misc"), and OpenAPI @Tag.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@RestController
@RequestMapping("/api/v1/misc")
@Tag(
        name = "Misc",
        description =
                """
                Specialized utilities and supplementary tools for enhanced document processing workflows.

                This endpoint group provides utility operations that support core document processing
                tasks and address specific workflow needs in real-world scenarios.

                Common use cases:
                • Document optimization for bandwidth-limited environments and storage cost management
                • Document repair, content extraction, and validation for quality assurance
                • Accessibility improvement and custom processing for specialized needs

                Business applications:
                • Web publishing optimization, email attachment management, and archive efficiency
                • Mobile compatibility, print production, and legacy document recovery

                Operational scenarios:
                • Batch processing, quality control, and performance optimization
                • Troubleshooting and recovery of problematic documents

                Target users: System administrators, document specialists, and organizations requiring
                specialized document processing and optimization tools.
                """)
public @interface MiscApi {}

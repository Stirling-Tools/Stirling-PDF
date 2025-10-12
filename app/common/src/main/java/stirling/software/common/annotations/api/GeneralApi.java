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
                Core PDF processing operations for fundamental document manipulation workflows.

                This endpoint group provides essential PDF functionality that forms the foundation
                of most document processing workflows across various industries.

                Common use cases:
                • Document preparation for archival systems and content organization
                • File preparation for distribution, accessibility compliance, and batch processing
                • Document consolidation for reporting and legal compliance workflows

                Typical applications:
                • Content management, publishing workflows, and educational content distribution
                • Business process automation and archive management

                Target users: Content managers, document processors, and organizations requiring
                reliable foundational PDF manipulation capabilities.
                """)
public @interface GeneralApi {}

package stirling.software.common.annotations.api;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Combined annotation for Team Management API controllers.
 * Includes @RestController, @RequestMapping("/api/v1/team"), and OpenAPI @Tag.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@RestController
@RequestMapping("/api/v1/team")
@Tag(
        name = "Team",
        description =
                """
                Team management and collaboration services for organized document processing workflows.

                This endpoint group enables organizations to structure collaborative document processing
                activities through team-based organization and resource management.

                Common use cases:
                • Department-based processing, project collaboration, and cross-functional coordination
                • Client-specific team isolation, temporary project teams, and training coordination
                • Compliance team coordination for regulatory processing

                Business applications:
                • Matrix organization support, client service delivery, and cost center allocation
                • Scalable collaboration, knowledge management, and team-based quality assurance

                Operational scenarios:
                • Large-scale processing coordination and temporary team formation
                • M&A integration, remote collaboration, and knowledge transfer management

                Target users: Team leaders, project managers, and organizations requiring structured
                collaborative environments for document processing activities.
                """)
public @interface TeamApi {}

package stirling.software.common.annotations.api;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Combined annotation for Database Management API controllers.
 * Includes @RestController, @RequestMapping("/api/v1/database"), and OpenAPI @Tag.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@RestController
@RequestMapping("/api/v1/database")
@Tag(
        name = "Database",
        description =
                """
                Database operations for data protection and business continuity management.

                This endpoint group provides essential database operations for organizations requiring
                reliable data protection and recovery capabilities.

                Common use cases:
                • Regular data backup, disaster recovery, and business continuity planning
                • System migration, compliance management, and development environment support
                • Operational troubleshooting and scheduled maintenance operations

                Business applications:
                • Risk management, regulatory compliance, and operational resilience
                • Data governance, change management, and quality assurance support

                Operational scenarios:
                • Routine backup, emergency recovery, and system maintenance preparation
                • Data migration projects and performance monitoring

                Target users: Operations teams, system administrators, and organizations requiring
                reliable data protection and operational database management.
                """)
public @interface DatabaseApi {}

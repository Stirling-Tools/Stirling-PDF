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
 * Includes @RestController, @RequestMapping("/api/v1/admin/database"), and OpenAPI @Tag.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@RestController
@RequestMapping("/api/v1/admin/database")
@Tag(
        name = "Database Management",
        description =
                """
                Enterprise database administration for production data management and business continuity.

                This endpoint group provides database administration capabilities for organizations
                operating Stirling PDF in production environments.

                Common use cases:
                • Business continuity, disaster recovery, and regulatory compliance requirements
                • Performance optimization, data security, and system migration projects
                • Audit preparation, compliance reporting, and cost optimization

                Business applications:
                • Enterprise risk management, regulatory compliance, and SLA monitoring
                • Data retention policies, security incident response, and vendor oversight

                Operational scenarios:
                • Scheduled maintenance, emergency recovery, and capacity planning
                • Performance troubleshooting and multi-environment deployment coordination

                Target users: Database administrators, IT operations teams, and enterprise
                administrators responsible for production data management and system reliability.
                """)
public @interface DatabaseManagementApi {}

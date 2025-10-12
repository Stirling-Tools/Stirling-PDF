package stirling.software.common.annotations.api;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Combined annotation for Info API controllers.
 * Includes @RestController, @RequestMapping("/api/v1/info"), and OpenAPI @Tag.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@RestController
@RequestMapping("/api/v1/info")
@Tag(
        name = "Info",
        description =
                """
                System information and operational insights for monitoring and performance management.

                This endpoint group provides system information and operational metrics for organizations
                operating Stirling PDF in production environments.

                Common use cases:
                • System health monitoring, performance optimization, and capacity planning
                • Troubleshooting, compliance monitoring, and SLA reporting
                • Cost optimization, usage analysis, and security monitoring

                Business applications:
                • Operational cost management, business continuity monitoring, and vendor management
                • Compliance reporting, strategic planning, and customer service tracking

                Operational scenarios:
                • 24/7 monitoring, scheduled maintenance, and emergency response coordination
                • System upgrade planning and capacity scaling decisions

                Target users: Operations teams, system administrators, and management teams requiring
                operational insights and system performance visibility.
                """)
public @interface InfoApi {}

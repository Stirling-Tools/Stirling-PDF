package stirling.software.common.annotations.api;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Combined annotation for Invite management controllers.
 * Includes @RestController, @RequestMapping("/api/v1/invite"), and OpenAPI @Tag.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@RestController
@RequestMapping("/api/v1/invite")
@Tag(
        name = "Invite",
        description =
                """
                Invite-link generation and acceptance endpoints for onboarding new users.

                Provides the ability to issue invitation tokens, send optional email invites,
                validate and accept invite links, and manage pending invitations for teams.

                Typical use cases include:
                • Admin workflows for issuing time-limited invitations to external users
                • Self-service invite acceptance and team assignment
                • License limit enforcement when provisioning new accounts

                Target users: administrators and automation scripts orchestrating user onboarding.
                """)
public @interface InviteApi {}

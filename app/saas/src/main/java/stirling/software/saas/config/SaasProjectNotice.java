package stirling.software.saas.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * States which Supabase project this backend is actually talking to, and how much it may change.
 *
 * <p>The two non-prod profiles look identical from the outside and are not: {@code dev} follows a
 * SaaS PR's preview branch and has {@code ddl-auto=update}, {@code staging} is the shared v3
 * project with {@code ddl-auto=none}. Being on the wrong one is quiet until it isn't. Point at
 * staging while you believe you are on a PR branch and everything works until a migration the PR
 * added turns out to be missing, which surfaces as {@code relation ... does not exist} some
 * requests later. So the project ref and the schema policy both get stated at startup rather than
 * inferred.
 *
 * <p>This matters most when {@code task backend:dev:saas} has fallen back: with no {@code
 * SAAS_DEV_PROJECT_REF} set it runs the staging profile instead, and this line is the confirmation
 * of what you ended up with.
 *
 * <p>Logged on {@link ApplicationReadyEvent} so it lands at the end of the boot output where it can
 * be seen, rather than buried in bean initialisation.
 */
@Slf4j
@Component
@Profile({"dev", "staging"})
public class SaasProjectNotice {

    private final Environment environment;
    private final String projectRef;
    private final String ddlAuto;

    public SaasProjectNotice(
            Environment environment,
            @Value("${app.supabase.project-ref:unknown}") String projectRef,
            @Value("${spring.jpa.hibernate.ddl-auto:none}") String ddlAuto) {
        this.environment = environment;
        this.projectRef = projectRef;
        this.ddlAuto = ddlAuto;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void announceProject() {
        boolean staging = environment.matchesProfiles("staging");
        if (staging) {
            log.info(
                    """
                    SaaS staging profile: Supabase project {}, ddl-auto={}. This is the SHARED \
                    long-lived environment, so its data and schema are not yours alone. Testing an \
                    open SaaS PR? Use that PR's preview branch instead \
                    (SAAS_DEV_PROJECT_REF in app/.env.saas.local); staging will not have its \
                    migrations.\
                    """,
                    projectRef,
                    ddlAuto);
            return;
        }
        log.info(
                "SaaS dev profile: Supabase preview branch {}, ddl-auto={}. Disposable, so Hibernate"
                        + " is allowed to add the inherited tables the migrations do not create.",
                projectRef,
                ddlAuto);
    }
}

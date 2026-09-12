package stirling.software.saas.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/** Logs which Supabase project this backend is talking to, and its schema policy. */
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
                "SaaS dev profile: Supabase preview branch {}, ddl-auto={}. Disposable, so"
                        + " Hibernate is allowed to add the inherited tables the migrations do not"
                        + " create.",
                projectRef,
                ddlAuto);
    }
}

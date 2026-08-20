package stirling.software.saas.config;

import java.util.List;

import org.eclipse.microprofile.config.Config;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import io.quarkus.runtime.StartupEvent;
import io.smallrye.config.SmallRyeConfig;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;

import lombok.extern.slf4j.Slf4j;

/** Logs which Supabase project this backend is talking to, and its schema policy. */
@Slf4j
@ApplicationScoped
public class SaasProjectNotice {

    private final boolean dev;
    private final boolean staging;
    private final String projectRef;
    private final String ddlAuto;

    @Inject
    public SaasProjectNotice(
            Config config,
            @ConfigProperty(name = "app.supabase.project-ref", defaultValue = "unknown")
                    String projectRef,
            @ConfigProperty(name = "spring.jpa.hibernate.ddl-auto", defaultValue = "none")
                    String ddlAuto) {
        // Spring's Environment.getActiveProfiles() maps to SmallRye's profile list; replaces the
        // @Profile({"dev", "staging"}) gate, applied at the observer instead of the bean because
        // @IfBuildProfile takes a single profile.
        List<String> profiles = config.unwrap(SmallRyeConfig.class).getProfiles();
        this.dev = profiles.contains("dev");
        this.staging = profiles.contains("staging");
        this.projectRef = projectRef;
        this.ddlAuto = ddlAuto;
    }

    /** Quarkus' StartupEvent is the ApplicationReadyEvent equivalent. */
    void announceProject(@Observes StartupEvent event) {
        if (!dev && !staging) {
            return;
        }
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

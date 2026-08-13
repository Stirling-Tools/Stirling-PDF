package stirling.software.saas.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Says which Supabase project the {@code dev} profile actually ended up on.
 *
 * <p>The dev profile follows a SaaS PR's preview branch via {@code SAAS_DEV_PROJECT_REF}, and falls
 * back to staging when that is unset so a checkout with no PR in flight still boots. The fallback
 * is the reason this exists: running against staging while you believe you are on a PR branch looks
 * exactly like the PR working, right up until a migration the PR added is missing and you get
 * {@code relation ... does not exist}. Worth a loud line at startup rather than a silent surprise
 * several requests later.
 *
 * <p>Logged on {@link ApplicationReadyEvent} so it lands at the end of the boot output where it can
 * be seen, not buried in the middle of bean initialisation.
 */
@Slf4j
@Component
@Profile("dev")
public class DevProfileProjectNotice {

    private final String requestedRef;
    private final String resolvedRef;

    public DevProfileProjectNotice(
            @Value("${SAAS_DEV_PROJECT_REF:}") String requestedRef,
            @Value("${app.supabase.project-ref:}") String resolvedRef) {
        this.requestedRef = requestedRef;
        this.resolvedRef = resolvedRef;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void announceProject() {
        if (requestedRef != null && !requestedRef.isBlank()) {
            log.info(
                    "SaaS dev profile: using Supabase preview branch {} (SAAS_DEV_PROJECT_REF).",
                    resolvedRef);
            return;
        }
        log.warn(
                """
                SaaS dev profile: SAAS_DEV_PROJECT_REF is not set, so this is running against \
                STAGING ({}), not a PR preview branch.
                  - Fine if you meant staging; prefer PROFILES=staging to say so explicitly.
                  - NOT fine if you are testing a SaaS PR: staging will be missing that PR's \
                migrations, which shows up as "relation ... does not exist".
                  - To follow a PR, set SAAS_DEV_PROJECT_REF (plus that branch's \
                SAAS_DEV_DB_PASSWORD and SAAS_DEV_PUBLISHABLE_KEY) in app/.env.saas.local. The ref \
                is on the SaaS PR's "Supabase Preview" check.\
                """,
                resolvedRef);
    }
}

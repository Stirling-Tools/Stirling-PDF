package stirling.software.proprietary.service;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Component
@Profile("!saas")
@RequiredArgsConstructor
@Slf4j
public class OrgOwnerBootstrap {
    private final OrgOwnerService owners;

    @EventListener(DatabaseRestored.class)
    public void restored() {
        owners.safeReconcile();
    }

    @EventListener(ApplicationReadyEvent.class)
    @Order(3)
    public void initialize() {
        try {
            owners.reconcile(System.getenv("STIRLING_ORG_OWNER_BREAK_GLASS"));
        } catch (RuntimeException e) {
            log.warn("Organization ownership could not be initialized", e);
        }
    }
}

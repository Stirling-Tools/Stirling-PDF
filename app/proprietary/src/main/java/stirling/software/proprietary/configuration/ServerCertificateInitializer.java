package stirling.software.proprietary.configuration;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.ServerCertificateServiceInterface;

@Component
@RequiredArgsConstructor
@Slf4j
public class ServerCertificateInitializer {

    private final ServerCertificateServiceInterface serverCertificateService;

    @EventListener(ApplicationReadyEvent.class)
    public void initializeServerCertificate() {
        try {
            serverCertificateService.initializeServerCertificate();
        } catch (Exception e) {
            log.error("Failed to initialize server certificate", e);
        }
    }
}

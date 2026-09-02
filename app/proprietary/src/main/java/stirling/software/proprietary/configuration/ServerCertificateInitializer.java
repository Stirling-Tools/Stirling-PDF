package stirling.software.proprietary.configuration;

import io.quarkus.runtime.StartupEvent;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.ServerCertificateServiceInterface;

@ApplicationScoped
@RequiredArgsConstructor
@Slf4j
public class ServerCertificateInitializer {

    private final ServerCertificateServiceInterface serverCertificateService;

    public void initializeServerCertificate(@Observes StartupEvent event) {
        try {
            serverCertificateService.initializeServerCertificate();
        } catch (Exception e) {
            log.error("Failed to initialize server certificate", e);
        }
    }
}

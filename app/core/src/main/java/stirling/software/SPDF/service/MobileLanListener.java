package stirling.software.SPDF.service;

import java.net.InetAddress;
import java.util.Optional;

import org.eclipse.jetty.server.Connector;
import org.eclipse.jetty.server.HttpConfiguration;
import org.eclipse.jetty.server.HttpConnectionFactory;
import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.server.ServerConnector;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.jetty.JettyServerCustomizer;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import jakarta.annotation.PreDestroy;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.MobileScannerService;
import stirling.software.common.util.GeneralUtils;

@Component
@Slf4j
public class MobileLanListener implements JettyServerCustomizer {

    private final MobileScannerService mobileScannerService;
    private final boolean enabled;
    private volatile Server server;
    private ServerConnector connector;

    public MobileLanListener(
            MobileScannerService mobileScannerService,
            @Value("${server.address:}") String serverAddress) {
        this.mobileScannerService = mobileScannerService;
        this.enabled =
                Boolean.getBoolean("STIRLING_PDF_TAURI_MODE") && isLoopbackAddress(serverAddress);
    }

    @Override
    public void customize(Server server) {
        this.server = server;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public synchronized Optional<String> open() {
        if (!enabled || server == null) {
            return Optional.empty();
        }
        String ip = GeneralUtils.getLocalNetworkIp();
        if (ip == null) {
            log.warn("No local network address found; phones cannot reach this computer");
            return Optional.empty();
        }
        if (connector != null && !ip.equals(connector.getHost())) {
            close();
        }
        if (connector == null) {
            ServerConnector opened =
                    new ServerConnector(server, new HttpConnectionFactory(httpConfiguration()));
            opened.setHost(ip);
            opened.setPort(0);
            server.addConnector(opened);
            try {
                if (!opened.isStarted()) {
                    opened.start();
                }
            } catch (Exception e) {
                server.removeConnector(opened);
                log.warn("Could not open the phone listener on {}", ip, e);
                return Optional.empty();
            }
            connector = opened;
            log.info("Phone listener open on {}:{}", ip, opened.getLocalPort());
        }
        return Optional.of("http://" + ip + ":" + connector.getLocalPort());
    }

    @Scheduled(fixedDelay = 30_000)
    public synchronized void closeIfIdle() {
        if (connector != null && !mobileScannerService.hasLiveSessions()) {
            close();
        }
    }

    @PreDestroy
    public synchronized void close() {
        if (connector == null) {
            return;
        }
        ServerConnector closing = connector;
        connector = null;
        try {
            closing.stop();
        } catch (Exception e) {
            log.warn("Phone listener did not stop cleanly", e);
        }
        server.removeConnector(closing);
        log.info("Phone listener closed");
    }

    private HttpConfiguration httpConfiguration() {
        for (Connector existing : server.getConnectors()) {
            HttpConnectionFactory factory =
                    existing.getConnectionFactory(HttpConnectionFactory.class);
            if (factory != null) {
                return new HttpConfiguration(factory.getHttpConfiguration());
            }
        }
        return new HttpConfiguration();
    }

    static boolean isLoopbackAddress(String address) {
        if (address == null || address.isBlank()) {
            return false;
        }
        try {
            return InetAddress.getByName(address.trim()).isLoopbackAddress();
        } catch (Exception e) {
            return false;
        }
    }
}

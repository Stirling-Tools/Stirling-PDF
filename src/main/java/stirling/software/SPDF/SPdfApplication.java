package stirling.software.SPDF;

import java.awt.*;
import java.io.IOException;
import java.net.ServerSocket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.Properties;

import javax.swing.*;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.core.env.Environment;
import org.springframework.scheduling.annotation.EnableScheduling;

import io.github.pixee.security.SystemCommand;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import stirling.software.SPDF.UI.WebBrowser;
import stirling.software.SPDF.config.ConfigInitializer;
import stirling.software.SPDF.model.ApplicationProperties;

@SpringBootApplication
@EnableScheduling
@Slf4j
public class SPdfApplication {

    @Autowired private Environment env;
    @Autowired ApplicationProperties applicationProperties;

    private static String baseUrlStatic;
    private static String serverPortStatic;

    @Value("${baseUrl:http://localhost}")
    private String baseUrl;

    @Value("${server.port:8080}")
    public void setServerPortStatic(String port) {
        if ("auto".equalsIgnoreCase(port)) {
            // Use Spring Boot's automatic port assignment (server.port=0)
            SPdfApplication.serverPortStatic =
                    "0"; // This will let Spring Boot assign an available port
        } else {
            SPdfApplication.serverPortStatic = port;
        }
    }

    // Optionally keep this method if you want to provide a manual port-incrementation fallback.
    private static String findAvailablePort(int startPort) {
        int port = startPort;
        while (!isPortAvailable(port)) {
            port++;
        }
        return String.valueOf(port);
    }

    private static boolean isPortAvailable(int port) {
        try (ServerSocket socket = new ServerSocket(port)) {
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    public static void main(String[] args) throws IOException, InterruptedException {

        SpringApplication app = new SpringApplication(SPdfApplication.class);

        Properties props = new Properties();

        if (Boolean.parseBoolean(System.getProperty("STIRLING_PDF_DESKTOP_UI", "false"))) {
            System.setProperty("java.awt.headless", "false");
            app.setHeadless(false);
            props.put("java.awt.headless", "false");
            props.put("spring.main.web-application-type", "servlet");
        }

        app.setAdditionalProfiles("default");
        app.addInitializers(new ConfigInitializer());
        Map<String, String> propertyFiles = new HashMap<>();

        // External config files
        if (Files.exists(Paths.get("configs/settings.yml"))) {
            propertyFiles.put("spring.config.additional-location", "file:configs/settings.yml");
        } else {
            log.warn("External configuration file 'configs/settings.yml' does not exist.");
        }

        if (Files.exists(Paths.get("configs/custom_settings.yml"))) {
            String existingLocation =
                    propertyFiles.getOrDefault("spring.config.additional-location", "");
            if (!existingLocation.isEmpty()) {
                existingLocation += ",";
            }
            propertyFiles.put(
                    "spring.config.additional-location",
                    existingLocation + "file:configs/custom_settings.yml");
        } else {
            log.warn("Custom configuration file 'configs/custom_settings.yml' does not exist.");
        }
        Properties finalProps = new Properties();

        if (!propertyFiles.isEmpty()) {
            finalProps.putAll(
                    Collections.singletonMap(
                            "spring.config.additional-location",
                            propertyFiles.get("spring.config.additional-location")));
        }

        if (!props.isEmpty()) {
            finalProps.putAll(props);
        }
        app.setDefaultProperties(finalProps);

        app.run(args);

        // Ensure directories are created
        try {
            Files.createDirectories(Path.of("customFiles/static/"));
            Files.createDirectories(Path.of("customFiles/templates/"));
        } catch (Exception e) {
            log.error("Error creating directories: {}", e.getMessage());
        }

        printStartupLogs();
    }

    private static void printStartupLogs() {
        log.info("Stirling-PDF Started.");
        String url = baseUrlStatic + ":" + getStaticPort();
        log.info("Navigate to {}", url);
    }

    @Autowired(required = false)
    private WebBrowser webBrowser;

    @PostConstruct
    public void init() {
        baseUrlStatic = this.baseUrl;
        String url = baseUrl + ":" + getStaticPort();
        if (webBrowser != null
                && Boolean.parseBoolean(System.getProperty("STIRLING_PDF_DESKTOP_UI", "false"))) {
            webBrowser.initWebUI(url);
        } else {
            String browserOpenEnv = env.getProperty("BROWSER_OPEN");
            boolean browserOpen = browserOpenEnv != null && "true".equalsIgnoreCase(browserOpenEnv);
            if (browserOpen) {
                try {
                    String os = System.getProperty("os.name").toLowerCase();
                    Runtime rt = Runtime.getRuntime();
                    if (os.contains("win")) {
                        // For Windows
                        SystemCommand.runCommand(rt, "rundll32 url.dll,FileProtocolHandler " + url);
                    } else if (os.contains("mac")) {
                        SystemCommand.runCommand(rt, "open " + url);
                    } else if (os.contains("nix") || os.contains("nux")) {
                        SystemCommand.runCommand(rt, "xdg-open " + url);
                    }
                } catch (Exception e) {
                    log.error("Error opening browser: {}", e.getMessage());
                }
            }
        }
        log.info("Running configs {}", applicationProperties.toString());
    }

    @PreDestroy
    public void cleanup() {
        if (webBrowser != null) {
            webBrowser.cleanup();
        }
    }

    public static String getStaticBaseUrl() {
        return baseUrlStatic;
    }

    public String getNonStaticBaseUrl() {
        return baseUrlStatic;
    }

    public static String getStaticPort() {
        return serverPortStatic;
    }

    public String getNonStaticPort() {
        return serverPortStatic;
    }
}

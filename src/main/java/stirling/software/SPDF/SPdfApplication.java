package stirling.software.SPDF;

import java.io.IOException;
import java.net.ServerSocket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.core.env.Environment;
import org.springframework.scheduling.annotation.EnableScheduling;

import io.github.pixee.security.SystemCommand;

import jakarta.annotation.PostConstruct;
import stirling.software.SPDF.config.ConfigInitializer;
import stirling.software.SPDF.model.ApplicationProperties;

@SpringBootApplication
@EnableScheduling
public class SPdfApplication {

    private static final Logger logger = LoggerFactory.getLogger(SPdfApplication.class);

    @Autowired private Environment env;
    @Autowired ApplicationProperties applicationProperties;

    private static String serverPortStatic;

    @Value("${server.port:8080}")
    public void setServerPortStatic(String port) {
        if (port.equalsIgnoreCase("auto")) {
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

    @PostConstruct
    public void init() {
        // Check if the BROWSER_OPEN environment variable is set to true
        String browserOpenEnv = env.getProperty("BROWSER_OPEN");
        boolean browserOpen = browserOpenEnv != null && "true".equalsIgnoreCase(browserOpenEnv);
        if (browserOpen) {
            try {
                String url = "http://localhost:" + getStaticPort();

                String os = System.getProperty("os.name").toLowerCase();
                Runtime rt = Runtime.getRuntime();
                if (os.contains("win")) {
                    // For Windows
                    SystemCommand.runCommand(rt, "rundll32 url.dll,FileProtocolHandler " + url);
                } else if (os.contains("mac")) {
                    rt.exec("open " + url);
                } else if (os.contains("nix") || os.contains("nux")) {
                    rt.exec("xdg-open " + url);
                }
            } catch (Exception e) {
                logger.error("Error opening browser: {}", e.getMessage());
            }
        }
        logger.info("Running configs {}", applicationProperties.toString());
    }

    public static void main(String[] args) throws IOException, InterruptedException {

        SpringApplication app = new SpringApplication(SPdfApplication.class);
        app.setAdditionalProfiles("default");
        app.addInitializers(new ConfigInitializer());
        Map<String, String> propertyFiles = new HashMap<>();

        // External config files
        if (Files.exists(Paths.get("configs/settings.yml"))) {
            propertyFiles.put("spring.config.additional-location", "file:configs/settings.yml");
        } else {
            logger.warn("External configuration file 'configs/settings.yml' does not exist.");
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
            logger.warn("Custom configuration file 'configs/custom_settings.yml' does not exist.");
        }

        if (!propertyFiles.isEmpty()) {
            app.setDefaultProperties(
                    Collections.singletonMap(
                            "spring.config.additional-location",
                            propertyFiles.get("spring.config.additional-location")));
        }

        app.run(args);

        // Ensure directories are created
        try {
            Files.createDirectories(Path.of("customFiles/static/"));
            Files.createDirectories(Path.of("customFiles/templates/"));
        } catch (Exception e) {
            logger.error("Error creating directories: {}", e.getMessage());
        }

        printStartupLogs();
    }

    private static void printStartupLogs() {
        logger.info("Stirling-PDF Started.");
        String url = "http://localhost:" + getStaticPort();
        logger.info("Navigate to {}", url);
    }

    public static String getStaticPort() {
        return serverPortStatic;
    }

    public String getNonStaticPort() {
        return serverPortStatic;
    }
}

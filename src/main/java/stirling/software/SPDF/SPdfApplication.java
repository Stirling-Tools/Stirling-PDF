import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Collections;

import io.github.pixee.security.SystemCommand;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.Environment;
import org.springframework.scheduling.annotation.EnableScheduling;

import static java.nio.file.Files.createDirectories;

@SpringBootApplication
@EnableScheduling
public class SPdfApplication {

    private static Environment env;

    public SPdfApplication(Environment env) {
        SPdfApplication.env = env;
    }

    public static void main(String[] args) {
        SpringApplication app = new SpringApplication(SPdfApplication.class);
        app.addInitializers((ApplicationContextInitializer<ConfigurableApplicationContext>) applicationContext -> {
            if (Files.exists(Paths.get("configs/settings.yml"))) {
                app.setDefaultProperties(
                        Collections.singletonMap(
                                "spring.config.additional-location", "file:configs/settings.yml"));
            } else {
                System.out.println(
                        "External configuration file 'configs/settings.yml' does not exist. Using default configuration and environment configuration instead.");
            }
        ConfigurableApplicationContext context = app.run(args);

        createDirectories();
        printStartupMessage(context);
    }
    }

    private static void createDirectories() {
        try {
            createDirectories(Paths.get("customFiles/static/"));
            createDirectories(Paths.get("customFiles/templates/"));
        } catch (Exception e) {
            System.err.println("Error creating directories: " + e.getMessage());
        }
    }

    private static void printStartupMessage(ConfigurableApplicationContext context) {
        String port = context.getEnvironment().getProperty("local.server.port", "8080");
        String url = "http://localhost:" + port;
        System.out.println("Stirling-PDF Started.");
        System.out.println("Navigate to " + url);

        // Open browser if BROWSER_OPEN environment variable is set to true
        openBrowserIfRequired(context);
    }

    private static void openBrowserIfRequired(ConfigurableApplicationContext context) {
        Environment environment = context.getEnvironment();
        String browserOpenEnv = environment.getProperty("BROWSER_OPEN");
        boolean browserOpen = browserOpenEnv != null && "true".equalsIgnoreCase(browserOpenEnv);

        if (browserOpen) {
            try {
                String url = "http://localhost:" + context.getEnvironment().getProperty("local.server.port", "8080");

                String os = System.getProperty("os.name").toLowerCase();
                Runtime rt = Runtime.getRuntime();
                if (os.contains("win")) {
                    // For Windows
                    SystemCommand.runCommand(rt, "rundll32 url.dll,FileProtocolHandler " + url);
                }
            } catch (Exception e) {
                System.err.println("Error opening browser: " + e.getMessage());
            }
        }
    }
}

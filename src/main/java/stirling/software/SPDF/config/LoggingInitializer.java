package stirling.software.SPDF.config;

import java.io.File;

import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.env.ConfigurableEnvironment;

@Configuration
@Order(Ordered.HIGHEST_PRECEDENCE)
public class LoggingInitializer extends ConfigInitializer {
    static {
        String logPath = InstallationPathConfig.getLogPath();
        System.setProperty("LOG_PATH", logPath);
        new File(logPath).mkdirs();
    }

    @Override
    public void initialize(ConfigurableApplicationContext applicationContext) {
        super.initialize(applicationContext);
        ConfigurableEnvironment environment = applicationContext.getEnvironment();
        environment.getSystemProperties().put("LOG_PATH", System.getProperty("LOG_PATH"));
    }
}

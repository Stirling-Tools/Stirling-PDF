package stirling.software.SPDF;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

import stirling.software.SPDF.config.AppConfig;

@SpringBootApplication
public class SPdfApplication {

    public static void main(String[] args) {
        SpringApplication.run(SPdfApplication.class, args);
    }

}

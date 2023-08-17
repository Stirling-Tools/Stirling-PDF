package stirling.software.SPDF;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.core.env.Environment;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;

import jakarta.annotation.PostConstruct;
import stirling.software.SPDF.utils.GeneralUtils;
import org.springframework.security.config.annotation.method.configuration.EnableGlobalMethodSecurity;
@SpringBootApplication
@EnableWebSecurity()
@EnableGlobalMethodSecurity(prePostEnabled = true)
//@EnableScheduling
public class SPdfApplication {
	
	@Autowired
    private Environment env;

    @PostConstruct
    public void init() {
        // Check if the BROWSER_OPEN environment variable is set to true
        String browserOpenEnv = env.getProperty("BROWSER_OPEN");
        boolean browserOpen = browserOpenEnv != null && browserOpenEnv.equalsIgnoreCase("true");

        if (browserOpen) {
            try {
                String port = env.getProperty("local.server.port");
                if(port == null || port.length() == 0) {
                	port="8080";
                }
                String url = "http://localhost:" + port;

                String os = System.getProperty("os.name").toLowerCase();
                Runtime rt = Runtime.getRuntime();
                if (os.contains("win")) {
                    // For Windows
                    rt.exec("rundll32 url.dll,FileProtocolHandler " + url);
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }
	
    public static void main(String[] args) {
        SpringApplication.run(SPdfApplication.class, args);
        try {
			Thread.sleep(1000);
		} catch (InterruptedException e) {
			// TODO Auto-generated catch block
			e.printStackTrace();
		}
        
        GeneralUtils.createDir("customFiles/static/");
        GeneralUtils.createDir("customFiles/templates/");
        GeneralUtils.createDir("config");
        
        
        
        System.out.println("Stirling-PDF Started.");
        
        String port = System.getProperty("local.server.port");
        if(port == null || port.length() == 0) {
        	port="8080";
        }
        String url = "http://localhost:" + port;
        System.out.println("Navigate to " + url);
    }
    
    
}
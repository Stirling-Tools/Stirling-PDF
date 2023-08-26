package stirling.software.SPDF.config;

import java.util.Arrays;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

import stirling.software.SPDF.utils.PropertyConfigs;
import stirling.software.SPDF.model.ApplicationProperties;
@Configuration
public class AppConfig {

    @Autowired
    ApplicationProperties applicationProperties;
    
    @Bean(name = "loginEnabled")
    public boolean loginEnabled() {
        System.out.println(applicationProperties.toString());
        return applicationProperties.getSecurity().getEnableLogin();
    }

    @Bean(name = "appName")
    public String appName() {
        String homeTitle =  applicationProperties.getUi().getHomeName();
        return (homeTitle != null) ? homeTitle : "Stirling PDF";
    }

    @Bean(name = "appVersion")
    public String appVersion() {
        String version = getClass().getPackage().getImplementationVersion();
        return (version != null) ? version : "0.0.0";
    }

    @Bean(name = "homeText")
    public String homeText() {
        return applicationProperties.getUi().getHomeDescription();
    }


    @Bean(name = "navBarText")
    public String navBarText() {
        String defaultNavBar = applicationProperties.getUi().getNavbarName() != null ? applicationProperties.getUi().getNavbarName() : applicationProperties.getUi().getHomeName();
        return (defaultNavBar != null) ? defaultNavBar : "Stirling PDF";
    }
	
	@Bean(name = "rateLimit")
    public boolean rateLimit() {
        String appName = System.getProperty("rateLimit");
        if (appName == null) 
            appName = System.getenv("rateLimit");
        System.out.println("rateLimit=" + appName);
        return (appName != null) ? Boolean.valueOf(appName) : false;
    }
	
	
}
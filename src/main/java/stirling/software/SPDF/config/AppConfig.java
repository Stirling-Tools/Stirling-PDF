package stirling.software.SPDF.config;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import stirling.software.SPDF.model.ApplicationProperties;
@Configuration
public class AppConfig {

    @Autowired
    ApplicationProperties applicationProperties;
    
    @Bean(name = "loginEnabled")
    public boolean loginEnabled() {
        return applicationProperties.getSecurity().getEnableLogin();
    }

    @Bean(name = "appName")
    public String appName() {
        String homeTitle =  applicationProperties.getUi().getAppName();
        return (homeTitle != null) ? homeTitle : "Stirling PDF";
    }

    @Bean(name = "appVersion")
    public String appVersion() {
        String version = getClass().getPackage().getImplementationVersion();
        return (version != null) ? version : "0.0.0";
    }

    @Bean(name = "homeText")
    public String homeText() {
    	return (applicationProperties.getUi().getHomeDescription() != null) ? applicationProperties.getUi().getHomeDescription() : "null";
    }


    @Bean(name = "navBarText")
    public String navBarText() {
        String defaultNavBar = applicationProperties.getUi().getAppNameNavbar() != null ? applicationProperties.getUi().getAppNameNavbar() : applicationProperties.getUi().getAppName();
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
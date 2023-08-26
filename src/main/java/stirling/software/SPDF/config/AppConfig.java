package stirling.software.SPDF.config;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

@Configuration
public class AppConfig {
	
	@Value("${login.enabled:false}")
    private boolean defaultLoginEnabled;

    @Value("${ui.homeName:Stirling PDF}")
    private String defaultAppName;

    @Value("${ui.homeDescription:null}")
    private String defaultHomeText;

    @Value("${ui.navbarName:Stirling PDF}")
    private String defaultNavBarText;

    @Bean(name = "loginEnabled")
    public boolean loginEnabled() {
        return getBooleanValue("login.enabled", defaultLoginEnabled);
    }

    @Bean(name = "appName")
    public String appName() {
        return getStringValue("APP_HOME_NAME", defaultAppName);
    }

    @Bean(name = "appVersion")
    public String appVersion() {
        String version = getClass().getPackage().getImplementationVersion();
        return (version != null) ? version : "0.0.0";
    }

    @Bean(name = "homeText")
    public String homeText() {
        return getStringValue("APP_HOME_DESCRIPTION", defaultHomeText);
    }

    @Bean(name = "navBarText")
    public String navBarText() {
        String navBarText = getStringValue("APP_NAVBAR_NAME", null);
        if (navBarText == null) {
            navBarText = getStringValue("APP_HOME_NAME", defaultNavBarText);
        }
        return navBarText;
    }

    private boolean getBooleanValue(String key, boolean defaultValue) {
        String value = System.getProperty(key);
        if (value == null) 
            value = System.getenv(key);
        return (value != null) ? Boolean.valueOf(value) : defaultValue;
    }

    private String getStringValue(String key, String defaultValue) {
        String value = System.getProperty(key);
        if (value == null)
            value = System.getenv(key);
        return (value != null) ? value : defaultValue;
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
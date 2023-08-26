package stirling.software.SPDF.model;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.PropertySource;

import java.util.List;
import java.util.Optional;

import stirling.software.SPDF.config.YamlPropertySourceFactory;

@Configuration
@ConfigurationProperties(prefix = "")
@PropertySource(value = "file:./configs/application.yml", factory = YamlPropertySourceFactory.class)
public class ApplicationProperties {
	private Security security;
	private System system;
	private Ui ui;
	private Endpoints endpoints;
	private Metrics metrics;
	private AutomaticallyGenerated automaticallyGenerated;

	public Security getSecurity() {
		return security != null ? security : new Security();
	}

	public void setSecurity(Security security) {
		this.security = security;
	}

	public System getSystem() {
		return system != null ? system : new System();
	}

	public void setSystem(System system) {
		this.system = system;
	}

	public Ui getUi() {
		return ui != null ? ui : new Ui();
	}

	public void setUi(Ui ui) {
		this.ui = ui;
	}

	public Endpoints getEndpoints() {
		return endpoints != null ? endpoints : new Endpoints();
	}

	public void setEndpoints(Endpoints endpoints) {
		this.endpoints = endpoints;
	}

	public Metrics getMetrics() {
		return metrics != null ? metrics : new Metrics();
	}

	public void setMetrics(Metrics metrics) {
		this.metrics = metrics;
	}

	public AutomaticallyGenerated getAutomaticallyGenerated() {
		return automaticallyGenerated != null ? automaticallyGenerated : new AutomaticallyGenerated();
	}

	public void setAutomaticallyGenerated(AutomaticallyGenerated automaticallyGenerated) {
		this.automaticallyGenerated = automaticallyGenerated;
	}
	
	
	@Override
	public String toString() {
		return "ApplicationProperties [security=" + security + ", system=" + system + ", ui=" + ui + ", endpoints="
				+ endpoints + ", metrics=" + metrics + ", automaticallyGenerated="
				+ automaticallyGenerated + "]";
	}


	public static class Security {
		private Boolean enableLogin;
		private InitialLogin initialLogin;
		private Boolean csrfDisabled;

		public Boolean getEnableLogin() {
			return enableLogin;
		}

		public void setEnableLogin(Boolean enableLogin) {
			this.enableLogin = enableLogin;
		}

		public InitialLogin getInitialLogin() {
			return initialLogin != null ? initialLogin : new InitialLogin();
		}

		public void setInitialLogin(InitialLogin initialLogin) {
			this.initialLogin = initialLogin;
		}

		public Boolean getCsrfDisabled() {
			return csrfDisabled;
		}

		public void setCsrfDisabled(Boolean csrfDisabled) {
			this.csrfDisabled = csrfDisabled;
		}

		
		@Override
		public String toString() {
			return "Security [enableLogin=" + enableLogin + ", initialLogin=" + initialLogin + ", csrfDisabled="
					+ csrfDisabled + "]";
		}


		public static class InitialLogin {

			private String username;
			private String password;
			
			public String getUsername() {
				return username;
			}

			public void setUsername(String username) {
				this.username = username;
			}

			public String getPassword() {
				return password;
			}

			public void setPassword(String password) {
				this.password = password;
			}

			@Override
			public String toString() {
				return "InitialLogin [username=" + username + ", password=" + (password != null && !password.isEmpty() ? "MASKED" : "NULL") + "]";
			}


			
		}
	}

	public static class System {
		private String defaultLocale;
		private Boolean googlevisibility;
		private String rootPath;
		private String customstaticFilePath;
		private Integer maxFileSize;

		public String getDefaultLocale() {
			return defaultLocale;
		}

		public void setDefaultLocale(String defaultLocale) {
			this.defaultLocale = defaultLocale;
		}

		public Boolean getGooglevisibility() {
			return googlevisibility;
		}

		public void setGooglevisibility(Boolean googlevisibility) {
			this.googlevisibility = googlevisibility;
		}

		public String getRootPath() {
			return rootPath;
		}

		public void setRootPath(String rootPath) {
			this.rootPath = rootPath;
		}

		public String getCustomstaticFilePath() {
			return customstaticFilePath;
		}

		public void setCustomstaticFilePath(String customstaticFilePath) {
			this.customstaticFilePath = customstaticFilePath;
		}

		public Integer getMaxFileSize() {
			return maxFileSize;
		}

		public void setMaxFileSize(Integer maxFileSize) {
			this.maxFileSize = maxFileSize;
		}

		@Override
		public String toString() {
			return "System [defaultLocale=" + defaultLocale + ", googlevisibility=" + googlevisibility + ", rootPath="
					+ rootPath + ", customstaticFilePath=" + customstaticFilePath + ", maxFileSize=" + maxFileSize
					+ "]";
		}

		
	}

	public static class Ui {
		private String homeName;
		private String homeDescription;
		private String navbarName;

		public String getHomeName() {
			return homeName;
		}

		public void setHomeName(String homeName) {
			this.homeName = homeName;
		}

		public String getHomeDescription() {
			return homeDescription;
		}

		public void setHomeDescription(String homeDescription) {
			this.homeDescription = homeDescription;
		}

		public String getNavbarName() {
			return navbarName;
		}

		public void setNavbarName(String navbarName) {
			this.navbarName = navbarName;
		}

		@Override
		public String toString() {
			return "Ui [homeName=" + homeName + ", homeDescription=" + homeDescription + ", navbarName=" + navbarName
					+ "]";
		}

		
	}

	public static class Endpoints {
		private List<String> toRemove;
		private List<String> groupsToRemove;

		public List<String> getToRemove() {
			return toRemove;
		}

		public void setToRemove(List<String> toRemove) {
			this.toRemove = toRemove;
		}

		public List<String> getGroupsToRemove() {
			return groupsToRemove;
		}

		public void setGroupsToRemove(List<String> groupsToRemove) {
			this.groupsToRemove = groupsToRemove;
		}

		@Override
		public String toString() {
			return "Endpoints [toRemove=" + toRemove + ", groupsToRemove=" + groupsToRemove + "]";
		}

		
	}

	public static class Metrics {
		private Boolean enabled;

		public Boolean getEnabled() {
			return enabled;
		}

		public void setEnabled(Boolean enabled) {
			this.enabled = enabled;
		}

		@Override
		public String toString() {
			return "Metrics [enabled=" + enabled + "]";
		}

		
	}

	public static class AutomaticallyGenerated {
		private String key;

		public String getKey() {
			return key;
		}

		public void setKey(String key) {
			this.key = key;
		}

		@Override
		public String toString() {
			return "AutomaticallyGenerated [key=" + (key != null && !key.isEmpty() ? "MASKED" : "NULL") + "]";
		}
		
	}
}

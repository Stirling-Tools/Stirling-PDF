package stirling.software.SPDF.model;

import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.PropertySource;

import stirling.software.SPDF.config.YamlPropertySourceFactory;

@Configuration
@ConfigurationProperties(prefix = "")
@PropertySource(value = "file:./configs/settings.yml", factory = YamlPropertySourceFactory.class)
public class ApplicationProperties {
	private Security security;
	private System system;
	private Ui ui;
	private Endpoints endpoints;
	private Metrics metrics;
	private AutomaticallyGenerated automaticallyGenerated;
	private AutoPipeline autoPipeline;

	public AutoPipeline getAutoPipeline() {
		return autoPipeline != null ? autoPipeline : new AutoPipeline();
	}

	public void setAutoPipeline(AutoPipeline autoPipeline) {
		this.autoPipeline = autoPipeline;
	}

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
				+ endpoints + ", metrics=" + metrics + ", automaticallyGenerated=" + automaticallyGenerated
				+ ", autoPipeline=" + autoPipeline + "]";
	}

	public static class AutoPipeline {
		private String outputFolder;

		public String getOutputFolder() {
			return outputFolder;
		}

		public void setOutputFolder(String outputFolder) {
			this.outputFolder = outputFolder;
		}

		@Override
		public String toString() {
			return "AutoPipeline [outputFolder=" + outputFolder + "]";
		}
		
		
		
	}
	public static class Security {
		private Boolean enableLogin;
		private Boolean csrfDisabled;
		private InitialLogin initialLogin;

		public InitialLogin getInitialLogin() {
			return initialLogin != null ? initialLogin : new InitialLogin();
		}

		public void setInitialLogin(InitialLogin initialLogin) {
			this.initialLogin = initialLogin;
		}
		
		public Boolean getEnableLogin() {
			return enableLogin;
		}

		public void setEnableLogin(Boolean enableLogin) {
			this.enableLogin = enableLogin;
		}

		public Boolean getCsrfDisabled() {
			return csrfDisabled;
		}

		public void setCsrfDisabled(Boolean csrfDisabled) {
			this.csrfDisabled = csrfDisabled;
		}

		
		@Override
		public String toString() {
			return "Security [enableLogin=" + enableLogin + ", initialLogin=" + initialLogin + ",  csrfDisabled="
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
		private String rootURIPath;
		private String customStaticFilePath;
		private Integer maxFileSize;
		
		private Boolean  enableAlphaFunctionality;
		
		
		

		public Boolean getEnableAlphaFunctionality() {
			return enableAlphaFunctionality;
		}

		public void setEnableAlphaFunctionality(Boolean enableAlphaFunctionality) {
			this.enableAlphaFunctionality = enableAlphaFunctionality;
		}

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

		public String getRootURIPath() {
			return rootURIPath;
		}

		public void setRootURIPath(String rootURIPath) {
			this.rootURIPath = rootURIPath;
		}

		public String getCustomStaticFilePath() {
			return customStaticFilePath;
		}

		public void setCustomStaticFilePath(String customStaticFilePath) {
			this.customStaticFilePath = customStaticFilePath;
		}

		public Integer getMaxFileSize() {
			return maxFileSize;
		}

		public void setMaxFileSize(Integer maxFileSize) {
			this.maxFileSize = maxFileSize;
		}

		@Override
		public String toString() {
			return "System [defaultLocale=" + defaultLocale + ", googlevisibility=" + googlevisibility
					+ ", rootURIPath=" + rootURIPath + ", customStaticFilePath=" + customStaticFilePath
					+ ", maxFileSize=" + maxFileSize + ", enableAlphaFunctionality=" + enableAlphaFunctionality + "]";
		}

		
		
	}

	public static class Ui {
	    private String appName;
	    private String homeDescription;
	    private String appNameNavbar;

	    public String getAppName() {
	    	if(appName != null && appName.trim().length() == 0)
	    		return null;
	        return appName;
	    }

	    public void setAppName(String appName) {
	        this.appName = appName;
	    }

	    public String getHomeDescription() {
	    	if(homeDescription != null && homeDescription.trim().length() == 0)
	    		return null;
	        return homeDescription;
	    }

	    public void setHomeDescription(String homeDescription) {
	        this.homeDescription = homeDescription;
	    }

	    public String getAppNameNavbar() {
	    	if(appNameNavbar != null && appNameNavbar.trim().length() == 0)
	    		return null;
	        return appNameNavbar;
	    }

	    public void setAppNameNavbar(String appNameNavbar) {
	        this.appNameNavbar = appNameNavbar;
	    }

	    @Override
	    public String toString() {
	        return "UserInterface [appName=" + appName + ", homeDescription=" + homeDescription + ", appNameNavbar=" + appNameNavbar + "]";
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

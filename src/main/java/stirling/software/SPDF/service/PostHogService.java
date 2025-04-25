package stirling.software.SPDF.service;

import java.io.File;
import java.lang.management.*;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.*;

import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

import com.posthog.java.PostHog;

import stirling.software.SPDF.controller.api.pipeline.UserServiceInterface;
import stirling.software.SPDF.model.ApplicationProperties;

@Service
public class PostHogService {
    private final PostHog postHog;
    private final String uniqueId;
    private final String appVersion;
    private final ApplicationProperties applicationProperties;
    private final UserServiceInterface userService;
    private final Environment env;
    private boolean configDirMounted;

    public PostHogService(
            PostHog postHog,
            @Qualifier("UUID") String uuid,
            @Qualifier("configDirMounted") boolean configDirMounted,
            @Qualifier("appVersion") String appVersion,
            ApplicationProperties applicationProperties,
            @Autowired(required = false) UserServiceInterface userService,
            Environment env) {
        this.postHog = postHog;
        this.uniqueId = uuid;
        this.appVersion = appVersion;
        this.applicationProperties = applicationProperties;
        this.userService = userService;
        this.env = env;
        this.configDirMounted = configDirMounted;
        captureSystemInfo();
    }

    private void captureSystemInfo() {
        if (!applicationProperties.getSystem().isAnalyticsEnabled()) {
            return;
        }
        try {
            postHog.capture(uniqueId, "system_info_captured", captureServerMetrics());
        } catch (Exception e) {
            // Handle exceptions
        }
    }

    public void captureEvent(String eventName, Map<String, Object> properties) {
        if (!applicationProperties.getSystem().isAnalyticsEnabled()) {
            return;
        }

        properties.put("app_version", appVersion);
        postHog.capture(uniqueId, eventName, properties);
    }

    public Map<String, Object> captureServerMetrics() {
        Map<String, Object> metrics = new HashMap<>();

        try {
            // Application version
            metrics.put("app_version", appVersion);
            String deploymentType = "JAR"; // default
            if ("true".equalsIgnoreCase(env.getProperty("BROWSER_OPEN"))) {
                deploymentType = "EXE";
            } else if (isRunningInDocker()) {
                deploymentType = "DOCKER";
            }
            metrics.put("deployment_type", deploymentType);
            metrics.put("mounted_config_dir", configDirMounted);

            // System info
            metrics.put("os_name", System.getProperty("os.name"));
            metrics.put("os_version", System.getProperty("os.version"));
            metrics.put("java_version", System.getProperty("java.version"));
            metrics.put("user_name", System.getProperty("user.name"));
            metrics.put("user_home", System.getProperty("user.home"));
            metrics.put("user_dir", System.getProperty("user.dir"));

            // CPU and Memory
            metrics.put("cpu_cores", Runtime.getRuntime().availableProcessors());
            metrics.put("total_memory", Runtime.getRuntime().totalMemory());
            metrics.put("free_memory", Runtime.getRuntime().freeMemory());

            // Network and Server Identity
            InetAddress localHost = InetAddress.getLocalHost();
            metrics.put("ip_address", localHost.getHostAddress());
            metrics.put("hostname", localHost.getHostName());
            metrics.put("mac_address", getMacAddress());

            // JVM info
            metrics.put("jvm_vendor", System.getProperty("java.vendor"));
            metrics.put("jvm_version", System.getProperty("java.vm.version"));

            // Locale and Timezone
            metrics.put("system_language", System.getProperty("user.language"));
            metrics.put("system_country", System.getProperty("user.country"));
            metrics.put("timezone", TimeZone.getDefault().getID());
            metrics.put("locale", Locale.getDefault().toString());

            // Disk info
            File root = new File(".");
            metrics.put("total_disk_space", root.getTotalSpace());
            metrics.put("free_disk_space", root.getFreeSpace());

            // Process info
            metrics.put("process_id", ProcessHandle.current().pid());

            // JVM metrics
            RuntimeMXBean runtimeMXBean = ManagementFactory.getRuntimeMXBean();
            metrics.put("jvm_uptime_ms", runtimeMXBean.getUptime());
            metrics.put("jvm_start_time", runtimeMXBean.getStartTime());

            // Memory metrics
            MemoryMXBean memoryMXBean = ManagementFactory.getMemoryMXBean();
            metrics.put("heap_memory_usage", memoryMXBean.getHeapMemoryUsage().getUsed());
            metrics.put("non_heap_memory_usage", memoryMXBean.getNonHeapMemoryUsage().getUsed());

            // CPU metrics
            OperatingSystemMXBean osMXBean = ManagementFactory.getOperatingSystemMXBean();
            metrics.put("system_load_average", osMXBean.getSystemLoadAverage());

            // Thread metrics
            ThreadMXBean threadMXBean = ManagementFactory.getThreadMXBean();
            metrics.put("thread_count", threadMXBean.getThreadCount());
            metrics.put("daemon_thread_count", threadMXBean.getDaemonThreadCount());
            metrics.put("peak_thread_count", threadMXBean.getPeakThreadCount());

            // Garbage collection metrics
            for (GarbageCollectorMXBean gcBean : ManagementFactory.getGarbageCollectorMXBeans()) {
                metrics.put("gc_" + gcBean.getName() + "_count", gcBean.getCollectionCount());
                metrics.put("gc_" + gcBean.getName() + "_time", gcBean.getCollectionTime());
            }

            // Network interfaces
            metrics.put("network_interfaces", getNetworkInterfacesInfo());

            // Docker detection and stats
            boolean isDocker = isRunningInDocker();
            if (isDocker) {
                metrics.put("docker_metrics", getDockerMetrics());
            }
            metrics.put("application_properties", captureApplicationProperties());

            if (userService != null) {
                metrics.put("total_users_created", userService.getTotalUsersCount());
            }

        } catch (Exception e) {
            metrics.put("error", e.getMessage());
        }

        return metrics;
    }

    private boolean isRunningInDocker() {
        return Files.exists(Paths.get("/.dockerenv"));
    }

    private Map<String, Object> getDockerMetrics() {
        Map<String, Object> dockerMetrics = new HashMap<>();

        // Network-related Docker info
        dockerMetrics.put("docker_network_mode", System.getenv("DOCKER_NETWORK_MODE"));

        // Container name (if set)
        String containerName = System.getenv("CONTAINER_NAME");
        if (containerName != null && !containerName.isEmpty()) {
            dockerMetrics.put("container_name", containerName);
        }

        // Docker compose information
        String composeProject = System.getenv("COMPOSE_PROJECT_NAME");
        String composeService = System.getenv("COMPOSE_SERVICE_NAME");
        if (composeProject != null && composeService != null) {
            dockerMetrics.put("compose_project", composeProject);
            dockerMetrics.put("compose_service", composeService);
        }

        // Kubernetes-specific info (if running in K8s)
        String k8sPodName = System.getenv("KUBERNETES_POD_NAME");
        if (k8sPodName != null) {
            dockerMetrics.put("k8s_pod_name", k8sPodName);
            dockerMetrics.put("k8s_namespace", System.getenv("KUBERNETES_NAMESPACE"));
            dockerMetrics.put("k8s_node_name", System.getenv("KUBERNETES_NODE_NAME"));
        }

        // New environment variables
        dockerMetrics.put("version_tag", System.getenv("VERSION_TAG"));
        dockerMetrics.put("docker_enable_security", System.getenv("DOCKER_ENABLE_SECURITY"));
        dockerMetrics.put("fat_docker", System.getenv("FAT_DOCKER"));

        return dockerMetrics;
    }

    private void addIfNotEmpty(Map<String, Object> map, String key, Object value) {
        if (value != null) {
            if (value instanceof String strValue) {
                if (!StringUtils.isBlank(strValue)) {
                    map.put(key, strValue.trim());
                }
            } else {
                map.put(key, value);
            }
        }
    }

    public Map<String, Object> captureApplicationProperties() {
        Map<String, Object> properties = new HashMap<>();

        // Capture Legal properties
        addIfNotEmpty(
                properties,
                "legal_termsAndConditions",
                applicationProperties.getLegal().getTermsAndConditions());
        addIfNotEmpty(
                properties,
                "legal_privacyPolicy",
                applicationProperties.getLegal().getPrivacyPolicy());
        addIfNotEmpty(
                properties,
                "legal_accessibilityStatement",
                applicationProperties.getLegal().getAccessibilityStatement());
        addIfNotEmpty(
                properties,
                "legal_cookiePolicy",
                applicationProperties.getLegal().getCookiePolicy());
        addIfNotEmpty(
                properties, "legal_impressum", applicationProperties.getLegal().getImpressum());

        // Capture Security properties
        addIfNotEmpty(
                properties,
                "security_enableLogin",
                applicationProperties.getSecurity().getEnableLogin());
        addIfNotEmpty(
                properties,
                "security_csrfDisabled",
                applicationProperties.getSecurity().getCsrfDisabled());
        addIfNotEmpty(
                properties,
                "security_loginAttemptCount",
                applicationProperties.getSecurity().getLoginAttemptCount());
        addIfNotEmpty(
                properties,
                "security_loginResetTimeMinutes",
                applicationProperties.getSecurity().getLoginResetTimeMinutes());
        addIfNotEmpty(
                properties,
                "security_loginMethod",
                applicationProperties.getSecurity().getLoginMethod());

        // Capture OAuth2 properties (excluding sensitive information)
        addIfNotEmpty(
                properties,
                "security_oauth2_enabled",
                applicationProperties.getSecurity().getOauth2().getEnabled());
        if (applicationProperties.getSecurity().getOauth2().getEnabled()) {
            addIfNotEmpty(
                    properties,
                    "security_oauth2_autoCreateUser",
                    applicationProperties.getSecurity().getOauth2().getAutoCreateUser());
            addIfNotEmpty(
                    properties,
                    "security_oauth2_blockRegistration",
                    applicationProperties.getSecurity().getOauth2().getBlockRegistration());
            addIfNotEmpty(
                    properties,
                    "security_oauth2_useAsUsername",
                    applicationProperties.getSecurity().getOauth2().getUseAsUsername());
            addIfNotEmpty(
                    properties,
                    "security_oauth2_provider",
                    applicationProperties.getSecurity().getOauth2().getProvider());
        }
        // Capture System properties
        addIfNotEmpty(
                properties,
                "system_defaultLocale",
                applicationProperties.getSystem().getDefaultLocale());
        addIfNotEmpty(
                properties,
                "system_googlevisibility",
                applicationProperties.getSystem().getGooglevisibility());
        addIfNotEmpty(
                properties, "system_showUpdate", applicationProperties.getSystem().isShowUpdate());
        addIfNotEmpty(
                properties,
                "system_showUpdateOnlyAdmin",
                applicationProperties.getSystem().getShowUpdateOnlyAdmin());
        addIfNotEmpty(
                properties,
                "system_customHTMLFiles",
                applicationProperties.getSystem().isCustomHTMLFiles());
        addIfNotEmpty(
                properties,
                "system_tessdataDir",
                applicationProperties.getSystem().getTessdataDir());
        addIfNotEmpty(
                properties,
                "system_enableAlphaFunctionality",
                applicationProperties.getSystem().getEnableAlphaFunctionality());
        addIfNotEmpty(
                properties,
                "system_enableAnalytics",
                applicationProperties.getSystem().isAnalyticsEnabled());

        // Capture UI properties
        addIfNotEmpty(properties, "ui_appName", applicationProperties.getUi().getAppName());
        addIfNotEmpty(
                properties,
                "ui_homeDescription",
                applicationProperties.getUi().getHomeDescription());
        addIfNotEmpty(
                properties, "ui_appNameNavbar", applicationProperties.getUi().getAppNameNavbar());

        // Capture Metrics properties
        addIfNotEmpty(
                properties, "metrics_enabled", applicationProperties.getMetrics().getEnabled());

        // Capture EnterpriseEdition properties
        addIfNotEmpty(
                properties,
                "enterpriseEdition_enabled",
                applicationProperties.getPremium().isEnabled());
        if (applicationProperties.getPremium().isEnabled()) {
            addIfNotEmpty(
                    properties,
                    "enterpriseEdition_customMetadata_autoUpdateMetadata",
                    applicationProperties
                            .getPremium()
                            .getProFeatures()
                            .getCustomMetadata()
                            .isAutoUpdateMetadata());
            addIfNotEmpty(
                    properties,
                    "enterpriseEdition_customMetadata_author",
                    applicationProperties
                            .getPremium()
                            .getProFeatures()
                            .getCustomMetadata()
                            .getAuthor());
            addIfNotEmpty(
                    properties,
                    "enterpriseEdition_customMetadata_creator",
                    applicationProperties
                            .getPremium()
                            .getProFeatures()
                            .getCustomMetadata()
                            .getCreator());
            addIfNotEmpty(
                    properties,
                    "enterpriseEdition_customMetadata_producer",
                    applicationProperties
                            .getPremium()
                            .getProFeatures()
                            .getCustomMetadata()
                            .getProducer());
        }
        // Capture AutoPipeline properties
        addIfNotEmpty(
                properties,
                "autoPipeline_outputFolder",
                applicationProperties.getAutoPipeline().getOutputFolder());

        return properties;
    }

    private String getMacAddress() {
        try {
            Enumeration<NetworkInterface> networkInterfaces =
                    NetworkInterface.getNetworkInterfaces();
            while (networkInterfaces.hasMoreElements()) {
                NetworkInterface ni = networkInterfaces.nextElement();
                byte[] hardwareAddress = ni.getHardwareAddress();
                if (hardwareAddress != null) {
                    String[] hexadecimal = new String[hardwareAddress.length];
                    for (int i = 0; i < hardwareAddress.length; i++) {
                        hexadecimal[i] = String.format("%02X", hardwareAddress[i]);
                    }
                    return String.join("-", hexadecimal);
                }
            }
        } catch (Exception e) {
            // Handle exception
        }
        return "Unknown";
    }

    private Map<String, String> getNetworkInterfacesInfo() {
        Map<String, String> interfacesInfo = new HashMap<>();
        try {
            Enumeration<NetworkInterface> nets = NetworkInterface.getNetworkInterfaces();
            while (nets.hasMoreElements()) {
                NetworkInterface netint = nets.nextElement();
                interfacesInfo.put(netint.getName(), netint.getDisplayName());
            }
        } catch (Exception e) {
            interfacesInfo.put("error", e.getMessage());
        }
        return interfacesInfo;
    }
}

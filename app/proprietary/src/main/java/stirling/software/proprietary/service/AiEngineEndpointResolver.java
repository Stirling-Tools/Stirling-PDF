package stirling.software.proprietary.service;

import java.lang.reflect.Method;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

import org.springframework.context.ApplicationContext;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;

/**
 * Discovers every {@code /api/v1/...} request mapping in the application and exposes the subset
 * that {@link EndpointConfiguration} reports as currently enabled. The AI engine receives this list
 * as-is and silently drops anything it doesn't recognise, so we don't try to predict what the
 * engine considers a tool - we just emit what's enabled here.
 */
@Slf4j
@Service
public class AiEngineEndpointResolver {

    private static final String API_PREFIX = "/api/v1/";

    private final ApplicationContext applicationContext;
    private final EndpointConfiguration endpointConfiguration;
    // Written once on the Spring startup thread during ContextRefreshedEvent, read on HTTP
    // request threads. Spring's lifecycle establishes happens-before (the servlet container
    // and its worker threads are started after refresh completes), so no volatile is needed.
    private Set<String> apiUrls = Set.of();

    public AiEngineEndpointResolver(
            ApplicationContext applicationContext, EndpointConfiguration endpointConfiguration) {
        this.applicationContext = applicationContext;
        this.endpointConfiguration = endpointConfiguration;
    }

    @EventListener(ContextRefreshedEvent.class)
    public void discoverApiUrls() {
        Set<String> discovered = new TreeSet<>();
        for (RequestMappingHandlerMapping mapping :
                applicationContext.getBeansOfType(RequestMappingHandlerMapping.class).values()) {
            for (RequestMappingInfo info : mapping.getHandlerMethods().keySet()) {
                for (String pattern : extractPatterns(info)) {
                    if (pattern.startsWith(API_PREFIX)) {
                        discovered.add(pattern);
                    }
                }
            }
        }
        apiUrls = Set.copyOf(discovered);
        log.debug("Discovered {} /api/v1/ endpoint URLs for AI engine filtering", apiUrls.size());
    }

    public List<String> getEnabledEndpointUrls() {
        return apiUrls.stream()
                .filter(endpointConfiguration::isEndpointEnabledForUri)
                .sorted()
                .toList();
    }

    private static Set<String> extractPatterns(RequestMappingInfo info) {
        try {
            Method getDirectPaths = info.getClass().getMethod("getDirectPaths");
            Object result = getDirectPaths.invoke(info);
            if (result instanceof Set<?> set) {
                Set<String> patterns = new HashSet<>();
                for (Object value : set) {
                    if (value instanceof String s) {
                        patterns.add(s);
                    }
                }
                return patterns;
            }
        } catch (Exception e) {
            log.trace("getDirectPaths unavailable on RequestMappingInfo", e);
        }
        return Set.of();
    }
}

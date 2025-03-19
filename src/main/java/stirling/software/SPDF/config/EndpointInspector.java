package stirling.software.SPDF.config;

import java.lang.reflect.Method;
import java.util.Collections;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationListener;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

@Component
public class EndpointInspector implements ApplicationListener<ContextRefreshedEvent> {
    private static final Logger logger = LoggerFactory.getLogger(EndpointInspector.class);

    private final ApplicationContext applicationContext;
    private final Set<String> validGetEndpoints = new HashSet<>();
    private boolean endpointsDiscovered = false;

    @Autowired
    public EndpointInspector(ApplicationContext applicationContext) {
        this.applicationContext = applicationContext;
    }

    @Override
    public void onApplicationEvent(ContextRefreshedEvent event) {
        if (!endpointsDiscovered) {
            discoverEndpoints();
            endpointsDiscovered = true;
            logger.info("Discovered {} valid GET endpoints", validGetEndpoints.size());
        }
    }

    private void discoverEndpoints() {
        try {
            // Get all request mapping beans from the application context
            Map<String, RequestMappingHandlerMapping> mappings =
                    applicationContext.getBeansOfType(RequestMappingHandlerMapping.class);

            // Process each mapping bean
            for (Map.Entry<String, RequestMappingHandlerMapping> entry : mappings.entrySet()) {
                RequestMappingHandlerMapping mapping = entry.getValue();

                // Get all handler methods registered in this mapping
                Map<RequestMappingInfo, HandlerMethod> handlerMethods = mapping.getHandlerMethods();

                // Process each handler method
                for (Map.Entry<RequestMappingInfo, HandlerMethod> handlerEntry :
                        handlerMethods.entrySet()) {
                    RequestMappingInfo mappingInfo = handlerEntry.getKey();
                    HandlerMethod handlerMethod = handlerEntry.getValue();

                    // Check if the method handles GET requests
                    boolean isGetHandler = false;
                    try {
                        Set<RequestMethod> methods = mappingInfo.getMethodsCondition().getMethods();
                        // Either explicitly handles GET or handles all methods (empty set)
                        isGetHandler = methods.isEmpty() || methods.contains(RequestMethod.GET);
                    } catch (Exception e) {
                        // If we can't determine methods, assume it could handle GET
                        isGetHandler = true;
                    }

                    if (isGetHandler) {
                        // Since we know getDirectPaths works, use it directly
                        Set<String> patterns = extractPatternsUsingDirectPaths(mappingInfo);
                        
                        // If that fails, try string parsing as fallback
                        if (patterns.isEmpty()) {
                            patterns = extractPatternsFromString(mappingInfo);
                        }
                        
                        // Add all valid patterns
                        validGetEndpoints.addAll(patterns);
                    }
                }
            }

            if (validGetEndpoints.isEmpty()) {
                // If we still couldn't find any endpoints, add some common ones as a fallback
                logger.warn("No endpoints discovered. Adding common endpoints as fallback.");
                validGetEndpoints.add("/");
                validGetEndpoints.add("/api/**");
                validGetEndpoints.add("/**");
            }
        } catch (Exception e) {
            logger.error("Error discovering endpoints", e);
        }
    }

    /**
     * Extract patterns using the getDirectPaths method that works in this environment
     */
    private Set<String> extractPatternsUsingDirectPaths(RequestMappingInfo mappingInfo) {
        Set<String> patterns = new HashSet<>();
        
        try {
            Method getDirectPathsMethod = mappingInfo.getClass().getMethod("getDirectPaths");
            Object result = getDirectPathsMethod.invoke(mappingInfo);
            if (result instanceof Set) {
                @SuppressWarnings("unchecked")
                Set<String> resultSet = (Set<String>) result;
                patterns.addAll(resultSet);
            }
        } catch (Exception e) {
            // Just return empty set if method not found or fails
        }
        
        return patterns;
    }

    private Set<String> extractPatternsFromString(RequestMappingInfo mappingInfo) {
        Set<String> patterns = new HashSet<>();
        try {
            String infoString = mappingInfo.toString();
            if (infoString.contains("{")) {
                String patternsSection =
                        infoString.substring(
                                infoString.indexOf("{") + 1,
                                infoString.indexOf("}"));

                for (String pattern : patternsSection.split(",")) {
                    pattern = pattern.trim();
                    if (!pattern.isEmpty()) {
                        patterns.add(pattern);
                    }
                }
            }
        } catch (Exception e) {
            // Just return empty set if parsing fails
        }
        return patterns;
    }

    /**
     * Check if a URI corresponds to a valid GET endpoint - Fixed to handle path variables safely
     */
    public boolean isValidGetEndpoint(String uri) {
        // Ensure endpoints are discovered
        if (!endpointsDiscovered) {
            discoverEndpoints();
            endpointsDiscovered = true;
        }

        // If no endpoints were discovered, assume all endpoints are valid
        if (validGetEndpoints.isEmpty()) {
            logger.warn("No valid endpoints were discovered. Assuming all GET endpoints are valid.");
            return true;
        }

        // Direct match
        if (validGetEndpoints.contains(uri)) {
            return true;
        }

        // Try simple prefix matching for wildcards and path variables
        for (String pattern : validGetEndpoints) {
            if (pattern.contains("*") || pattern.contains("{")) {
                int wildcardIndex = pattern.indexOf('*');
                int variableIndex = pattern.indexOf('{');

                // Find the earliest special character
                int cutoffIndex;
                if (wildcardIndex < 0) {
                    cutoffIndex = variableIndex;
                } else if (variableIndex < 0) {
                    cutoffIndex = wildcardIndex;
                } else {
                    cutoffIndex = Math.min(wildcardIndex, variableIndex);
                }

                // Get the static part of the pattern
                String staticPrefix = pattern.substring(0, cutoffIndex);

                // If the URI starts with this prefix, consider it a match
                if (uri.startsWith(staticPrefix)) {
                    return true;
                }
            }
        }

        // For patterns without wildcards or variables, try path-segment-by-segment matching
        for (String pattern : validGetEndpoints) {
            if (!pattern.contains("*") && !pattern.contains("{")) {
                // Split the pattern and URI into path segments
                String[] patternSegments = pattern.split("/");
                String[] uriSegments = uri.split("/");

                // If URI has fewer segments than the pattern, it can't match
                if (uriSegments.length < patternSegments.length) {
                    continue;
                }

                // Check each segment
                boolean match = true;
                for (int i = 0; i < patternSegments.length; i++) {
                    if (!patternSegments[i].equals(uriSegments[i])) {
                        match = false;
                        break;
                    }
                }

                if (match) {
                    return true;
                }
            }
        }

        // If no match was found, the URI is not valid
        return false;
    }

    /** Get all discovered valid GET endpoints */
    public Set<String> getValidGetEndpoints() {
        // Ensure endpoints are discovered
        if (!endpointsDiscovered) {
            discoverEndpoints();
            endpointsDiscovered = true;
        }
        return new HashSet<>(validGetEndpoints);
    }
    
    //For debugging when needed
    private void logAllEndpoints() {
        Set<String> sortedEndpoints = new TreeSet<>(validGetEndpoints);
        
        logger.info("=== BEGIN: All discovered GET endpoints ===");
        for (String endpoint : sortedEndpoints) {
            logger.info("Endpoint: {}", endpoint);
        }
        logger.info("=== END: All discovered GET endpoints ===");
        
    }
    
}
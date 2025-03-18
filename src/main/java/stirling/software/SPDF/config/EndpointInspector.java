package stirling.software.SPDF.config;

import java.lang.reflect.Method;
import java.util.Collections;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

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
        }
    }

    private void discoverEndpoints() {
        try {
            // Get all request mapping beans from the application context
            Map<String, RequestMappingHandlerMapping> mappings =
                    applicationContext.getBeansOfType(RequestMappingHandlerMapping.class);

            // Process each mapping bean
            for (Map.Entry<String, RequestMappingHandlerMapping> entry : mappings.entrySet()) {
                String beanName = entry.getKey();
                RequestMappingHandlerMapping mapping = entry.getValue();

                // Get all handler methods registered in this mapping
                Map<RequestMappingInfo, HandlerMethod> handlerMethods = mapping.getHandlerMethods();
                int methodsWithEmptyMethodsCondition = 0;
                int methodsWithGetMethod = 0;
                int methodsWithGetOrEmpty = 0;

                // Process each handler method
                for (Map.Entry<RequestMappingInfo, HandlerMethod> handlerEntry :
                        handlerMethods.entrySet()) {
                    RequestMappingInfo mappingInfo = handlerEntry.getKey();
                    HandlerMethod handlerMethod = handlerEntry.getValue();

                    // Debug info
                    logger.debug(
                            "Examining handler: {} -> {}",
                            mappingInfo,
                            handlerMethod.getMethod().getName());

                    boolean hasEmptyMethodsCondition = false;
                    boolean hasGetMethod = false;

                    // Get methods through reflection if standard approach fails
                    Set<RequestMethod> methods = Collections.emptySet();

                    try {
                        methods = mappingInfo.getMethodsCondition().getMethods();

                        // Standard approach
                        hasEmptyMethodsCondition = methods.isEmpty();
                        hasGetMethod = methods.contains(RequestMethod.GET);

                        logger.debug(
                                "Standard method detection: methods={}, isEmpty={}, hasGET={}",
                                methods,
                                hasEmptyMethodsCondition,
                                hasGetMethod);
                    } catch (Exception e) {
                        logger.warn(
                                "Error accessing methods through standard API: {}", e.getMessage());
                    }

                    if (hasEmptyMethodsCondition) {
                        methodsWithEmptyMethodsCondition++;
                    }

                    if (hasGetMethod) {
                        methodsWithGetMethod++;
                    }

                    // Count any method that could potentially handle GET requests
                    if (hasEmptyMethodsCondition || hasGetMethod) {
                        methodsWithGetOrEmpty++;

                        // Try to get patterns using reflection if direct approach fails
                        Set<String> patterns = extractPatternsUsingReflection(mappingInfo);

                        if (patterns.isEmpty()) {
                            // Fall back to toString parsing
                            String infoString = mappingInfo.toString();
                            // Extract patterns from toString if possible
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
                        }

                        // Add all patterns
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

    private Set<String> extractPatternsUsingReflection(RequestMappingInfo mappingInfo) {
        Set<String> patterns = new HashSet<>();

        try {
            // First try standard API
            if (mappingInfo.getPatternsCondition() != null) {
                patterns.addAll(mappingInfo.getPatternsCondition().getPatterns());
            }
        } catch (Exception e) {
            logger.debug("Standard pattern access failed: {}", e.getMessage());
        }

        // If standard approach failed, try reflection
        if (patterns.isEmpty()) {
            try {
                // Try to access patterns through reflection on different Spring versions
                Method[] methods = mappingInfo.getClass().getMethods();

                // Look for methods that might return patterns
                for (Method method : methods) {
                    String methodName = method.getName();
                    if ((methodName.contains("pattern") || methodName.contains("Path"))
                            && method.getParameterCount() == 0) {

                        logger.debug("Trying reflection method: {}", methodName);
                        try {
                            Object result = method.invoke(mappingInfo);
                            if (result instanceof Set) {
                                @SuppressWarnings("unchecked")
                                Set<String> resultSet = (Set<String>) result;
                                patterns.addAll(resultSet);
                                logger.debug(
                                        "Found {} patterns using method {}",
                                        resultSet.size(),
                                        methodName);
                            } else if (result != null) {
                                logger.debug(
                                        "Method {} returned non-Set result: {}",
                                        methodName,
                                        result);
                            }
                        } catch (Exception e) {
                            logger.debug(
                                    "Method {} invocation failed: {}", methodName, e.getMessage());
                        }
                    }
                }
            } catch (Exception e) {
                logger.warn("Reflection-based pattern extraction failed: {}", e.getMessage());
            }
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
            logger.warn(
                    "No valid endpoints were discovered. Assuming all GET endpoints are valid.");
            return true;
        }

        // Direct match
        if (validGetEndpoints.contains(uri)) {
            return true;
        }

        // Try simple prefix matching first (safer than regex)
        for (String pattern : validGetEndpoints) {
            // Handle wildcards and path variables with simple prefix matching
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
}

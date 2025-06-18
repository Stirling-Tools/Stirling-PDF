package stirling.software.SPDF.config;

import java.lang.reflect.Method;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationListener;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import lombok.RequiredArgsConstructor;

@Component
@RequiredArgsConstructor
public class EndpointInspector implements ApplicationListener<ContextRefreshedEvent> {
    private static final Logger logger = LoggerFactory.getLogger(EndpointInspector.class);

    private final ApplicationContext applicationContext;
    private final Set<String> validGetEndpoints = new HashSet<>();
    private boolean endpointsDiscovered = false;

    @Override
    public void onApplicationEvent(ContextRefreshedEvent event) {
        if (!endpointsDiscovered) {
            discoverEndpoints();
            endpointsDiscovered = true;
        }
    }

    private void discoverEndpoints() {
        try {
            Map<String, RequestMappingHandlerMapping> mappings =
                    applicationContext.getBeansOfType(RequestMappingHandlerMapping.class);

            for (Map.Entry<String, RequestMappingHandlerMapping> entry : mappings.entrySet()) {
                RequestMappingHandlerMapping mapping = entry.getValue();
                Map<RequestMappingInfo, HandlerMethod> handlerMethods = mapping.getHandlerMethods();

                for (Map.Entry<RequestMappingInfo, HandlerMethod> handlerEntry :
                        handlerMethods.entrySet()) {
                    RequestMappingInfo mappingInfo = handlerEntry.getKey();
                    HandlerMethod handlerMethod = handlerEntry.getValue();

                    boolean isGetHandler = false;
                    try {
                        Set<RequestMethod> methods = mappingInfo.getMethodsCondition().getMethods();
                        isGetHandler = methods.isEmpty() || methods.contains(RequestMethod.GET);
                    } catch (Exception e) {
                        isGetHandler = true;
                    }

                    if (isGetHandler) {
                        Set<String> patterns = extractPatternsUsingDirectPaths(mappingInfo);

                        if (patterns.isEmpty()) {
                            patterns = extractPatternsFromString(mappingInfo);
                        }

                        validGetEndpoints.addAll(patterns);
                    }
                }
            }

            if (validGetEndpoints.isEmpty()) {
                logger.warn("No endpoints discovered. Adding common endpoints as fallback.");
                validGetEndpoints.add("/");
                validGetEndpoints.add("/api/**");
                validGetEndpoints.add("/**");
            }
        } catch (Exception e) {
            logger.error("Error discovering endpoints", e);
        }
    }

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
            // Return empty set if method not found or fails
        }

        return patterns;
    }

    private Set<String> extractPatternsFromString(RequestMappingInfo mappingInfo) {
        Set<String> patterns = new HashSet<>();
        try {
            String infoString = mappingInfo.toString();
            if (infoString.contains("{")) {
                String patternsSection =
                        infoString.substring(infoString.indexOf("{") + 1, infoString.indexOf("}"));

                for (String pattern : patternsSection.split(",")) {
                    pattern = pattern.trim();
                    if (!pattern.isEmpty()) {
                        patterns.add(pattern);
                    }
                }
            }
        } catch (Exception e) {
            // Return empty set if parsing fails
        }
        return patterns;
    }

    public boolean isValidGetEndpoint(String uri) {
        if (!endpointsDiscovered) {
            discoverEndpoints();
            endpointsDiscovered = true;
        }

        if (validGetEndpoints.contains(uri)) {
            return true;
        }

        if (matchesWildcardOrPathVariable(uri)) {
            return true;
        }

        if (matchesPathSegments(uri)) {
            return true;
        }

        return false;
    }

    private boolean matchesWildcardOrPathVariable(String uri) {
        for (String pattern : validGetEndpoints) {
            if (pattern.contains("*") || pattern.contains("{")) {
                int wildcardIndex = pattern.indexOf('*');
                int variableIndex = pattern.indexOf('{');

                int cutoffIndex;
                if (wildcardIndex < 0) {
                    cutoffIndex = variableIndex;
                } else if (variableIndex < 0) {
                    cutoffIndex = wildcardIndex;
                } else {
                    cutoffIndex = Math.min(wildcardIndex, variableIndex);
                }

                String staticPrefix = pattern.substring(0, cutoffIndex);

                if (uri.startsWith(staticPrefix)) {
                    return true;
                }
            }
        }
        return false;
    }

    private boolean matchesPathSegments(String uri) {
        for (String pattern : validGetEndpoints) {
            if (!pattern.contains("*") && !pattern.contains("{")) {
                String[] patternSegments = pattern.split("/");
                String[] uriSegments = uri.split("/");

                if (uriSegments.length < patternSegments.length) {
                    continue;
                }

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
        return false;
    }

    public Set<String> getValidGetEndpoints() {
        if (!endpointsDiscovered) {
            discoverEndpoints();
            endpointsDiscovered = true;
        }
        return new HashSet<>(validGetEndpoints);
    }

    private void logAllEndpoints() {
        Set<String> sortedEndpoints = new TreeSet<>(validGetEndpoints);

        logger.info("=== BEGIN: All discovered GET endpoints ===");
        for (String endpoint : sortedEndpoints) {
            logger.info("Endpoint: {}", endpoint);
        }
        logger.info("=== END: All discovered GET endpoints ===");
    }
}

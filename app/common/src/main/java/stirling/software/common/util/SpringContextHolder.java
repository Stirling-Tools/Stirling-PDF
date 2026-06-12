package stirling.software.common.util;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.enterprise.inject.literal.NamedLiteral;

import io.quarkus.arc.Arc;
import io.quarkus.arc.ArcContainer;

import lombok.extern.slf4j.Slf4j;

/**
 * Utility class to access CDI managed beans from non-CDI managed classes. This is especially useful
 * for classes that are instantiated by frameworks or created dynamically.
 */
@ApplicationScoped
@Slf4j
public class SpringContextHolder {

    /**
     * Get a CDI bean by class type
     *
     * @param <T> The bean type
     * @param beanClass The bean class
     * @return The bean instance, or null if not found
     */
    public static <T> T getBean(Class<T> beanClass) {
        ArcContainer container = Arc.container();
        if (container == null || !container.isRunning()) {
            log.warn(
                    "CDI container not initialized when attempting to get bean of type {}",
                    beanClass.getName());
            return null;
        }

        try {
            Instance<T> instance = container.select(beanClass);
            if (!instance.isResolvable()) {
                log.error("Error getting bean of type {}: bean is not resolvable", beanClass.getName());
                return null;
            }
            return instance.get();
        } catch (RuntimeException e) {
            log.error("Error getting bean of type {}: {}", beanClass.getName(), e.getMessage());
            return null;
        }
    }

    /**
     * Get a CDI bean by name
     *
     * @param <T> The bean type
     * @param beanName The bean name
     * @return The bean instance, or null if not found
     */
    public static <T> T getBean(String beanName) {
        ArcContainer container = Arc.container();
        if (container == null || !container.isRunning()) {
            log.warn("CDI container not initialized when attempting to get bean '{}'", beanName);
            return null;
        }

        try {
            // TODO: Migration required - Spring looked up by bean name across all types; here we
            // resolve a @Named CDI bean of Object.class. Verify named beans are registered with a
            // matching @jakarta.inject.Named qualifier so this lookup resolves the intended bean.
            Instance<Object> instance =
                    container.select(Object.class, NamedLiteral.of(beanName));
            if (!instance.isResolvable()) {
                log.error("Error getting bean '{}': bean is not resolvable", beanName);
                return null;
            }
            @SuppressWarnings("unchecked")
            T bean = (T) instance.get();
            return bean;
        } catch (RuntimeException e) {
            log.error("Error getting bean '{}': {}", beanName, e.getMessage());
            return null;
        }
    }

    /**
     * Check if the CDI container is initialized
     *
     * @return true if initialized, false otherwise
     */
    public static boolean isInitialized() {
        ArcContainer container = Arc.container();
        return container != null && container.isRunning();
    }
}

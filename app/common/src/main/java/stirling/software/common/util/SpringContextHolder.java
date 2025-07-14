package stirling.software.common.util;

import org.springframework.beans.BeansException;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationContextAware;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Utility class to access Spring managed beans from non-Spring managed classes. This is especially
 * useful for classes that are instantiated by frameworks or created dynamically.
 */
@Component
@Slf4j
public class SpringContextHolder implements ApplicationContextAware {

    private static ApplicationContext applicationContext;

    @Override
    public void setApplicationContext(ApplicationContext applicationContext) throws BeansException {
        SpringContextHolder.applicationContext = applicationContext;
        log.debug("Spring context holder initialized");
    }

    /**
     * Get a Spring bean by class type
     *
     * @param <T> The bean type
     * @param beanClass The bean class
     * @return The bean instance, or null if not found
     */
    public static <T> T getBean(Class<T> beanClass) {
        if (applicationContext == null) {
            log.warn(
                    "Application context not initialized when attempting to get bean of type {}",
                    beanClass.getName());
            return null;
        }

        try {
            return applicationContext.getBean(beanClass);
        } catch (BeansException e) {
            log.error("Error getting bean of type {}: {}", beanClass.getName(), e.getMessage());
            return null;
        }
    }

    /**
     * Get a Spring bean by name
     *
     * @param <T> The bean type
     * @param beanName The bean name
     * @return The bean instance, or null if not found
     */
    public static <T> T getBean(String beanName) {
        if (applicationContext == null) {
            log.warn(
                    "Application context not initialized when attempting to get bean '{}'",
                    beanName);
            return null;
        }

        try {
            @SuppressWarnings("unchecked")
            T bean = (T) applicationContext.getBean(beanName);
            return bean;
        } catch (BeansException e) {
            log.error("Error getting bean '{}': {}", beanName, e.getMessage());
            return null;
        }
    }

    /**
     * Check if the application context is initialized
     *
     * @return true if initialized, false otherwise
     */
    public static boolean isInitialized() {
        return applicationContext != null;
    }
}

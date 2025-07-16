package stirling.software.common.util;

import org.springframework.beans.BeansException;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationContextAware;
import org.springframework.stereotype.Component;

/**
 * Helper class that provides access to the ApplicationContext. Useful for getting beans in classes
 * that are not managed by Spring.
 */
@Component
public class ApplicationContextProvider implements ApplicationContextAware {

    private static ApplicationContext applicationContext;

    @Override
    public void setApplicationContext(ApplicationContext context) throws BeansException {
        applicationContext = context;
    }

    /**
     * Get a bean by class type.
     *
     * @param <T> The type of the bean
     * @param beanClass The class of the bean
     * @return The bean instance, or null if not found
     */
    public static <T> T getBean(Class<T> beanClass) {
        if (applicationContext == null) {
            return null;
        }
        try {
            return applicationContext.getBean(beanClass);
        } catch (BeansException e) {
            return null;
        }
    }

    /**
     * Get a bean by name and class type.
     *
     * @param <T> The type of the bean
     * @param name The name of the bean
     * @param beanClass The class of the bean
     * @return The bean instance, or null if not found
     */
    public static <T> T getBean(String name, Class<T> beanClass) {
        if (applicationContext == null) {
            return null;
        }
        try {
            return applicationContext.getBean(name, beanClass);
        } catch (BeansException e) {
            return null;
        }
    }

    /**
     * Check if a bean of the specified type exists.
     *
     * @param beanClass The class of the bean
     * @return true if the bean exists, false otherwise
     */
    public static boolean containsBean(Class<?> beanClass) {
        if (applicationContext == null) {
            return false;
        }
        try {
            applicationContext.getBean(beanClass);
            return true;
        } catch (BeansException e) {
            return false;
        }
    }
}

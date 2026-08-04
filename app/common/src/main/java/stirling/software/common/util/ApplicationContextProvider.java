package stirling.software.common.util;

import io.quarkus.arc.Arc;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.enterprise.inject.literal.NamedLiteral;

/**
 * Helper class that provides access to the CDI container. Useful for getting beans in classes that
 * are not managed by CDI.
 */
@ApplicationScoped
public class ApplicationContextProvider {

    /**
     * Get a bean by class type.
     *
     * @param <T> The type of the bean
     * @param beanClass The class of the bean
     * @return The bean instance, or null if not found
     */
    public static <T> T getBean(Class<T> beanClass) {
        if (Arc.container() == null) {
            return null;
        }
        try {
            Instance<T> instance = Arc.container().select(beanClass);
            if (instance.isResolvable()) {
                return instance.get();
            }
            return null;
        } catch (RuntimeException e) {
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
        if (Arc.container() == null) {
            return null;
        }
        try {
            Instance<T> instance = Arc.container().select(beanClass, NamedLiteral.of(name));
            if (instance.isResolvable()) {
                return instance.get();
            }
            return null;
        } catch (RuntimeException e) {
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
        if (Arc.container() == null) {
            return false;
        }
        try {
            return Arc.container().select(beanClass).isResolvable();
        } catch (RuntimeException e) {
            return false;
        }
    }
}

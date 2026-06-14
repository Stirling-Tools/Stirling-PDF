package stirling.software.common.testsupport;

import java.lang.reflect.Field;

/**
 * Minimal replacement for Spring's {@code org.springframework.test.util.ReflectionTestUtils},
 * provided so migrated tests can set/read private fields without the spring-test dependency. Only
 * the instance {@code setField}/{@code getField} forms the test suite uses are implemented; field
 * lookup walks the superclass chain like the Spring original.
 */
public final class ReflectionTestUtils {

    private ReflectionTestUtils() {}

    public static void setField(Object target, String name, Object value) {
        try {
            Field field = findField(target.getClass(), name);
            field.setAccessible(true);
            field.set(target, value);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException("Failed to set field '" + name + "'", e);
        }
    }

    public static Object getField(Object target, String name) {
        try {
            Field field = findField(target.getClass(), name);
            field.setAccessible(true);
            return field.get(target);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException("Failed to read field '" + name + "'", e);
        }
    }

    private static Field findField(Class<?> type, String name) throws NoSuchFieldException {
        for (Class<?> current = type; current != null; current = current.getSuperclass()) {
            try {
                return current.getDeclaredField(name);
            } catch (NoSuchFieldException ignored) {
                // walk up
            }
        }
        throw new NoSuchFieldException(
                name + " (searched " + type.getName() + " and superclasses)");
    }
}

package stirling.software.proprietary.failure;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;

import org.junit.jupiter.api.Test;

import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.ExceptionUtils.ErrorCode;
import stirling.software.common.util.ExceptionUtils.ErrorCodeProvider;

/**
 * Every code a kind claims must come out of some {@link ExceptionUtils} factory as an {@link
 * ErrorCodeProvider}: a plain exception with the code's message reaches a handler that adds none.
 */
class ClaimedErrorCodesAreEmittableTest {

    /**
     * Codes a factory only produces for particular input, which the type-default arguments below
     * cannot supply. Each names the input that selects the code, so the entry is itself the proof.
     */
    private static final Map<String, Supplier<Throwable>> SELECTED_BY_CONTENT =
            Map.of(
                    // GHOSTSCRIPT_PAGE_DRAWING is recognised from the tool's output, not chosen.
                    "E054",
                    () ->
                            ExceptionUtils.createGhostscriptCompressionException(
                                    "Page drawing error"));

    @Test
    void everyCodeAKindClaimsIsCarriedBySomeException() {
        Set<String> emitted = codesEmittedByGenericInvocation();
        SELECTED_BY_CONTENT.forEach(
                (code, factory) -> {
                    Throwable thrown = factory.get();
                    assertThat(thrown)
                            .as("the content-selected factory for %s", code)
                            .isInstanceOf(ErrorCodeProvider.class);
                    emitted.add(((ErrorCodeProvider) thrown).getErrorCode());
                });

        List<String> unreachable = new ArrayList<>();
        for (FailureKind kind : FailureKind.values()) {
            for (String code : kind.getErrorCodes()) {
                if (!emitted.contains(code)) {
                    unreachable.add(
                            kind.getId() + " claims " + code + " (" + constantFor(code) + ")");
                }
            }
        }
        assertThat(unreachable)
                .as(
                        "codes no ExceptionUtils factory emits as an ErrorCodeProvider; give the"
                                + " factory a coded type, or stop claiming the code")
                .isEmpty();
    }

    /**
     * Every public static {@code create*} factory, called with type defaults. One this cannot call
     * is skipped: it proves nothing, and a code only it emits fails the assertion above.
     */
    private static Set<String> codesEmittedByGenericInvocation() {
        Set<String> emitted = new HashSet<>();
        for (Method method : ExceptionUtils.class.getMethods()) {
            if (!Modifier.isStatic(method.getModifiers())
                    || !method.getName().startsWith("create")
                    || !Throwable.class.isAssignableFrom(method.getReturnType())) {
                continue;
            }
            Object[] args = defaultsFor(method.getParameterTypes());
            if (args == null) {
                continue;
            }
            try {
                if (method.invoke(null, args) instanceof ErrorCodeProvider provider) {
                    emitted.add(provider.getErrorCode());
                }
            } catch (ReflectiveOperationException | RuntimeException notInvokable) {
                // Left out on purpose; see the method comment.
            }
        }
        return emitted;
    }

    private static Object[] defaultsFor(Class<?>[] types) {
        Object[] args = new Object[types.length];
        for (int i = 0; i < types.length; i++) {
            args[i] = defaultFor(types[i]);
            if (args[i] == null && types[i] != Object[].class) {
                return null;
            }
        }
        return args;
    }

    private static Object defaultFor(Class<?> type) {
        if (type == String.class) return "x";
        if (type == int.class || type == Integer.class) return 1;
        if (type == long.class || type == Long.class) return 1L;
        if (type == double.class || type == Double.class) return 1.0;
        if (type == boolean.class || type == Boolean.class) return false;
        if (type == Object[].class) return new Object[0];
        if (type == List.class || type == Collection.class) return List.of();
        if (Throwable.class.isAssignableFrom(type)) return throwableOf(type);
        return null;
    }

    private static Throwable throwableOf(Class<?> type) {
        try {
            return (Throwable) type.getConstructor(String.class).newInstance("x");
        } catch (ReflectiveOperationException noStringConstructor) {
            try {
                return (Throwable) type.getConstructor().newInstance();
            } catch (ReflectiveOperationException none) {
                return null;
            }
        }
    }

    private static String constantFor(String code) {
        return Arrays.stream(ErrorCode.values())
                .filter(constant -> constant.getCode().equals(code))
                .map(Enum::name)
                .findFirst()
                .orElse("no ErrorCode constant");
    }
}

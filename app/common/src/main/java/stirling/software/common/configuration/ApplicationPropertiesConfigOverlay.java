package stirling.software.common.configuration;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.util.List;

import org.eclipse.microprofile.config.Config;
import org.eclipse.microprofile.config.ConfigProvider;

import io.quarkus.arc.ClientProxy;
import io.quarkus.runtime.StartupEvent;

import jakarta.annotation.Priority;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import jakarta.interceptor.Interceptor;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

/**
 * Binds MicroProfile/Quarkus config (env vars, {@code settings.yml} via {@link
 * SettingsYamlConfigSource}, {@code application.properties}, system properties) onto the mutable
 * {@link ApplicationProperties} bean at startup - the Quarkus replacement for the Spring
 * {@code @ConfigurationProperties(prefix = "")} relaxed binding that was lost in the migration.
 *
 * <p>Rather than hand-listing each property, this walks the whole {@code ApplicationProperties}
 * object graph by reflection and, for every scalar / enum / scalar-list field, applies the value
 * from config when one is present (so unset fields keep their Java default). The dotted key for a
 * field mirrors its path in the tree ({@code security.oauth2.client.keycloak.clientId}, {@code
 * endpoints.toRemove}, ...); SmallRye then resolves it from any source - e.g. env var {@code
 * SECURITY_OAUTH2_CLIENT_KEYCLOAK_CLIENTID} or the same key in {@code settings.yml} - with the
 * usual precedence (sys props &gt; env &gt; settings.yml &gt; application.properties).
 *
 * <p>This is the behaviour Spring had: every settings.yml / {@code SECURITY_*}/{@code STORAGE_*}
 * /{@code PREMIUM_*} value is honoured, fixing the whole {@code maxDPI=0} / {@code enableLogin}
 * /{@code endpoints.toRemove} / premium-license class of "ignored config" bugs at once.
 *
 * <p>Runs with {@code @Priority(APPLICATION)} so it completes before startup consumers read the
 * bean: {@code InitialSecuritySetup} (enableLogin / customGlobalAPIKey), {@code
 * EndpointConfiguration} (endpoints.toRemove), and {@code LicenseKeyChecker.onApplicationReady}
 * (premium.enabled / premium.key, which has the lower default observer priority 2500).
 *
 * <p>Values are never logged - only key names at DEBUG and a total at INFO - because the tree
 * carries secrets (premium key, client secrets, initial-login password, SMTP/Telegram tokens).
 */
@Slf4j
@ApplicationScoped
public class ApplicationPropertiesConfigOverlay {

    private static final int MAX_DEPTH = 20;

    @Inject ApplicationProperties applicationProperties;

    void onStart(@Observes @Priority(Interceptor.Priority.APPLICATION) StartupEvent event) {
        Config config = ConfigProvider.getConfig();
        // ApplicationProperties is @ApplicationScoped, so the injected reference is a client proxy;
        // reflect over the real contextual instance (its getters delegate, but getDeclaredFields()
        // on the proxy would not see the model fields).
        Object root = applicationProperties;
        if (root instanceof ClientProxy proxy) {
            root = proxy.arc_contextualInstance();
        }
        int[] applied = {0};
        bind(root, "", config, 0, applied);
        log.info(
                "Applied {} configuration override(s) onto ApplicationProperties"
                        + " (settings.yml + environment)",
                applied[0]);
    }

    private void bind(Object node, String prefix, Config config, int depth, int[] applied) {
        if (node == null || depth > MAX_DEPTH) {
            return;
        }
        for (Field field : node.getClass().getDeclaredFields()) {
            int mods = field.getModifiers();
            if (Modifier.isStatic(mods) || field.isSynthetic()) {
                continue;
            }
            String key = prefix.isEmpty() ? field.getName() : prefix + "." + field.getName();
            Class<?> type = field.getType();
            try {
                field.setAccessible(true);
                if (isModelType(type)) {
                    Object child = field.get(node);
                    if (child == null) {
                        child = instantiate(type);
                        if (child != null) {
                            field.set(node, child);
                        }
                    }
                    bind(child, key, config, depth + 1, applied);
                } else if (List.class.isAssignableFrom(type)) {
                    Class<?> element = listElementType(field);
                    if (element != null && isLeaf(element)) {
                        config.getOptionalValues(key, element)
                                .ifPresent(value -> apply(field, node, value, key, applied));
                    }
                    // List<model-type> has no flat scalar representation here - skip.
                } else if (isLeaf(type)) {
                    config.getOptionalValue(key, box(type))
                            .ifPresent(value -> apply(field, node, value, key, applied));
                }
                // Maps and other container/unsupported types are left to their Java defaults.
            } catch (Exception ex) {
                // Per-field best effort: an unconvertible value or inaccessible field must not
                // abort
                // the whole overlay. Never include the value (may be a secret).
                log.debug("Skipped config binding for {} ({})", key, ex.toString());
            }
        }
    }

    private void apply(Field field, Object node, Object value, String key, int[] applied) {
        try {
            field.set(node, value);
            applied[0]++;
            // Key name only - the value may be a secret (license key, password, client secret).
            log.debug("Applied config override: {}", key);
        } catch (Exception ex) {
            log.debug("Failed to set {} ({})", key, ex.toString());
        }
    }

    private static boolean isModelType(Class<?> type) {
        return type.getName().startsWith("stirling.software") && !type.isEnum();
    }

    private static boolean isLeaf(Class<?> type) {
        return type == String.class
                || type.isEnum()
                || type.isPrimitive()
                || type == Boolean.class
                || type == Integer.class
                || type == Long.class
                || type == Double.class
                || type == Float.class
                || type == Short.class
                || type == Byte.class;
    }

    private static Class<?> box(Class<?> type) {
        if (!type.isPrimitive()) {
            return type;
        }
        if (type == boolean.class) {
            return Boolean.class;
        }
        if (type == int.class) {
            return Integer.class;
        }
        if (type == long.class) {
            return Long.class;
        }
        if (type == double.class) {
            return Double.class;
        }
        if (type == float.class) {
            return Float.class;
        }
        if (type == short.class) {
            return Short.class;
        }
        if (type == byte.class) {
            return Byte.class;
        }
        return type;
    }

    private static Class<?> listElementType(Field field) {
        Type generic = field.getGenericType();
        if (generic instanceof ParameterizedType parameterized) {
            Type[] args = parameterized.getActualTypeArguments();
            if (args.length == 1 && args[0] instanceof Class<?> element) {
                return element;
            }
        }
        return null;
    }

    private static Object instantiate(Class<?> type) {
        try {
            return type.getDeclaredConstructor().newInstance();
        } catch (Exception ex) {
            return null;
        }
    }
}

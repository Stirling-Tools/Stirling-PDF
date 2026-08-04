package stirling.software.common.configuration;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.eclipse.microprofile.config.spi.ConfigSource;
import org.snakeyaml.engine.v2.api.Load;
import org.snakeyaml.engine.v2.api.LoadSettings;

/**
 * Exposes {@code settings.yml} (and {@code custom_settings.yml}, with the bundled {@code
 * settings.yml.template} as the default fallback) as a MicroProfile/SmallRye {@link ConfigSource}.
 *
 * <p>Restores the Spring {@code @ConfigurationProperties} behaviour that bound {@code settings.yml}
 * into {@code ApplicationProperties}: without this the YAML was never read under Quarkus, so flags
 * like {@code security.enableLogin} fell back to their Java defaults regardless of the file (the
 * {@code enableLogin=false}/{@code maxDPI=0}/{@code loginAttemptCount=0} class of bugs). The nested
 * YAML is flattened to dotted keys ({@code security.enableLogin -> "true"}); {@link
 * ApplicationPropertiesConfigOverlay} and {@code @ConfigProperty} injections then read them.
 *
 * <p>Ordinal {@value #ORDINAL} sits above {@code application.properties} (250) but below
 * environment variables (300) and system properties (400), matching Spring's precedence - e.g.
 * {@code SECURITY_ENABLELOGIN} still overrides the file.
 *
 * <p>Registered via {@code META-INF/services/org.eclipse.microprofile.config.spi.ConfigSource}.
 */
public class SettingsYamlConfigSource implements ConfigSource {

    private static final int ORDINAL = 275;

    private final Map<String, String> properties;

    public SettingsYamlConfigSource() {
        this.properties = load();
    }

    private static Map<String, String> load() {
        Map<String, String> flat = new HashMap<>();
        // 1. Bundled template provides the defaults (e.g. security.enableLogin: true).
        try (InputStream in =
                SettingsYamlConfigSource.class
                        .getClassLoader()
                        .getResourceAsStream("settings.yml.template")) {
            if (in != null) {
                flatten("", loadYaml(in), flat);
            }
        } catch (Exception ignored) {
            // best effort - fall through to file overrides / Java defaults
        }
        // 2. The user's settings.yml overrides the template.
        mergeFile(InstallationPathConfig.getSettingsPath(), flat);
        // 3. custom_settings.yml overrides settings.yml.
        mergeFile(InstallationPathConfig.getCustomSettingsPath(), flat);
        return flat;
    }

    private static void mergeFile(String path, Map<String, String> flat) {
        try {
            Path p = Path.of(path);
            if (Files.isRegularFile(p)) {
                try (InputStream in = Files.newInputStream(p)) {
                    flatten("", loadYaml(in), flat);
                }
            }
        } catch (Exception ignored) {
            // unreadable/invalid file - keep whatever defaults were already loaded
        }
    }

    private static Object loadYaml(InputStream in) {
        return new Load(LoadSettings.builder().build()).loadFromInputStream(in);
    }

    private static void flatten(String prefix, Object node, Map<String, String> out) {
        if (node instanceof Map<?, ?> map) {
            for (Map.Entry<?, ?> e : map.entrySet()) {
                String key =
                        prefix.isEmpty() ? String.valueOf(e.getKey()) : prefix + "." + e.getKey();
                flatten(key, e.getValue(), out);
            }
        } else if (node instanceof List<?> list) {
            // Emit scalar lists as a comma-separated value so SmallRye binds them via
            // config.getValues()/getOptionalValues() (e.g. endpoints.toRemove, consumed by
            // EndpointConfiguration to disable endpoints). Lists containing maps/nested lists have
            // no
            // flat scalar form, so skip those - their consumers read them structurally, not through
            // this overlay. The scalar lists here (endpoint names, group names) contain no commas,
            // so
            // a plain join round-trips cleanly.
            boolean scalarList =
                    !list.isEmpty()
                            && list.stream()
                                    .allMatch(
                                            e ->
                                                    e != null
                                                            && !(e instanceof Map)
                                                            && !(e instanceof List));
            if (scalarList) {
                out.put(
                        prefix,
                        list.stream()
                                .map(String::valueOf)
                                .collect(java.util.stream.Collectors.joining(",")));
            }
            return;
        } else if (node != null) {
            out.put(prefix, String.valueOf(node));
        }
        // null leaves are left unset so the Java default applies.
    }

    @Override
    public Map<String, String> getProperties() {
        return properties;
    }

    @Override
    public Set<String> getPropertyNames() {
        return properties.keySet();
    }

    @Override
    public String getValue(String propertyName) {
        return properties.get(propertyName);
    }

    @Override
    public String getName() {
        return "settings.yml";
    }

    @Override
    public int getOrdinal() {
        return ORDINAL;
    }
}

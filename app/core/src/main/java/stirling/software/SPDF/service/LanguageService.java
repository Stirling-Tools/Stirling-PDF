package stirling.software.SPDF.service;

import java.io.File;
import java.io.IOException;
import java.net.URL;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Enumeration;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;
import java.util.stream.Collectors;

import jakarta.enterprise.context.ApplicationScoped;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.io.ClassPathResource;
import stirling.software.common.model.io.Resource;

@ApplicationScoped
@Slf4j
public class LanguageService {

    private final ApplicationProperties applicationProperties;

    public LanguageService(ApplicationProperties applicationProperties) {
        this.applicationProperties = applicationProperties;
    }

    public Set<String> getSupportedLanguages() {
        try {
            Resource[] resources = getResourcesFromPattern("classpath*:messages_*.properties");

            return Arrays.stream(resources)
                    .map(Resource::getFilename)
                    .filter(
                            filename ->
                                    filename != null
                                            && filename.startsWith("messages_")
                                            && filename.endsWith(".properties"))
                    .map(filename -> filename.replace("messages_", "").replace(".properties", ""))
                    .filter(
                            languageCode -> {
                                Set<String> allowedLanguages =
                                        new HashSet<>(applicationProperties.getUi().getLanguages());
                                // Empty list means all languages are allowed (no filtering)
                                // Non-empty list acts as a strict whitelist
                                return allowedLanguages.isEmpty()
                                        || allowedLanguages.contains(languageCode);
                            })
                    .collect(Collectors.toSet());

        } catch (IOException e) {
            log.error("Error retrieving supported languages", e);
            return new HashSet<>();
        }
    }

    // Protected method to allow overriding in tests.
    // Replaces Spring's PathMatchingResourcePatternResolver: scans every classpath root for
    // resources whose filename matches the "messages_*.properties" pattern, supporting both
    // exploded directories and packaged jars (mirrors the "classpath*:" wildcard semantics).
    protected Resource[] getResourcesFromPattern(String pattern) throws IOException {
        String prefix = "messages_";
        String suffix = ".properties";

        Set<String> filenames = new HashSet<>();
        ClassLoader classLoader = Thread.currentThread().getContextClassLoader();
        if (classLoader == null) {
            classLoader = LanguageService.class.getClassLoader();
        }

        // Enumerate every classpath root ("" resolves to each root URL on the classpath).
        Enumeration<URL> roots = classLoader.getResources("");
        List<Resource> resources = new ArrayList<>();
        while (roots.hasMoreElements()) {
            URL root = roots.nextElement();
            collectFromUrl(root, prefix, suffix, filenames);
        }

        // Also inspect any jars that contain a resource at the classpath root level so that
        // messages bundles shipped inside dependency/application jars are picked up.
        Enumeration<URL> markerRoots = classLoader.getResources(prefix);
        while (markerRoots.hasMoreElements()) {
            collectFromUrl(markerRoots.nextElement(), prefix, suffix, filenames);
        }

        for (String filename : filenames) {
            resources.add(new ClassPathResource(filename));
        }
        return resources.toArray(new Resource[0]);
    }

    private void collectFromUrl(URL root, String prefix, String suffix, Set<String> filenames)
            throws IOException {
        String protocol = root.getProtocol();
        if ("file".equals(protocol)) {
            File dir = new File(URLDecoder.decode(root.getFile(), StandardCharsets.UTF_8));
            String[] entries = dir.list();
            if (entries != null) {
                for (String name : entries) {
                    if (name.startsWith(prefix) && name.endsWith(suffix)) {
                        filenames.add(name);
                    }
                }
            }
        } else if ("jar".equals(protocol)) {
            collectFromJar(root, prefix, suffix, filenames);
        }
    }

    private void collectFromJar(URL root, String prefix, String suffix, Set<String> filenames) {
        String path = root.getPath();
        // jar URL form: file:/path/to/lib.jar!/some/entry
        int bang = path.indexOf("!/");
        if (bang < 0) {
            return;
        }
        String jarPath = path.substring(0, bang);
        if (jarPath.startsWith("file:")) {
            jarPath = jarPath.substring("file:".length());
        }
        jarPath = URLDecoder.decode(jarPath, StandardCharsets.UTF_8);
        try (JarFile jarFile = new JarFile(jarPath)) {
            Enumeration<JarEntry> entries = jarFile.entries();
            while (entries.hasMoreElements()) {
                String name = entries.nextElement().getName();
                int sep = name.lastIndexOf('/');
                String simpleName = sep != -1 ? name.substring(sep + 1) : name;
                if (simpleName.startsWith(prefix) && simpleName.endsWith(suffix)) {
                    filenames.add(simpleName);
                }
            }
        } catch (IOException e) {
            log.warn("Unable to scan jar [{}] for message bundles", jarPath, e);
        }
    }
}

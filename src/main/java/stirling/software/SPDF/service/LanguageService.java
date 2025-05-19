package stirling.software.SPDF.service;

import java.io.IOException;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.ApplicationProperties;

@Service
@Slf4j
public class LanguageService {

    private final ApplicationProperties applicationProperties;
    private final PathMatchingResourcePatternResolver resourcePatternResolver =
            new PathMatchingResourcePatternResolver();

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
                                return allowedLanguages.isEmpty()
                                        || allowedLanguages.contains(languageCode)
                                        || "en_GB".equals(languageCode);
                            })
                    .collect(Collectors.toSet());

        } catch (IOException e) {
            log.error("Error retrieving supported languages", e);
            return new HashSet<>();
        }
    }

    // Protected method to allow overriding in tests
    protected Resource[] getResourcesFromPattern(String pattern) throws IOException {
        return resourcePatternResolver.getResources(pattern);
    }
}

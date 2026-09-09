package stirling.software.proprietary.classification;

import java.io.InputStream;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.classification.model.ClassificationLabel;
import stirling.software.proprietary.classification.model.ClassificationLabels;

import tools.jackson.databind.ObjectMapper;

/**
 * Supplies the classification vocabulary the classify tool sends to the AI engine. The set is a
 * fixed, built-in list bundled with the application ({@code
 * classification/classification-labels.json}) and shared by everyone — there is no per-team
 * customization or database. Loaded once at startup.
 */
@Slf4j
@Component
public class ClassificationLabelProvider {

    private static final String RESOURCE = "classification/classification-labels.json";

    private final List<ClassificationLabel> labels;

    // Explicit @Autowired: the class has a second (private) constructor for tests, so Spring
    // can't infer which to use without it.
    @Autowired
    public ClassificationLabelProvider(ObjectMapper objectMapper) {
        this(load(objectMapper));
    }

    private ClassificationLabelProvider(List<ClassificationLabel> labels) {
        this.labels = List.copyOf(labels);
    }

    /** Build a provider with an explicit label set (tests). */
    public static ClassificationLabelProvider withLabels(List<ClassificationLabel> labels) {
        return new ClassificationLabelProvider(labels);
    }

    /** The built-in vocabulary, in file order. */
    public List<ClassificationLabel> labels() {
        return labels;
    }

    private static List<ClassificationLabel> load(ObjectMapper objectMapper) {
        try (InputStream in = new ClassPathResource(RESOURCE).getInputStream()) {
            ClassificationLabels parsed = objectMapper.readValue(in, ClassificationLabels.class);
            return parsed.labels();
        } catch (Exception e) {
            log.error("Failed to load classification labels from {}", RESOURCE, e);
            return List.of();
        }
    }
}

package stirling.software.proprietary.formdetection.catalog;

import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.formdetection.model.ModelCatalogEntry;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

/** Loads the curated Auto Form Detection model catalog from a bundled JSON resource. */
@Slf4j
@Service
@RequiredArgsConstructor
public class ModelCatalogService {

    private static final String CATALOG_RESOURCE = "formdetection/model-catalog.json";

    private final ObjectMapper objectMapper;

    private volatile List<ModelCatalogEntry> entries = List.of();
    private volatile Map<String, ModelCatalogEntry> byId = Map.of();

    @PostConstruct
    void load() {
        try (InputStream is = new ClassPathResource(CATALOG_RESOURCE).getInputStream()) {
            List<ModelCatalogEntry> loaded =
                    objectMapper.readValue(is, new TypeReference<List<ModelCatalogEntry>>() {});
            Map<String, ModelCatalogEntry> map = new LinkedHashMap<>();
            for (ModelCatalogEntry entry : loaded) {
                if (entry.getId() != null && !entry.getId().isBlank()) {
                    map.put(entry.getId(), entry);
                }
            }
            this.entries = List.copyOf(map.values());
            this.byId = Map.copyOf(map);
            log.info("Loaded {} Auto Form Detection model catalog entries", entries.size());
        } catch (Exception e) {
            log.error(
                    "Failed to load Auto Form Detection model catalog from {}",
                    CATALOG_RESOURCE,
                    e);
        }
    }

    public List<ModelCatalogEntry> getAll() {
        return entries;
    }

    public Optional<ModelCatalogEntry> getById(String id) {
        return Optional.ofNullable(id == null ? null : byId.get(id));
    }
}

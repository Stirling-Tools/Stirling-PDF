package stirling.software.proprietary.formdetection.catalog;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.formdetection.model.ModelCatalogEntry;

import tools.jackson.databind.json.JsonMapper;

class ModelCatalogServiceTest {

    @Test
    void loadsBundledCatalogWithSpecDefaults() {
        ModelCatalogService service = new ModelCatalogService(JsonMapper.builder().build());
        service.load();

        List<ModelCatalogEntry> all = service.getAll();
        assertTrue(all.size() >= 2, "catalog should ship with at least two entries");
        assertTrue(service.getById("ffdnet-s").isPresent());

        ModelCatalogEntry l = service.getById("ffdnet-l").orElseThrow();
        assertEquals(3, l.getClassNames().size());
        assertEquals(3, l.getClassFieldTypes().size());
        assertTrue(l.getInputSize() > 0);

        // Model-free distribution: the jar bundles no weights. Every entry instead carries a
        // download URL and a SHA-256 so the model is fetched and integrity-verified on demand.
        for (ModelCatalogEntry e : all) {
            assertNotNull(e.getOnnxUrl(), e.getId() + " must declare a download URL");
            assertFalse(e.getOnnxUrl().isBlank(), e.getId() + " must declare a download URL");
            assertNotNull(e.getSha256(), e.getId() + " must declare a SHA-256 checksum");
            assertFalse(e.getSha256().isBlank(), e.getId() + " must declare a SHA-256 checksum");
        }
    }

    @Test
    void unknownIdReturnsEmpty() {
        ModelCatalogService service = new ModelCatalogService(JsonMapper.builder().build());
        service.load();
        assertTrue(service.getById("does-not-exist").isEmpty());
        assertTrue(service.getById(null).isEmpty());
    }
}

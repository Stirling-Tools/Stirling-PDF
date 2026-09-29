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

        // Weights are fetched on demand, so a URL without a SHA-256 would download unverified.
        // Neither field set is fine: the admin panel renders that entry as not-installable.
        for (ModelCatalogEntry e : all) {
            assertNotNull(e.getOnnxUrl(), e.getId() + " must declare a URL field, even if blank");
            assertNotNull(e.getSha256(), e.getId() + " must declare a checksum");
            if (!e.getOnnxUrl().isBlank()) {
                assertFalse(
                        e.getSha256().isBlank(),
                        e.getId() + " declares a download URL so it must declare a SHA-256");
            }
        }
        assertTrue(
                all.stream().anyMatch(e -> !e.getOnnxUrl().isBlank()),
                "at least one entry must actually be installable");
    }

    @Test
    void ffdetrIsTheApacheLicensedEntryAndUsesTheQueryHeadDecoder() {
        ModelCatalogService service = new ModelCatalogService(JsonMapper.builder().build());
        service.load();

        ModelCatalogEntry ffdetr = service.getById("ffdetr").orElseThrow();
        assertEquals("rfdetr", ffdetr.getDecoder(), "FFDetr has a query head, not an anchor grid");
        assertEquals(1024, ffdetr.getInputSize());
        assertTrue(ffdetr.getLicense().startsWith("Apache-2.0"), ffdetr.getLicense());
        // RF-DETR expects ImageNet normalisation over RGB, unlike the FFDNet entries' /255 BGR.
        assertEquals("rgb", ffdetr.getChannelOrder());
        assertEquals(0.485f, ffdetr.getNormMean()[0], 1e-6);

        // The FFDNet entries keep the anchor-grid decoder; a wrong default here would silently
        // decode one family with the other's maths.
        assertEquals("yolo", service.getById("ffdnet-s").orElseThrow().getDecoder());
        assertEquals("yolo", service.getById("ffdnet-l").orElseThrow().getDecoder());
    }

    @Test
    void unknownIdReturnsEmpty() {
        ModelCatalogService service = new ModelCatalogService(JsonMapper.builder().build());
        service.load();
        assertTrue(service.getById("does-not-exist").isEmpty());
        assertTrue(service.getById(null).isEmpty());
    }
}

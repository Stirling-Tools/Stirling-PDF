package stirling.software.proprietary.formdetection.model;

import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Snapshot returned by {@code GET /api/v1/form/form-detection-model/status}. */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ModelStatusResponse {
    /** Wire state: not_installed | downloading | verifying | ready | failed. */
    private String status;

    /** Download progress 0-100 (meaningful while downloading). */
    private int progress;

    /** Id of the active/usable model, or blank when none. */
    private String activeModelId;

    /** Model ids usable right now: downloaded, plus any the image baked in. */
    private List<String> installed;

    /** Last error message, or null. */
    private String error;

    /** Whether the model directory is writable (admin install possible). */
    private boolean writable;

    /** Full curated catalog (identity + pipeline spec). */
    private List<ModelCatalogEntry> catalog;

    /** Master on/off for the whole feature (admin-controlled). */
    private boolean enabled;

    /** True when the ONNX engine is bundled in this build; without it detection cannot run. */
    private boolean serverEngineAvailable;

    private String downloadingModelId;
}

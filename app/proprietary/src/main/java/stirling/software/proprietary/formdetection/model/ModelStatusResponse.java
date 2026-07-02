package stirling.software.proprietary.formdetection.model;

import java.util.List;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Snapshot returned by {@code GET /api/v1/ai/form-detection-model/status}. Includes the full
 * catalog so the browser can read the active model's parity-critical pipeline spec.
 */
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

    /** Model ids that currently have an .onnx file on disk. */
    private List<String> installed;

    /** Last error message, or null. */
    private String error;

    /** Whether the model directory is writable (admin install possible). */
    private boolean writable;

    /** Full curated catalog (identity + pipeline spec). */
    private List<ModelCatalogEntry> catalog;

    /** Master on/off for the whole feature (admin-controlled). */
    private boolean enabled;

    /** Where detection runs: auto | browser | server. */
    private String executionMode;

    /** True if the server-side ONNX engine is bundled in this build (else only browser works). */
    private boolean serverEngineAvailable;
}

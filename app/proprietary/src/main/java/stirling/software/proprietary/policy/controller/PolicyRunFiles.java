package stirling.software.proprietary.policy.controller;

import java.util.ArrayList;
import java.util.List;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.Valid;

import lombok.Data;

/**
 * The files supplied to a policy run: the primary documents and any keyed supporting assets. Bound
 * from the multipart request via {@code @ModelAttribute}; the pipeline definition itself travels as
 * a separate typed {@code json} part.
 *
 * <p>Wire form: {@code fileInput} (repeated) for primaries, {@code assets[i].key} / {@code
 * assets[i].file} for each supporting asset, and the optional {@code fileId}.
 */
@Data
@Schema(description = "Files for a policy run: primary documents plus keyed supporting assets")
public class PolicyRunFiles {

    @Schema(description = "Primary input documents", format = "binary")
    private List<MultipartFile> fileInput = new ArrayList<>();

    @Valid
    @Schema(description = "Supporting files, each bound to the asset key its step references")
    private List<NamedAsset> assets = new ArrayList<>();

    /**
     * The caller's own opaque reference to the document it is running on, recorded against any
     * failure of this run so the client that filed it can resolve the row back to that document.
     * Without it an attended failure names no document, and every action that needs the bytes is
     * unreachable for the one person holding them.
     *
     * <p>Opaque by contract and never a name: the server stores it, hands it back and reads nothing
     * out of it. Only honoured for a single-document run, see {@code
     * PolicyController#documentReferenceFor}.
     */
    @Schema(
            description =
                    "The caller's opaque id for the document being run, echoed onto any failure"
                            + " recorded for this run so the originating client can resolve it."
                            + " Ignored unless exactly one primary document is supplied. Never a"
                            + " filename.")
    private String fileId;
}

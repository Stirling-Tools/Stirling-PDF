package stirling.software.SPDF.model.api.misc;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

/**
 * Request body for {@code POST /api/v1/misc/add-comments}.
 *
 * <p>The {@code comments} field is a JSON-encoded array of {@code CommentSpec} objects rather than
 * a nested multipart part so the endpoint stays compatible with {@code InternalApiClient}'s flat
 * multipart form body (orchestrator plan dispatch). Jackson parses it controller-side.
 */
@Data
@EqualsAndHashCode(callSuper = true)
public class AddCommentsRequest extends PDFFile {

    @Schema(
            description =
                    "JSON array of comment specs. Each element has: {pageIndex, x, y, width,"
                            + " height, text, author?, subject?}. Coordinates are PDF user-space with"
                            + " origin at the page's bottom-left.",
            example =
                    "[{\"pageIndex\":0,\"x\":72,\"y\":720,\"width\":20,\"height\":20,"
                            + "\"text\":\"Check this paragraph\",\"author\":\"Reviewer\","
                            + "\"subject\":\"Unclear wording\"}]",
            requiredMode = RequiredMode.REQUIRED)
    private String comments;
}

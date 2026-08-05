package stirling.software.SPDF.model.api.ua;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * One figure needing an alternative description, which is never invented. key is the
 * altTextByFigure key "pageIndex:ordinal"; page is 1-based; kind is "figure" or "formula".
 */
@Schema(description = "A figure that needs an alternative description")
public record FigureDescriptor(
        String key,
        int page,
        String kind,
        float x,
        float y,
        float width,
        float height,
        String existingAlt) {}

package stirling.software.SPDF.model.api.ua;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * One image or drawing that needs an alternative description.
 *
 * <p>The converter deliberately does not invent descriptions, so a caller has to supply them. That
 * is only possible if the caller can find out which figures exist and how to address them, which is
 * what this carries: {@link #key()} is exactly the key the conversion request accepts in its {@code
 * altTextByFigure} map.
 *
 * @param key identifier to pass back as an altTextByFigure key, formatted "pageIndex:ordinal"
 * @param page 1-based page number, for showing a human where to look
 * @param kind "figure" for an image or drawing, "formula" for a mathematical expression
 * @param existingAlt the description already present, or null when there is none
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

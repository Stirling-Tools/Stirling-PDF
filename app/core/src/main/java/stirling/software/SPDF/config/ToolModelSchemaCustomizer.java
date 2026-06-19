package stirling.software.SPDF.config;

import java.util.List;

import org.eclipse.microprofile.openapi.OASFactory;
import org.eclipse.microprofile.openapi.OASFilter;
import org.eclipse.microprofile.openapi.models.Components;
import org.eclipse.microprofile.openapi.models.OpenAPI;
import org.eclipse.microprofile.openapi.models.Operation;
import org.eclipse.microprofile.openapi.models.PathItem;
import org.eclipse.microprofile.openapi.models.media.MediaType;
import org.eclipse.microprofile.openapi.models.media.Schema;

/**
 * Restores rich request-schema detail that SmallRye OpenAPI omits for multipart form fields but
 * springdoc emitted.
 *
 * <p>The migrated controllers bind individual {@code @RestForm} params (e.g. {@code Integer angle},
 * {@code String editsJson}) rather than the {@code @Schema}-annotated request DTOs, so SmallRye
 * sees only the bare scalar types and drops the {@code Angle} enum (rotate-pdf) and the {@code
 * EditTextOperation} object structure (edit-text). The AI engine's {@code generate_tool_models.py}
 * and its tests depend on those named schemas, so re-add them as components and reference them from
 * the affected operations. Registered via {@code mp.openapi.filter} in application.properties.
 */
public class ToolModelSchemaCustomizer implements OASFilter {

    private static final String ANGLE = "Angle";
    private static final String EDIT_TEXT_OPERATION = "EditTextOperation";

    @Override
    public void filterOpenAPI(OpenAPI openApi) {
        registerSchemas(openApi);
        if (openApi.getPaths() == null || openApi.getPaths().getPathItems() == null) {
            return;
        }
        openApi.getPaths()
                .getPathItems()
                .forEach(
                        (path, item) -> {
                            if (path.endsWith("/rotate-pdf")) {
                                setFormProperty(item, "angle", ref(ANGLE));
                            } else if (path.endsWith("/edit-text")) {
                                setFormProperty(
                                        item,
                                        "edits",
                                        OASFactory.createSchema()
                                                .addType(Schema.SchemaType.ARRAY)
                                                .description(
                                                        "Ordered list of find/replace operations."
                                                                + " Each replaces every occurrence on"
                                                                + " the selected pages, in order; later"
                                                                + " operations see the result of earlier"
                                                                + " ones.")
                                                .items(ref(EDIT_TEXT_OPERATION)));
                            }
                        });
    }

    private void registerSchemas(OpenAPI openApi) {
        Components components = openApi.getComponents();
        if (components == null) {
            components = OASFactory.createComponents();
            openApi.setComponents(components);
        }
        if (components.getSchemas() == null || !components.getSchemas().containsKey(ANGLE)) {
            components.addSchema(
                    ANGLE,
                    OASFactory.createSchema()
                            .addType(Schema.SchemaType.INTEGER)
                            .format("int32")
                            .description(
                                    "The clockwise angle by which to rotate all pages in the PDF"
                                            + " file. Must be a multiple of 90.")
                            .enumeration(List.<Object>of(0, 90, 180, 270)));
        }
        if (components.getSchemas() == null
                || !components.getSchemas().containsKey(EDIT_TEXT_OPERATION)) {
            components.addSchema(
                    EDIT_TEXT_OPERATION,
                    OASFactory.createSchema()
                            .addType(Schema.SchemaType.OBJECT)
                            .addProperty(
                                    "find",
                                    OASFactory.createSchema()
                                            .addType(Schema.SchemaType.STRING)
                                            .description("The literal text to find."))
                            .addProperty(
                                    "replace",
                                    OASFactory.createSchema()
                                            .addType(Schema.SchemaType.STRING)
                                            .description(
                                                    "The replacement text. May be empty to delete"
                                                            + " the matched text.")));
        }
    }

    private static Schema ref(String name) {
        return OASFactory.createSchema().ref("#/components/schemas/" + name);
    }

    private void setFormProperty(PathItem item, String name, Schema schema) {
        if (item.getPOST() == null) {
            return;
        }
        Operation post = item.getPOST();
        if (post.getRequestBody() == null || post.getRequestBody().getContent() == null) {
            return;
        }
        MediaType mediaType =
                post.getRequestBody().getContent().getMediaType("multipart/form-data");
        if (mediaType == null || mediaType.getSchema() == null) {
            return;
        }
        Schema formSchema = mediaType.getSchema();
        if (formSchema.getProperties() != null && formSchema.getProperties().containsKey(name)) {
            formSchema.addProperty(name, schema);
        }
    }
}

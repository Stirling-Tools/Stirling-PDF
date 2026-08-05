package stirling.software.common.pdf.ua;

import org.apache.xmpbox.XMPMetadata;
import org.apache.xmpbox.schema.XMPSchema;
import org.apache.xmpbox.type.IntegerType;
import org.apache.xmpbox.type.StructuredType;

/**
 * The {@code pdfuaid} XMP conformance schema, which XMPBox does not ship. Only write it once
 * validation has passed - it is a compliance claim.
 */
@StructuredType(
        preferedPrefix = PdfUaIdentificationSchema.PREFERRED_PREFIX,
        namespace = PdfUaIdentificationSchema.NAMESPACE)
public class PdfUaIdentificationSchema extends XMPSchema {

    public static final String PREFERRED_PREFIX = "pdfuaid";
    public static final String NAMESPACE = "http://www.aiim.org/pdfua/ns/id/";

    public static final String PART = "part";
    public static final String REV = "rev";

    public PdfUaIdentificationSchema(XMPMetadata metadata) {
        super(metadata);
    }

    public PdfUaIdentificationSchema(XMPMetadata metadata, String prefix) {
        super(metadata, prefix);
    }

    /** Sets {@code pdfuaid:part}, the conformance level (1 or 2). */
    public void setPart(int part) {
        addProperty(new IntegerType(getMetadata(), getNamespace(), getPrefix(), PART, part));
    }

    /** Sets {@code pdfuaid:rev}, the four-digit revision year used by PDF/UA-2. */
    public void setRevision(int year) {
        addProperty(new IntegerType(getMetadata(), getNamespace(), getPrefix(), REV, year));
    }

    public Integer getPart() {
        if (getProperty(PART) instanceof IntegerType part) {
            return part.getValue();
        }
        return null;
    }
}

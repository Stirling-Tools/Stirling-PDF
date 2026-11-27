package stirling.software.SPDF.pdf.signature;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import javax.security.auth.x500.X500Principal;

import org.bouncycastle.asn1.x500.AttributeTypeAndValue;
import org.bouncycastle.asn1.x500.RDN;
import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.asn1.x500.style.BCStyle;
import org.bouncycastle.asn1.x500.style.IETFUtils;

/** Certificate names written the way a visible signature shows them. */
public final class DistinguishedNames {

    private DistinguishedNames() {}

    /**
     * {@code subject} as {@code CN=Ada, O=Example Ltd, C=GB}: short attribute names, the common
     * name first and the country last whatever order the certificate stores them in.
     */
    public static String readable(X500Principal subject) {
        RDN[] rdns = X500Name.getInstance(subject.getEncoded()).getRDNs();
        List<String> first = new ArrayList<>();
        List<String> middle = new ArrayList<>();
        List<String> last = new ArrayList<>();
        for (int index = rdns.length - 1; index >= 0; index--) {
            for (AttributeTypeAndValue value : rdns[index].getTypesAndValues()) {
                String type = BCStyle.INSTANCE.oidToDisplayName(value.getType());
                String part =
                        (type == null ? value.getType().getId() : type.toUpperCase(Locale.ROOT))
                                + "="
                                + IETFUtils.valueToString(value.getValue());
                if (BCStyle.CN.equals(value.getType())) {
                    first.add(part);
                } else if (BCStyle.C.equals(value.getType())) {
                    last.add(part);
                } else {
                    middle.add(part);
                }
            }
        }
        first.addAll(middle);
        first.addAll(last);
        return String.join(", ", first);
    }
}

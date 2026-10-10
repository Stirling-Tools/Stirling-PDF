package stirling.software.SPDF.service.xfa;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentCatalog;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.service.xfa.XfaInspection.State;
import stirling.software.SPDF.service.xfa.XfaSyncReport.Action;
import stirling.software.SPDF.service.xfa.XfaSyncReport.FieldResult;
import stirling.software.common.util.ExceptionUtils;

/**
 * Keeps the two halves of a hybrid AcroForm + XFA form (as Adobe LiveCycle saves them) telling the
 * same story after Stirling edits the AcroForm half. Acrobat renders the XFA half and every other
 * viewer the AcroForm one, so a save that only updates AcroForm leaves Acrobat showing stale data.
 *
 * <p>Documents without an {@code /XFA} entry are never modified here, not even their usage rights.
 */
@Slf4j
@Service
public class XfaSyncService {

    private static final COSName UR3 = COSName.getPDFName("UR3");
    private static final COSName UR = COSName.getPDFName("UR");
    private static final COSName DOC_MDP = COSName.getPDFName("DocMDP");
    private static final COSName NEEDS_RENDERING = COSName.getPDFName("NeedsRendering");

    @FunctionalInterface
    public interface DocumentChange {
        void apply(PDDocument document) throws IOException;
    }

    /**
     * Runs {@code change} between an {@link #inspect} and an {@link #apply}, which is the order
     * every caller needs: the inspection must see the document before the change can hide what it
     * was.
     */
    public XfaSyncReport process(
            PDDocument document, XfaMode mode, XfaEdit edit, DocumentChange change)
            throws IOException {
        XfaInspection before = inspect(document);
        requireSupported(before, mode);
        change.apply(document);
        return apply(document, before, mode, edit, Set.of());
    }

    /**
     * Reads the XFA state without changing anything. It works on the catalog's COS dictionaries
     * rather than {@code getAcroForm()}, whose default fix-ups can repair, and so modify, a form.
     */
    public XfaInspection inspect(PDDocument document) {
        COSDictionary root = document.getDocumentCatalog().getCOSObject();
        COSDictionary form = root == null ? null : root.getCOSDictionary(COSName.ACRO_FORM);
        if (form == null || form.getDictionaryObject(COSName.XFA) == null) {
            return XfaInspection.NOT_XFA;
        }
        PDAcroForm acroForm = new PDAcroForm(document, form);
        COSDictionary perms = root.getCOSDictionary(COSName.PERMS);
        boolean usageRights = perms != null && (perms.containsKey(UR3) || perms.containsKey(UR));
        boolean certified = perms != null && perms.containsKey(DOC_MDP);
        boolean dynamic = acroForm.getFields().isEmpty() || root.getBoolean(NEEDS_RENDERING, false);
        if (dynamic) {
            return new XfaInspection(State.DYNAMIC, usageRights, certified, Map.of());
        }
        return new XfaInspection(
                State.HYBRID, usageRights, certified, XfaFieldValues.snapshot(acroForm));
    }

    /**
     * @throws IllegalArgumentException for a dynamic XFA form in any mode but {@link XfaMode#NONE}:
     *     it has no AcroForm fields to take values from, and stripping its XFA would leave nothing
     *     but the placeholder page
     */
    public void requireSupported(XfaInspection inspection, XfaMode mode) {
        if (inspection.state() == State.DYNAMIC && mode != XfaMode.NONE) {
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.xfaDynamicForm",
                    "This is a dynamic XFA form with no AcroForm fields to keep in step, so only"
                            + " Adobe Acrobat or Reader can fill it. Send xfaMode=none to save it"
                            + " without touching the XFA.");
        }
    }

    /**
     * Brings the XFA of {@code document} in line with its AcroForm fields as {@code mode} asks.
     * Whenever it changes anything it also removes the Reader usage-rights signature ({@code
     * /Perms/UR3}), which a full save has invalidated anyway and which makes Reader warn.
     *
     * @param before the inspection taken before the document was changed
     * @param edit {@link XfaEdit#STRUCTURE} turns a sync into a strip, since no data sync can make
     *     the old template describe the new form
     * @param changedFields fully qualified names the caller knows it edited, for changes the {@code
     *     before} snapshot cannot see
     * @throws IllegalArgumentException for a dynamic form, or when the XFA data cannot be read
     */
    public XfaSyncReport apply(
            PDDocument document,
            XfaInspection before,
            XfaMode mode,
            XfaEdit edit,
            Set<String> changedFields)
            throws IOException {
        if (!before.hasXfa()) {
            return XfaSyncReport.notXfa(mode);
        }
        if (mode == XfaMode.NONE) {
            return XfaSyncReport.of(
                    mode, before.state(), Action.UNTOUCHED, false, List.of(), List.of());
        }
        requireSupported(before, mode);
        PDDocumentCatalog catalog = document.getDocumentCatalog();
        PDAcroForm acroForm = catalog.getAcroForm(null);
        List<String> warnings = new ArrayList<>();
        List<FieldResult> fields = List.of();
        Action action;
        if (acroForm == null || acroForm.getCOSObject().getDictionaryObject(COSName.XFA) == null) {
            action = Action.REMOVED_BY_FLATTEN;
            catalog.getCOSObject().removeItem(NEEDS_RENDERING);
        } else if (mode == XfaMode.STRIP || edit == XfaEdit.STRUCTURE) {
            acroForm.setXFA(null);
            catalog.getCOSObject().removeItem(NEEDS_RENDERING);
            action = mode == XfaMode.STRIP ? Action.STRIPPED : Action.STRIPPED_STRUCTURAL;
        } else {
            fields = syncData(document, acroForm, before, changedFields, warnings);
            action = Action.SYNCED;
        }
        boolean usageRightsRemoved = removeUsageRights(catalog);
        if (acroForm != null
                && acroForm.isAppendOnly()
                && document.getSignatureDictionaries().isEmpty()) {
            acroForm.setAppendOnly(false);
        }
        if (before.certified()) {
            warnings.add(
                    "The document is certified (DocMDP); saving it invalidates the certification.");
        }
        XfaSyncReport report =
                XfaSyncReport.of(
                        mode, before.state(), action, usageRightsRemoved, fields, warnings);
        log.debug(
                "XFA {} for a {} form: {} (usage rights removed: {})",
                action,
                before.state(),
                report.counts(),
                usageRightsRemoved);
        return report;
    }

    private static List<FieldResult> syncData(
            PDDocument document,
            PDAcroForm acroForm,
            XfaInspection before,
            Set<String> changedFields,
            List<String> warnings)
            throws IOException {
        try {
            return XfaDataSync.run(document, acroForm, before, changedFields, warnings);
        } catch (IOException unreadable) {
            log.warn("XFA data could not be synced: {}", unreadable.getMessage());
            throw ExceptionUtils.createIllegalArgumentException(
                    "error.xfaUnreadable",
                    "The XFA data in this PDF could not be read or rewritten. Send xfaMode=strip"
                            + " to drop the XFA, or xfaMode=none to leave it as it is.");
        }
    }

    private static boolean removeUsageRights(PDDocumentCatalog catalog) {
        COSDictionary perms = catalog.getCOSObject().getCOSDictionary(COSName.PERMS);
        if (perms == null) {
            return false;
        }
        boolean removed = false;
        for (COSName key : List.of(UR3, UR)) {
            if (perms.containsKey(key)) {
                perms.removeItem(key);
                removed = true;
            }
        }
        if (perms.size() == 0) {
            catalog.getCOSObject().removeItem(COSName.PERMS);
        }
        return removed;
    }
}

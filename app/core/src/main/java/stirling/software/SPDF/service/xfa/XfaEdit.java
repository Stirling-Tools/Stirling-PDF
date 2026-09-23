package stirling.software.SPDF.service.xfa;

/** How far an operation reached into a form before it was saved. */
public enum XfaEdit {
    /** Only field values changed, which the XFA data can take in step. */
    VALUES,
    /**
     * Fields were added, removed, renamed or reconfigured. The XFA template still describes the old
     * form, so no data sync can make Acrobat show the new one.
     */
    STRUCTURE
}

package stirling.software.common.model.tool;

/**
 * How many files a tool endpoint consumes and produces, using the established SISO/SIMO/MISO/MIMO
 * vocabulary (Single/Multiple In, Single/Multiple Out).
 *
 * <p>This is the axis that carries ZIP-as-transport. A multi-output endpoint returns its results
 * zipped and the pipeline unpacks them, so {@code split-pages} declares {@code produces = PDF,
 * arity = SIMO} rather than naming a ZIP-of-PDF format. An endpoint whose deliverable really is an
 * archive declares {@link ToolFormat#ZIP} with a single-output arity and stays packed.
 */
public enum ToolArity {
    SISO,
    SIMO,
    MISO,
    MIMO;

    /** True if the endpoint takes every input file in one call rather than one call per file. */
    public boolean isMultiInput() {
        return this == MISO || this == MIMO;
    }

    /** True if the endpoint returns several files, zipped in transit and unpacked by the caller. */
    public boolean isMultiOutput() {
        return this == SIMO || this == MIMO;
    }
}

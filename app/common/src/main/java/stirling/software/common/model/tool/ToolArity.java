package stirling.software.common.model.tool;

/**
 * How many files an endpoint consumes and produces (Single/Multiple In, Single/Multiple Out).
 *
 * <p>This axis carries ZIP-as-transport: a multi-output endpoint returns its results zipped and the
 * caller unpacks them, so {@code split-pages} is {@code produces = PDF, arity = SIMO} rather than
 * naming a ZIP-of-PDF format. An endpoint whose deliverable really is an archive declares {@link
 * ToolFormat#ZIP} with a single-output arity and stays packed.
 */
public enum ToolArity {
    SISO,
    SIMO,
    MISO,
    MIMO;

    public boolean isMultiInput() {
        return this == MISO || this == MIMO;
    }

    public boolean isMultiOutput() {
        return this == SIMO || this == MIMO;
    }
}

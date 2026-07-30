package stirling.software.common.model.tool;

import java.lang.annotation.Documented;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;

/**
 * One parameter-dependent output rule inside {@link ToolIO#cases()}: when every condition in {@link
 * #when()} holds, the endpoint produces {@link #produces()} with {@link #arity()} instead of the
 * enclosing declaration's.
 *
 * <p>Conditions are combined with AND, because the interesting branches usually turn on more than
 * one parameter. Add Password, for instance, only leaves the document unencrypted when the user
 * password and the owner password are both absent; keying on either one alone would mis-describe
 * the other half of the matrix.
 *
 * <p>Both the format and the arity are stated outright rather than inherited, so a rule reads as a
 * complete description of that branch:
 *
 * <pre>{@code
 * // pdf-to-img: one image when asked for a single page, a set of them otherwise.
 * @ToolIO(
 *         produces = ToolFormat.IMAGE,
 *         arity = ToolArity.SIMO,
 *         cases =
 *                 @ToolIOCase(
 *                         when = @ToolIOWhen(param = "singleOrMultiple", matches = "single"),
 *                         produces = ToolFormat.IMAGE,
 *                         arity = ToolArity.SISO))
 * }</pre>
 *
 * <p>When a condition reads a parameter whose value is not known - a pipeline being edited before
 * the step is configured - the output is reported as unresolved and the chain check downgrades to a
 * warning rather than guessing.
 */
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface ToolIOCase {

    /** The conditions that must all hold for this rule to apply. */
    ToolIOWhen[] when();

    /** The format produced when this rule matches. */
    ToolFormat produces();

    /** The arity when this rule matches. */
    ToolArity arity();
}

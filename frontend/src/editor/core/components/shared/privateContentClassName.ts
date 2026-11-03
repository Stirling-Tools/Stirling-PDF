/** Classes that keep an element's content out of analytics and feedback
 * captures while interactions with it are still recorded. Put them on an element
 * directly where a `PrivateContent` wrapper would break its styling, such as a
 * grid row. */
export const privateContentClassName = "ph-sensitive";

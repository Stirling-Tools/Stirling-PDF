/** Classes that keep an element's content out of analytics and feedback
 * captures. Clicks on it are still sent as events, without its text; session
 * replay shows it as an empty box. Put them on an element directly where a
 * `PrivateContent` wrapper would break its styling, such as a grid row. */
export const privateContentClassName = "ph-sensitive";

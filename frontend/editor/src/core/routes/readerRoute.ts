/**
 * Path that names the reading surface, so a reload lands back in it and the URL
 * can be shared or bookmarked as "open this in the reader".
 *
 * Bare rather than under the editor's basename, like the file library's own
 * path: both are surfaces you reach from the rail rather than places inside the
 * editor, and neither moves when a build gives the editor a basename of its own.
 */
export const READER_PATH = "/read";

/**
 * Path that names the reading surface, so a reload lands back in it and the URL
 * can be bookmarked as "open this in the reader".
 *
 * Not "/read": that is the Read tool's own alias in URL_TO_TOOL_MAP, and a reload
 * there selects the tool as well as the surface.
 *
 * Bare rather than under the editor's basename, like the file library's own path:
 * both are surfaces reached from the rail rather than places inside the editor, so
 * neither moves when a build gives the editor a basename of its own.
 */
export const READER_PATH = "/reader";

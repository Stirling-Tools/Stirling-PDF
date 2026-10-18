package stirling.software.proprietary.storage.event;

import java.util.UUID;

/**
 * Files were placed into a storage folder by a user action (a move from the file manager or the
 * editor). Published so a processing folder starts its run on the arrival rather than on the next
 * poll; the poll remains the safety net for events lost to a restart or another instance.
 *
 * <p>Deliberately raised only from the placement calls a user drives. Policy output re-enters the
 * folder through {@code StorageOutputSink}, which writes the row directly, so a run cannot announce
 * its own results back to the trigger that started it.
 */
public record StorageFolderArrivalEvent(UUID folderId) {}

import { useCallback } from 'react';
import { PDFDocument, degrees } from 'pdf-lib';
import { FileId } from '@app/types/file';
import { useFileContext } from '@app/contexts/FileContext';
import { alert } from '@app/components/toast';
import { createStirlingFilesAndStubs } from '@app/services/fileStubHelpers';
import { useFileManagement } from '@app/contexts/FileContext';

interface UseSingleFilePageOperationsParams {
  fileId: FileId;
}

export const useSingleFilePageOperations = ({ fileId }: UseSingleFilePageOperationsParams) => {
  const { selectors, actions } = useFileContext();
  const { removeFiles } = useFileManagement();

  const rotatePage = useCallback(async (pageNumber: number, direction: 'left' | 'right') => {
    const file = selectors.getFile(fileId);
    const stub = selectors.getStirlingFileStub(fileId);
    if (!file || !stub) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      
      const rotation = direction === 'left' ? -90 : 90;
      const page = pdfDoc.getPage(pageNumber - 1); // pdf-lib uses 0-based indexing
      const currentRotation = page.getRotation().angle;
      page.setRotation(degrees(currentRotation + rotation));

      const pdfBytes = await pdfDoc.save();
      const newFile = new File([pdfBytes], file.name, { type: 'application/pdf' });

      // Create new StirlingFile and stub
      const { stirlingFiles, stubs } = await createStirlingFilesAndStubs(
        [newFile],
        stub,
        'pageOperation'
      );

      // Replace the file using consumeFiles
      const newFileIds = await actions.consumeFiles([fileId], stirlingFiles, stubs);
      
      // Store mapping from old ID to new ID for expanded state preservation
      if (newFileIds.length > 0 && newFileIds[0] !== fileId) {
        // Dispatch custom event to notify FileEditor of ID change
        window.dispatchEvent(new CustomEvent('fileIdReplaced', {
          detail: { oldId: fileId, newId: newFileIds[0] }
        }));
      }
      
      alert({
        alertType: 'success',
        title: `Rotated page ${pageNumber} ${direction}`,
        expandable: false,
        durationMs: 2000,
      });
    } catch (error) {
      console.error('Failed to rotate page:', error);
      alert({
        alertType: 'error',
        title: 'Failed to rotate page',
        expandable: false,
        durationMs: 3000,
      });
    }
  }, [fileId, selectors, actions]);

  const deletePage = useCallback(async (pageNumber: number) => {
    const file = selectors.getFile(fileId);
    const stub = selectors.getStirlingFileStub(fileId);
    if (!file || !stub) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      
      const totalPages = pdfDoc.getPageCount();
      if (totalPages <= 1) {
        alert({
          alertType: 'warning',
          title: 'Cannot delete the last page',
          expandable: false,
          durationMs: 2000,
        });
        return;
      }

      pdfDoc.removePage(pageNumber - 1); // pdf-lib uses 0-based indexing

      const pdfBytes = await pdfDoc.save();
      const newFile = new File([pdfBytes], file.name, { type: 'application/pdf' });

      // Create new StirlingFile and stub
      const { stirlingFiles, stubs } = await createStirlingFilesAndStubs(
        [newFile],
        stub,
        'pageOperation'
      );

      // Replace the file using consumeFiles
      const newFileIds = await actions.consumeFiles([fileId], stirlingFiles, stubs);
      
      // Store mapping from old ID to new ID for expanded state preservation
      if (newFileIds.length > 0 && newFileIds[0] !== fileId) {
        window.dispatchEvent(new CustomEvent('fileIdReplaced', {
          detail: { oldId: fileId, newId: newFileIds[0] }
        }));
      }
      
      alert({
        alertType: 'success',
        title: `Deleted page ${pageNumber}`,
        expandable: false,
        durationMs: 2000,
      });
    } catch (error) {
      console.error('Failed to delete page:', error);
      alert({
        alertType: 'error',
        title: 'Failed to delete page',
        expandable: false,
        durationMs: 3000,
      });
    }
  }, [fileId, selectors, actions]);

  const movePage = useCallback(async (sourcePageNumber: number, targetPageNumber: number) => {
    const file = selectors.getFile(fileId);
    const stub = selectors.getStirlingFileStub(fileId);
    if (!file || !stub) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      
      const pages = pdfDoc.getPages();
      const sourceIndex = sourcePageNumber - 1;
      const targetIndex = targetPageNumber - 1;

      if (sourceIndex < 0 || sourceIndex >= pages.length || targetIndex < 0 || targetIndex >= pages.length) {
        return;
      }

      // Get the page to move
      const [pageToMove] = await pdfDoc.copyPages(pdfDoc, [sourceIndex]);
      
      // Remove the original page
      pdfDoc.removePage(sourceIndex);
      
      // Insert at target position (adjust if source was before target)
      const insertIndex = sourceIndex < targetIndex ? targetIndex : targetIndex;
      pdfDoc.insertPage(insertIndex, pageToMove);

      const pdfBytes = await pdfDoc.save();
      const newFile = new File([pdfBytes], file.name, { type: 'application/pdf' });

      // Create new StirlingFile and stub
      const { stirlingFiles, stubs } = await createStirlingFilesAndStubs(
        [newFile],
        stub,
        'pageOperation'
      );

      // Replace the file using consumeFiles
      const newFileIds = await actions.consumeFiles([fileId], stirlingFiles, stubs);
      
      // Store mapping from old ID to new ID for expanded state preservation
      if (newFileIds.length > 0 && newFileIds[0] !== fileId) {
        window.dispatchEvent(new CustomEvent('fileIdReplaced', {
          detail: { oldId: fileId, newId: newFileIds[0] }
        }));
      }
      
      alert({
        alertType: 'success',
        title: `Moved page ${sourcePageNumber} to position ${targetPageNumber}`,
        expandable: false,
        durationMs: 2000,
      });
    } catch (error) {
      console.error('Failed to move page:', error);
      alert({
        alertType: 'error',
        title: 'Failed to move page',
        expandable: false,
        durationMs: 3000,
      });
    }
  }, [fileId, selectors, actions]);

  return {
    rotatePage,
    deletePage,
    movePage,
  };
};


import { useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ask } from '@tauri-apps/plugin-dialog';
import { useFileState } from '@app/contexts/FileContext';

export function useExitWarning() {
  const { selectors } = useFileState();
  const selectorsRef = useRef(selectors);
  const isClosingRef = useRef(false);

  selectorsRef.current = selectors;

  useEffect(() => {
    const appWindow = getCurrentWindow();

    const handleCloseRequested = async (event: { preventDefault: () => void }) => {
      console.info('[exit-warning] close requested', { isClosing: isClosingRef.current });

      // Always take control of the close flow to avoid inconsistent behavior.
      event.preventDefault();

      if (isClosingRef.current) {
        return;
      }

      const allStubs = selectorsRef.current.getStirlingFileStubs();
      const dirtyFiles = allStubs.filter(stub => stub.localFilePath && stub.isDirty);
      const dirtyCount = dirtyFiles.length;

      console.info('[exit-warning] dirty check', { dirtyCount });

      if (dirtyCount > 0) {
        const fileList = dirtyFiles.map(f => `- ${f.name}`).join('\n');
        const confirmed = await ask(
          `You have ${dirtyFiles.length} file${dirtyFiles.length > 1 ? 's' : ''} with unsaved changes.\n\n${fileList}\n\nClose without saving?`,
          { title: 'Unsaved Changes' }
        );

        console.info('[exit-warning] user choice', { confirmed });

        if (!confirmed) {
          console.info('[exit-warning] user cancelled close');
          return;
        }

        console.info('[exit-warning] user confirmed close');
      } else {
        console.info('[exit-warning] no dirty files, closing');
      }

      isClosingRef.current = true;
      try {
        await appWindow.destroy();
      } catch (error) {
        console.info('[exit-warning] destroy failed', { error });
        isClosingRef.current = false;
      }
    };

    const unlisten = appWindow.onCloseRequested(handleCloseRequested);
    return () => {
      unlisten.then(fn => {
        fn();
      });
    };
  }, []);
}

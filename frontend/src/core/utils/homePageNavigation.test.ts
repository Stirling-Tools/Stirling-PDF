import { describe, expect, it } from 'vitest';
import { getStartupNavigationAction } from '@app/utils/homePageNavigation';
import type { WorkbenchType } from '@app/types/workbench';

describe('getStartupNavigationAction', () => {
  it('returns viewer + active index for 0->1 transition when not in fileEditor', () => {
    expect(getStartupNavigationAction(0, 1, null, 'viewer' as WorkbenchType)).toEqual({
      workbench: 'viewer',
      activeFileIndex: 0,
    });
    expect(getStartupNavigationAction(0, 1, null, 'pageEditor' as WorkbenchType)).toEqual({
      workbench: 'viewer',
      activeFileIndex: 0,
    });
  });

  it('returns fileEditor for 0->2+ transition when not in fileEditor', () => {
    expect(getStartupNavigationAction(0, 2, null, 'viewer' as WorkbenchType)).toEqual({
      workbench: 'fileEditor',
    });
  });

  it('does not force navigation for pdfTextEditor', () => {
    expect(getStartupNavigationAction(0, 1, 'pdfTextEditor', 'viewer' as WorkbenchType)).toBeNull();
    expect(getStartupNavigationAction(0, 3, 'pdfTextEditor', 'viewer' as WorkbenchType)).toBeNull();
  });

  it('does not navigate on non-startup transitions', () => {
    expect(getStartupNavigationAction(1, 2, null, 'viewer' as WorkbenchType)).toBeNull();
    expect(getStartupNavigationAction(2, 1, null, 'viewer' as WorkbenchType)).toBeNull();
  });

  it('does not navigate away from fileEditor when user is already there', () => {
    // User deletes all files in fileEditor, then uploads 1 file -> stay in fileEditor
    expect(getStartupNavigationAction(0, 1, null, 'fileEditor' as WorkbenchType)).toBeNull();
    // User uploads 2 files while in fileEditor -> stay in fileEditor
    expect(getStartupNavigationAction(0, 2, null, 'fileEditor' as WorkbenchType)).toBeNull();
    // User adds more files while in fileEditor -> stay in fileEditor
    expect(getStartupNavigationAction(3, 4, null, 'fileEditor' as WorkbenchType)).toBeNull();
  });

  it('does not navigate from custom workbenches', () => {
    // Custom workbenches should behave like fileEditor (no auto-navigation)
    expect(getStartupNavigationAction(0, 1, null, 'custom:formFill' as WorkbenchType)).toBeNull();
    expect(getStartupNavigationAction(0, 3, null, 'custom:myTool' as WorkbenchType)).toBeNull();
  });
});

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

  it('does not navigate when user already has files (N→M transitions)', () => {
    // User has 1 file, adds another -> no navigation (stay in current workbench)
    expect(getStartupNavigationAction(1, 2, null, 'viewer' as WorkbenchType)).toBeNull();
    expect(getStartupNavigationAction(1, 2, null, 'fileEditor' as WorkbenchType)).toBeNull();

    // User has 3 files, adds more -> no navigation
    expect(getStartupNavigationAction(3, 4, null, 'fileEditor' as WorkbenchType)).toBeNull();

    // User has 2 files, deletes 1 -> no navigation
    expect(getStartupNavigationAction(2, 1, null, 'viewer' as WorkbenchType)).toBeNull();
  });

  it('handles all workbench types consistently for 0→N transitions', () => {
    // 0→1 always goes to viewer regardless of current workbench (since default is viewer)
    expect(getStartupNavigationAction(0, 1, null, 'viewer' as WorkbenchType)).toEqual({
      workbench: 'viewer',
      activeFileIndex: 0,
    });
    expect(getStartupNavigationAction(0, 1, null, 'fileEditor' as WorkbenchType)).toEqual({
      workbench: 'viewer',
      activeFileIndex: 0,
    });
    expect(getStartupNavigationAction(0, 1, null, 'pageEditor' as WorkbenchType)).toEqual({
      workbench: 'viewer',
      activeFileIndex: 0,
    });
    expect(getStartupNavigationAction(0, 1, null, 'custom:formFill' as WorkbenchType)).toEqual({
      workbench: 'viewer',
      activeFileIndex: 0,
    });

    // 0→N (N>1) always goes to fileEditor
    expect(getStartupNavigationAction(0, 3, null, 'viewer' as WorkbenchType)).toEqual({
      workbench: 'fileEditor',
    });
    expect(getStartupNavigationAction(0, 3, null, 'custom:myTool' as WorkbenchType)).toEqual({
      workbench: 'fileEditor',
    });
  });
});

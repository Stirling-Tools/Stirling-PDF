import { BaseParameters } from '@app/types/parameters';
import { useBaseParameters, BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';

export interface PageLayoutParameters extends BaseParameters {
  mode: "DEFAULT" | "CUSTOM";
  pagesPerSheet: number;
  rows: number;
  cols: number;
  orientation: "PORTRAIT" | "LANDSCAPE"
  arrangement: "BY_COLUMNS" | "BY_ROWS"
  readingDirection: "LTR" | "RTL"
  innerMargin?: number;
  topMargin?: number;
  bottomMargin?: number;
  leftMargin?: number;
  rightMargin?: number;
  addBorder: boolean;
  borderWidth?: number;
}

export const defaultParameters: PageLayoutParameters = {
  mode: "DEFAULT",
  pagesPerSheet: 4,
  rows: 1,
  cols: 1,
  orientation: "PORTRAIT",
  arrangement: "BY_ROWS",
  readingDirection: "LTR",
  addBorder: false,
  innerMargin: 0,
  topMargin: 0,
  bottomMargin: 0,
  leftMargin: 0,
  rightMargin: 0,
  borderWidth: 1,
};

export type PageLayoutParametersHook = BaseParametersHook<PageLayoutParameters>;

export const usePageLayoutParameters = (): PageLayoutParametersHook => {
  return useBaseParameters<PageLayoutParameters>({
    defaultParameters,
    endpointName: 'multi-page-layout',
  });
};



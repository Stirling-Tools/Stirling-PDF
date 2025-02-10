# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = 上一頁
pdfjs-previous-button-label = 上一頁
pdfjs-next-button =
    .title = 下一頁
pdfjs-next-button-label = 下一頁
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = 第
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = 頁，共 { $pagesCount } 頁
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = （第 { $pageNumber } 頁，共 { $pagesCount } 頁）
pdfjs-zoom-out-button =
    .title = 縮小
pdfjs-zoom-out-button-label = 縮小
pdfjs-zoom-in-button =
    .title = 放大
pdfjs-zoom-in-button-label = 放大
pdfjs-zoom-select =
    .title = 縮放
pdfjs-presentation-mode-button =
    .title = 切換至簡報模式
pdfjs-presentation-mode-button-label = 簡報模式
pdfjs-open-file-button =
    .title = 開啟檔案
pdfjs-open-file-button-label = 開啟
pdfjs-print-button =
    .title = 列印
pdfjs-print-button-label = 列印
pdfjs-save-button =
    .title = 儲存
pdfjs-save-button-label = 儲存
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = 下載
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = 下載
pdfjs-bookmark-button =
    .title = 目前頁面（含目前檢視頁面的網址）
pdfjs-bookmark-button-label = 目前頁面
# Used in Firefox for Android.
pdfjs-open-in-app-button =
    .title = 在應用程式中開啟
# Used in Firefox for Android.
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-open-in-app-button-label = 用程式開啟

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = 工具
pdfjs-tools-button-label = 工具
pdfjs-first-page-button =
    .title = 跳到第一頁
pdfjs-first-page-button-label = 跳到第一頁
pdfjs-last-page-button =
    .title = 跳到最後一頁
pdfjs-last-page-button-label = 跳到最後一頁
pdfjs-page-rotate-cw-button =
    .title = 順時針旋轉
pdfjs-page-rotate-cw-button-label = 順時針旋轉
pdfjs-page-rotate-ccw-button =
    .title = 逆時針旋轉
pdfjs-page-rotate-ccw-button-label = 逆時針旋轉
pdfjs-cursor-text-select-tool-button =
    .title = 開啟文字選擇工具
pdfjs-cursor-text-select-tool-button-label = 文字選擇工具
pdfjs-cursor-hand-tool-button =
    .title = 開啟頁面移動工具
pdfjs-cursor-hand-tool-button-label = 頁面移動工具
pdfjs-scroll-page-button =
    .title = 使用頁面捲動功能
pdfjs-scroll-page-button-label = 頁面捲動功能
pdfjs-scroll-vertical-button =
    .title = 使用垂直捲動版面
pdfjs-scroll-vertical-button-label = 垂直捲動
pdfjs-scroll-horizontal-button =
    .title = 使用水平捲動版面
pdfjs-scroll-horizontal-button-label = 水平捲動
pdfjs-scroll-wrapped-button =
    .title = 使用多頁捲動版面
pdfjs-scroll-wrapped-button-label = 多頁捲動
pdfjs-spread-none-button =
    .title = 不要進行跨頁顯示
pdfjs-spread-none-button-label = 不跨頁
pdfjs-spread-odd-button =
    .title = 從奇數頁開始跨頁
pdfjs-spread-odd-button-label = 奇數跨頁
pdfjs-spread-even-button =
    .title = 從偶數頁開始跨頁
pdfjs-spread-even-button-label = 偶數跨頁

## Document properties dialog

pdfjs-document-properties-button =
    .title = 文件內容…
pdfjs-document-properties-button-label = 文件內容…
pdfjs-document-properties-file-name = 檔案名稱:
pdfjs-document-properties-file-size = 檔案大小:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB（{ $size_b } 位元組）
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB（{ $size_b } 位元組）
pdfjs-document-properties-title = 標題:
pdfjs-document-properties-author = 作者:
pdfjs-document-properties-subject = 主旨:
pdfjs-document-properties-keywords = 關鍵字:
pdfjs-document-properties-creation-date = 建立日期:
pdfjs-document-properties-modification-date = 修改日期:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date } { $time }
pdfjs-document-properties-creator = 建立者:
pdfjs-document-properties-producer = PDF 產生器:
pdfjs-document-properties-version = PDF 版本:
pdfjs-document-properties-page-count = 頁數:
pdfjs-document-properties-page-size = 頁面大小:
pdfjs-document-properties-page-size-unit-inches = in
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = 垂直
pdfjs-document-properties-page-size-orientation-landscape = 水平
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Letter
pdfjs-document-properties-page-size-name-legal = Legal

## Variables:
##   $width (Number) - the width of the (current) page
##   $height (Number) - the height of the (current) page
##   $unit (String) - the unit of measurement of the (current) page
##   $name (String) - the name of the (current) page
##   $orientation (String) - the orientation of the (current) page

pdfjs-document-properties-page-size-dimension-string = { $width } × { $height } { $unit }（{ $orientation }）
pdfjs-document-properties-page-size-dimension-name-string = { $width } × { $height } { $unit }（{ $name }，{ $orientation }）

##

# The linearization status of the document; usually called "Fast Web View" in
# English locales of Adobe software.
pdfjs-document-properties-linearized = 快速 Web 檢視:
pdfjs-document-properties-linearized-yes = 是
pdfjs-document-properties-linearized-no = 否
pdfjs-document-properties-close-button = 關閉

## Print

pdfjs-print-progress-message = 正在準備列印文件…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = 取消
pdfjs-printing-not-supported = 警告: 此瀏覽器未完整支援列印功能。
pdfjs-printing-not-ready = 警告: 此 PDF 未完成下載以供列印。

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = 切換側邊欄
pdfjs-toggle-sidebar-notification-button =
    .title = 切換側邊欄（包含大綱、附件、圖層的文件）
pdfjs-toggle-sidebar-button-label = 切換側邊欄
pdfjs-document-outline-button =
    .title = 顯示文件大綱（雙擊展開/摺疊所有項目）
pdfjs-document-outline-button-label = 文件大綱
pdfjs-attachments-button =
    .title = 顯示附件
pdfjs-attachments-button-label = 附件
pdfjs-layers-button =
    .title = 顯示圖層（滑鼠雙擊即可將所有圖層重設為預設狀態）
pdfjs-layers-button-label = 圖層
pdfjs-thumbs-button =
    .title = 顯示縮圖
pdfjs-thumbs-button-label = 縮圖
pdfjs-current-outline-item-button =
    .title = 尋找目前的大綱項目
pdfjs-current-outline-item-button-label = 目前的大綱項目
pdfjs-findbar-button =
    .title = 在文件中尋找
pdfjs-findbar-button-label = 尋找
pdfjs-additional-layers = 其他圖層

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = 第 { $page } 頁
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = 第 { $page } 頁的縮圖

## Find panel button title and messages

pdfjs-find-input =
    .title = 尋找
    .placeholder = 在文件中搜尋…
pdfjs-find-previous-button =
    .title = 尋找文字前次出現的位置
pdfjs-find-previous-button-label = 上一個
pdfjs-find-next-button =
    .title = 尋找文字下次出現的位置
pdfjs-find-next-button-label = 下一個
pdfjs-find-highlight-checkbox = 強調全部
pdfjs-find-match-case-checkbox-label = 區分大小寫
pdfjs-find-match-diacritics-checkbox-label = 符合變音符號
pdfjs-find-entire-word-checkbox-label = 符合整個字
pdfjs-find-reached-top = 已搜尋至文件頂端，自底端繼續搜尋
pdfjs-find-reached-bottom = 已搜尋至文件底端，自頂端繼續搜尋
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count = 第 { $current } 筆符合，共符合 { $total } 筆
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit = 符合超過 { $limit } 項
pdfjs-find-not-found = 找不到指定文字

## Predefined zoom values

pdfjs-page-scale-width = 頁面寬度
pdfjs-page-scale-fit = 縮放至頁面大小
pdfjs-page-scale-auto = 自動縮放
pdfjs-page-scale-actual = 實際大小
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = 第 { $page } 頁

## Loading indicator messages

pdfjs-loading-error = 載入 PDF 時發生錯誤。
pdfjs-invalid-file-error = 無效或毀損的 PDF 檔案。
pdfjs-missing-file-error = 找不到 PDF 檔案。
pdfjs-unexpected-response-error = 伺服器回應未預期的內容。
pdfjs-rendering-error = 描繪頁面時發生錯誤。

## Annotations

# Variables:
#   $date (Date) - the modification date of the annotation
#   $time (Time) - the modification time of the annotation
pdfjs-annotation-date-string = { $date } { $time }
# .alt: This is used as a tooltip.
# Variables:
#   $type (String) - an annotation type from a list defined in the PDF spec
# (32000-1:2008 Table 169 – Annotation types).
# Some common types are e.g.: "Check", "Text", "Comment", "Note"
pdfjs-text-annotation-type =
    .alt = [{ $type } 註解]

## Password

pdfjs-password-label = 請輸入用來開啟此 PDF 檔案的密碼。
pdfjs-password-invalid = 密碼不正確，請再試一次。
pdfjs-password-ok-button = 確定
pdfjs-password-cancel-button = 取消
pdfjs-web-fonts-disabled = 已停用網路字型 (Web fonts): 無法使用 PDF 內嵌字型。

## Editing

pdfjs-editor-free-text-button =
    .title = 文字
pdfjs-editor-free-text-button-label = 文字
pdfjs-editor-ink-button =
    .title = 繪圖
pdfjs-editor-ink-button-label = 繪圖
pdfjs-editor-stamp-button =
    .title = 新增或編輯圖片
pdfjs-editor-stamp-button-label = 新增或編輯圖片
pdfjs-editor-highlight-button =
    .title = 強調
pdfjs-editor-highlight-button-label = 強調
pdfjs-highlight-floating-button =
    .title = 強調
pdfjs-highlight-floating-button1 =
    .title = 強調
    .aria-label = 強調
pdfjs-highlight-floating-button-label = 強調

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = 移除繪圖
pdfjs-editor-remove-freetext-button =
    .title = 移除文字
pdfjs-editor-remove-stamp-button =
    .title = 移除圖片
pdfjs-editor-remove-highlight-button =
    .title = 移除強調範圍

##

# Editor Parameters
pdfjs-editor-free-text-color-input = 色彩
pdfjs-editor-free-text-size-input = 大小
pdfjs-editor-ink-color-input = 色彩
pdfjs-editor-ink-thickness-input = 線條粗細
pdfjs-editor-ink-opacity-input = 透​明度
pdfjs-editor-stamp-add-image-button =
    .title = 新增圖片
pdfjs-editor-stamp-add-image-button-label = 新增圖片
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = 線條粗細
pdfjs-editor-free-highlight-thickness-title =
    .title = 更改強調文字以外的項目時的線條粗細
pdfjs-free-text =
    .aria-label = 文本編輯器
pdfjs-free-text-default-content = 開始打字…
pdfjs-ink =
    .aria-label = 圖形編輯器
pdfjs-ink-canvas =
    .aria-label = 使用者建立的圖片

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = 替代文字
pdfjs-editor-alt-text-edit-button-label = 編輯替代文字
pdfjs-editor-alt-text-dialog-label = 挑選一種
pdfjs-editor-alt-text-dialog-description = 替代文字可協助盲人，或於圖片無法載入時提供說明。
pdfjs-editor-alt-text-add-description-label = 新增描述
pdfjs-editor-alt-text-add-description-description = 用 1-2 句文字描述主題、背景或動作。
pdfjs-editor-alt-text-mark-decorative-label = 標示為裝飾性內容
pdfjs-editor-alt-text-mark-decorative-description = 這是裝飾性圖片，例如邊框或浮水印。
pdfjs-editor-alt-text-cancel-button = 取消
pdfjs-editor-alt-text-save-button = 儲存
pdfjs-editor-alt-text-decorative-tooltip = 已標示為裝飾性內容
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = 例如：「有一位年輕男人坐在桌子前面吃飯」

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = 左上角 — 調整大小
pdfjs-editor-resizer-label-top-middle = 頂部中間 — 調整大小
pdfjs-editor-resizer-label-top-right = 右上角 — 調整大小
pdfjs-editor-resizer-label-middle-right = 中間右方 — 調整大小
pdfjs-editor-resizer-label-bottom-right = 右下角 — 調整大小
pdfjs-editor-resizer-label-bottom-middle = 底部中間 — 調整大小
pdfjs-editor-resizer-label-bottom-left = 左下角 — 調整大小
pdfjs-editor-resizer-label-middle-left = 中間左方 — 調整大小

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = 強調色彩
pdfjs-editor-colorpicker-button =
    .title = 更改色彩
pdfjs-editor-colorpicker-dropdown =
    .aria-label = 色彩選項
pdfjs-editor-colorpicker-yellow =
    .title = 黃色
pdfjs-editor-colorpicker-green =
    .title = 綠色
pdfjs-editor-colorpicker-blue =
    .title = 藍色
pdfjs-editor-colorpicker-pink =
    .title = 粉紅色
pdfjs-editor-colorpicker-red =
    .title = 紅色

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = 顯示全部
pdfjs-editor-highlight-show-all-button =
    .title = 顯示全部

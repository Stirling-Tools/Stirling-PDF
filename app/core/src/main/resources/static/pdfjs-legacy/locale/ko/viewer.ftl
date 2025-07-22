# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = 이전 페이지
pdfjs-previous-button-label = 이전
pdfjs-next-button =
    .title = 다음 페이지
pdfjs-next-button-label = 다음
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = 페이지
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = / { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } / { $pagesCount })
pdfjs-zoom-out-button =
    .title = 축소
pdfjs-zoom-out-button-label = 축소
pdfjs-zoom-in-button =
    .title = 확대
pdfjs-zoom-in-button-label = 확대
pdfjs-zoom-select =
    .title = 확대/축소
pdfjs-presentation-mode-button =
    .title = 프레젠테이션 모드로 전환
pdfjs-presentation-mode-button-label = 프레젠테이션 모드
pdfjs-open-file-button =
    .title = 파일 열기
pdfjs-open-file-button-label = 열기
pdfjs-print-button =
    .title = 인쇄
pdfjs-print-button-label = 인쇄
pdfjs-save-button =
    .title = 저장
pdfjs-save-button-label = 저장
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = 다운로드
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = 다운로드
pdfjs-bookmark-button =
    .title = 현재 페이지 (현재 페이지에서 URL 보기)
pdfjs-bookmark-button-label = 현재 페이지
# Used in Firefox for Android.
pdfjs-open-in-app-button =
    .title = 앱에서 열기
# Used in Firefox for Android.
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-open-in-app-button-label = 앱에서 열기

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = 도구
pdfjs-tools-button-label = 도구
pdfjs-first-page-button =
    .title = 첫 페이지로 이동
pdfjs-first-page-button-label = 첫 페이지로 이동
pdfjs-last-page-button =
    .title = 마지막 페이지로 이동
pdfjs-last-page-button-label = 마지막 페이지로 이동
pdfjs-page-rotate-cw-button =
    .title = 시계방향으로 회전
pdfjs-page-rotate-cw-button-label = 시계방향으로 회전
pdfjs-page-rotate-ccw-button =
    .title = 시계 반대방향으로 회전
pdfjs-page-rotate-ccw-button-label = 시계 반대방향으로 회전
pdfjs-cursor-text-select-tool-button =
    .title = 텍스트 선택 도구 활성화
pdfjs-cursor-text-select-tool-button-label = 텍스트 선택 도구
pdfjs-cursor-hand-tool-button =
    .title = 손 도구 활성화
pdfjs-cursor-hand-tool-button-label = 손 도구
pdfjs-scroll-page-button =
    .title = 페이지 스크롤 사용
pdfjs-scroll-page-button-label = 페이지 스크롤
pdfjs-scroll-vertical-button =
    .title = 세로 스크롤 사용
pdfjs-scroll-vertical-button-label = 세로 스크롤
pdfjs-scroll-horizontal-button =
    .title = 가로 스크롤 사용
pdfjs-scroll-horizontal-button-label = 가로 스크롤
pdfjs-scroll-wrapped-button =
    .title = 래핑(자동 줄 바꿈) 스크롤 사용
pdfjs-scroll-wrapped-button-label = 래핑 스크롤
pdfjs-spread-none-button =
    .title = 한 페이지 보기
pdfjs-spread-none-button-label = 펼침 없음
pdfjs-spread-odd-button =
    .title = 홀수 페이지로 시작하는 두 페이지 보기
pdfjs-spread-odd-button-label = 홀수 펼침
pdfjs-spread-even-button =
    .title = 짝수 페이지로 시작하는 두 페이지 보기
pdfjs-spread-even-button-label = 짝수 펼침

## Document properties dialog

pdfjs-document-properties-button =
    .title = 문서 속성…
pdfjs-document-properties-button-label = 문서 속성…
pdfjs-document-properties-file-name = 파일 이름:
pdfjs-document-properties-file-size = 파일 크기:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b }바이트)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b }바이트)
pdfjs-document-properties-title = 제목:
pdfjs-document-properties-author = 작성자:
pdfjs-document-properties-subject = 주제:
pdfjs-document-properties-keywords = 키워드:
pdfjs-document-properties-creation-date = 작성 날짜:
pdfjs-document-properties-modification-date = 수정 날짜:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }
pdfjs-document-properties-creator = 작성 프로그램:
pdfjs-document-properties-producer = PDF 변환 소프트웨어:
pdfjs-document-properties-version = PDF 버전:
pdfjs-document-properties-page-count = 페이지 수:
pdfjs-document-properties-page-size = 페이지 크기:
pdfjs-document-properties-page-size-unit-inches = in
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = 세로 방향
pdfjs-document-properties-page-size-orientation-landscape = 가로 방향
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = 레터
pdfjs-document-properties-page-size-name-legal = 리걸

## Variables:
##   $width (Number) - the width of the (current) page
##   $height (Number) - the height of the (current) page
##   $unit (String) - the unit of measurement of the (current) page
##   $name (String) - the name of the (current) page
##   $orientation (String) - the orientation of the (current) page

pdfjs-document-properties-page-size-dimension-string = { $width } × { $height } { $unit } ({ $orientation })
pdfjs-document-properties-page-size-dimension-name-string = { $width } × { $height } { $unit } ({ $name }, { $orientation })

##

# The linearization status of the document; usually called "Fast Web View" in
# English locales of Adobe software.
pdfjs-document-properties-linearized = 빠른 웹 보기:
pdfjs-document-properties-linearized-yes = 예
pdfjs-document-properties-linearized-no = 아니요
pdfjs-document-properties-close-button = 닫기

## Print

pdfjs-print-progress-message = 인쇄 문서 준비 중…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = 취소
pdfjs-printing-not-supported = 경고: 이 브라우저는 인쇄를 완전히 지원하지 않습니다.
pdfjs-printing-not-ready = 경고: 이 PDF를 인쇄를 할 수 있을 정도로 읽어들이지 못했습니다.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = 사이드바 표시/숨기기
pdfjs-toggle-sidebar-notification-button =
    .title = 사이드바 표시/숨기기 (문서에 아웃라인/첨부파일/레이어 포함됨)
pdfjs-toggle-sidebar-button-label = 사이드바 표시/숨기기
pdfjs-document-outline-button =
    .title = 문서 아웃라인 보기 (더블 클릭해서 모든 항목 펼치기/접기)
pdfjs-document-outline-button-label = 문서 아웃라인
pdfjs-attachments-button =
    .title = 첨부파일 보기
pdfjs-attachments-button-label = 첨부파일
pdfjs-layers-button =
    .title = 레이어 보기 (더블 클릭해서 모든 레이어를 기본 상태로 재설정)
pdfjs-layers-button-label = 레이어
pdfjs-thumbs-button =
    .title = 미리보기
pdfjs-thumbs-button-label = 미리보기
pdfjs-current-outline-item-button =
    .title = 현재 아웃라인 항목 찾기
pdfjs-current-outline-item-button-label = 현재 아웃라인 항목
pdfjs-findbar-button =
    .title = 검색
pdfjs-findbar-button-label = 검색
pdfjs-additional-layers = 추가 레이어

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = { $page } 페이지
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = { $page } 페이지 미리보기

## Find panel button title and messages

pdfjs-find-input =
    .title = 찾기
    .placeholder = 문서에서 찾기…
pdfjs-find-previous-button =
    .title = 지정 문자열에 일치하는 1개 부분을 검색
pdfjs-find-previous-button-label = 이전
pdfjs-find-next-button =
    .title = 지정 문자열에 일치하는 다음 부분을 검색
pdfjs-find-next-button-label = 다음
pdfjs-find-highlight-checkbox = 모두 강조 표시
pdfjs-find-match-case-checkbox-label = 대/소문자 구분
pdfjs-find-match-diacritics-checkbox-label = 분음 부호 일치
pdfjs-find-entire-word-checkbox-label = 단어 단위로
pdfjs-find-reached-top = 문서 처음까지 검색하고 끝으로 돌아와 검색했습니다.
pdfjs-find-reached-bottom = 문서 끝까지 검색하고 앞으로 돌아와 검색했습니다.
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count = { $current } / { $total } 일치
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit = { $limit }개 이상 일치
pdfjs-find-not-found = 검색 결과 없음

## Predefined zoom values

pdfjs-page-scale-width = 페이지 너비에 맞추기
pdfjs-page-scale-fit = 페이지에 맞추기
pdfjs-page-scale-auto = 자동
pdfjs-page-scale-actual = 실제 크기
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = { $page } 페이지

## Loading indicator messages

pdfjs-loading-error = PDF를 로드하는 동안 오류가 발생했습니다.
pdfjs-invalid-file-error = 잘못되었거나 손상된 PDF 파일.
pdfjs-missing-file-error = PDF 파일 없음.
pdfjs-unexpected-response-error = 예기치 않은 서버 응답입니다.
pdfjs-rendering-error = 페이지를 렌더링하는 동안 오류가 발생했습니다.

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
    .alt = [{ $type } 주석]

## Password

pdfjs-password-label = 이 PDF 파일을 열 수 있는 비밀번호를 입력하세요.
pdfjs-password-invalid = 잘못된 비밀번호입니다. 다시 시도하세요.
pdfjs-password-ok-button = 확인
pdfjs-password-cancel-button = 취소
pdfjs-web-fonts-disabled = 웹 폰트가 비활성화됨: 내장된 PDF 글꼴을 사용할 수 없습니다.

## Editing

pdfjs-editor-free-text-button =
    .title = 텍스트
pdfjs-editor-free-text-button-label = 텍스트
pdfjs-editor-ink-button =
    .title = 그리기
pdfjs-editor-ink-button-label = 그리기
pdfjs-editor-stamp-button =
    .title = 이미지 추가 또는 편집
pdfjs-editor-stamp-button-label = 이미지 추가 또는 편집
pdfjs-editor-highlight-button =
    .title = 강조 표시
pdfjs-editor-highlight-button-label = 강조 표시
pdfjs-highlight-floating-button =
    .title = 강조 표시
pdfjs-highlight-floating-button1 =
    .title = 강조 표시
    .aria-label = 강조 표시
pdfjs-highlight-floating-button-label = 강조 표시

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = 그리기 제거
pdfjs-editor-remove-freetext-button =
    .title = 텍스트 제거
pdfjs-editor-remove-stamp-button =
    .title = 이미지 제거
pdfjs-editor-remove-highlight-button =
    .title = 강조 표시 제거

##

# Editor Parameters
pdfjs-editor-free-text-color-input = 색상
pdfjs-editor-free-text-size-input = 크기
pdfjs-editor-ink-color-input = 색상
pdfjs-editor-ink-thickness-input = 두께
pdfjs-editor-ink-opacity-input = 불투명도
pdfjs-editor-stamp-add-image-button =
    .title = 이미지 추가
pdfjs-editor-stamp-add-image-button-label = 이미지 추가
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = 두께
pdfjs-editor-free-highlight-thickness-title =
    .title = 텍스트 이외의 항목을 강조 표시할 때 두께 변경
pdfjs-free-text =
    .aria-label = 텍스트 편집기
pdfjs-free-text-default-content = 입력하세요…
pdfjs-ink =
    .aria-label = 그리기 편집기
pdfjs-ink-canvas =
    .aria-label = 사용자 생성 이미지

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = 대체 텍스트
pdfjs-editor-alt-text-edit-button-label = 대체 텍스트 편집
pdfjs-editor-alt-text-dialog-label = 옵션을 선택하세요
pdfjs-editor-alt-text-dialog-description = 대체 텍스트는 사람들이 이미지를 볼 수 없거나 이미지가 로드되지 않을 때 도움이 됩니다.
pdfjs-editor-alt-text-add-description-label = 설명 추가
pdfjs-editor-alt-text-add-description-description = 주제, 설정, 동작을 설명하는 1~2개의 문장을 목표로 하세요.
pdfjs-editor-alt-text-mark-decorative-label = 장식용으로 표시
pdfjs-editor-alt-text-mark-decorative-description = 테두리나 워터마크와 같은 장식적인 이미지에 사용됩니다.
pdfjs-editor-alt-text-cancel-button = 취소
pdfjs-editor-alt-text-save-button = 저장
pdfjs-editor-alt-text-decorative-tooltip = 장식용으로 표시됨
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = 예를 들어, “한 청년이 식탁에 앉아 식사를 하고 있습니다.”

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = 왼쪽 위 — 크기 조정
pdfjs-editor-resizer-label-top-middle = 가운데 위 - 크기 조정
pdfjs-editor-resizer-label-top-right = 오른쪽 위 — 크기 조정
pdfjs-editor-resizer-label-middle-right = 오른쪽 가운데 — 크기 조정
pdfjs-editor-resizer-label-bottom-right = 오른쪽 아래 - 크기 조정
pdfjs-editor-resizer-label-bottom-middle = 가운데 아래 — 크기 조정
pdfjs-editor-resizer-label-bottom-left = 왼쪽 아래 - 크기 조정
pdfjs-editor-resizer-label-middle-left = 왼쪽 가운데 — 크기 조정

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = 색상
pdfjs-editor-colorpicker-button =
    .title = 색상 변경
pdfjs-editor-colorpicker-dropdown =
    .aria-label = 색상 선택
pdfjs-editor-colorpicker-yellow =
    .title = 노란색
pdfjs-editor-colorpicker-green =
    .title = 녹색
pdfjs-editor-colorpicker-blue =
    .title = 파란색
pdfjs-editor-colorpicker-pink =
    .title = 분홍색
pdfjs-editor-colorpicker-red =
    .title = 빨간색

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = 모두 보기
pdfjs-editor-highlight-show-all-button =
    .title = 모두 보기

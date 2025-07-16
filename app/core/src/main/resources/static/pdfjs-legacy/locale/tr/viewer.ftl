# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Önceki sayfa
pdfjs-previous-button-label = Önceki
pdfjs-next-button =
    .title = Sonraki sayfa
pdfjs-next-button-label = Sonraki
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Sayfa
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = / { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } / { $pagesCount })
pdfjs-zoom-out-button =
    .title = Uzaklaştır
pdfjs-zoom-out-button-label = Uzaklaştır
pdfjs-zoom-in-button =
    .title = Yakınlaştır
pdfjs-zoom-in-button-label = Yakınlaştır
pdfjs-zoom-select =
    .title = Yakınlaştırma
pdfjs-presentation-mode-button =
    .title = Sunum moduna geç
pdfjs-presentation-mode-button-label = Sunum modu
pdfjs-open-file-button =
    .title = Dosya aç
pdfjs-open-file-button-label = Aç
pdfjs-print-button =
    .title = Yazdır
pdfjs-print-button-label = Yazdır
pdfjs-save-button =
    .title = Kaydet
pdfjs-save-button-label = Kaydet
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = İndir
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = İndir
pdfjs-bookmark-button =
    .title = Geçerli sayfa (geçerli sayfanın adresini görüntüle)
pdfjs-bookmark-button-label = Geçerli sayfa

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Araçlar
pdfjs-tools-button-label = Araçlar
pdfjs-first-page-button =
    .title = İlk sayfaya git
pdfjs-first-page-button-label = İlk sayfaya git
pdfjs-last-page-button =
    .title = Son sayfaya git
pdfjs-last-page-button-label = Son sayfaya git
pdfjs-page-rotate-cw-button =
    .title = Saat yönünde döndür
pdfjs-page-rotate-cw-button-label = Saat yönünde döndür
pdfjs-page-rotate-ccw-button =
    .title = Saat yönünün tersine döndür
pdfjs-page-rotate-ccw-button-label = Saat yönünün tersine döndür
pdfjs-cursor-text-select-tool-button =
    .title = Metin seçme aracını etkinleştir
pdfjs-cursor-text-select-tool-button-label = Metin seçme aracı
pdfjs-cursor-hand-tool-button =
    .title = El aracını etkinleştir
pdfjs-cursor-hand-tool-button-label = El aracı
pdfjs-scroll-page-button =
    .title = Sayfa kaydırmayı kullan
pdfjs-scroll-page-button-label = Sayfa kaydırma
pdfjs-scroll-vertical-button =
    .title = Dikey kaydırmayı kullan
pdfjs-scroll-vertical-button-label = Dikey kaydırma
pdfjs-scroll-horizontal-button =
    .title = Yatay kaydırmayı kullan
pdfjs-scroll-horizontal-button-label = Yatay kaydırma
pdfjs-scroll-wrapped-button =
    .title = Yan yana kaydırmayı kullan
pdfjs-scroll-wrapped-button-label = Yan yana kaydırma
pdfjs-spread-none-button =
    .title = Yan yana sayfaları birleştirme
pdfjs-spread-none-button-label = Birleştirme
pdfjs-spread-odd-button =
    .title = Yan yana sayfaları tek numaralı sayfalardan başlayarak birleştir
pdfjs-spread-odd-button-label = Tek numaralı
pdfjs-spread-even-button =
    .title = Yan yana sayfaları çift numaralı sayfalardan başlayarak birleştir
pdfjs-spread-even-button-label = Çift numaralı

## Document properties dialog

pdfjs-document-properties-button =
    .title = Belge özellikleri…
pdfjs-document-properties-button-label = Belge özellikleri…
pdfjs-document-properties-file-name = Dosya adı:
pdfjs-document-properties-file-size = Dosya boyutu:
# Variables:
#   $size_kb (Number) - the PDF file size in kilobytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-kb = { $size_kb } KB ({ $size_b } bayt)
# Variables:
#   $size_mb (Number) - the PDF file size in megabytes
#   $size_b (Number) - the PDF file size in bytes
pdfjs-document-properties-mb = { $size_mb } MB ({ $size_b } bayt)
pdfjs-document-properties-title = Başlık:
pdfjs-document-properties-author = Yazar:
pdfjs-document-properties-subject = Konu:
pdfjs-document-properties-keywords = Anahtar kelimeler:
pdfjs-document-properties-creation-date = Oluşturma tarihi:
pdfjs-document-properties-modification-date = Değiştirme tarihi:
# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date } { $time }
pdfjs-document-properties-creator = Oluşturan:
pdfjs-document-properties-producer = PDF üreticisi:
pdfjs-document-properties-version = PDF sürümü:
pdfjs-document-properties-page-count = Sayfa sayısı:
pdfjs-document-properties-page-size = Sayfa boyutu:
pdfjs-document-properties-page-size-unit-inches = inç
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = dikey
pdfjs-document-properties-page-size-orientation-landscape = yatay
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

pdfjs-document-properties-page-size-dimension-string = { $width } × { $height } { $unit } ({ $orientation })
pdfjs-document-properties-page-size-dimension-name-string = { $width } × { $height } { $unit } ({ $name }, { $orientation })

##

# The linearization status of the document; usually called "Fast Web View" in
# English locales of Adobe software.
pdfjs-document-properties-linearized = Hızlı web görünümü:
pdfjs-document-properties-linearized-yes = Evet
pdfjs-document-properties-linearized-no = Hayır
pdfjs-document-properties-close-button = Kapat

## Print

pdfjs-print-progress-message = Belge yazdırılmaya hazırlanıyor…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = %{ $progress }
pdfjs-print-progress-close-button = İptal
pdfjs-printing-not-supported = Uyarı: Yazdırma bu tarayıcı tarafından tam olarak desteklenmemektedir.
pdfjs-printing-not-ready = Uyarı: PDF tamamen yüklenmedi ve yazdırmaya hazır değil.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Kenar çubuğunu aç/kapat
pdfjs-toggle-sidebar-notification-button =
    .title = Kenar çubuğunu aç/kapat (Belge ana hat/ekler/katmanlar içeriyor)
pdfjs-toggle-sidebar-button-label = Kenar çubuğunu aç/kapat
pdfjs-document-outline-button =
    .title = Belge ana hatlarını göster (Tüm öğeleri genişletmek/daraltmak için çift tıklayın)
pdfjs-document-outline-button-label = Belge ana hatları
pdfjs-attachments-button =
    .title = Ekleri göster
pdfjs-attachments-button-label = Ekler
pdfjs-layers-button =
    .title = Katmanları göster (tüm katmanları varsayılan duruma sıfırlamak için çift tıklayın)
pdfjs-layers-button-label = Katmanlar
pdfjs-thumbs-button =
    .title = Küçük resimleri göster
pdfjs-thumbs-button-label = Küçük resimler
pdfjs-current-outline-item-button =
    .title = Mevcut ana hat öğesini bul
pdfjs-current-outline-item-button-label = Mevcut ana hat öğesi
pdfjs-findbar-button =
    .title = Belgede bul
pdfjs-findbar-button-label = Bul
pdfjs-additional-layers = Ek katmanlar

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Sayfa { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = { $page }. sayfanın küçük hâli

## Find panel button title and messages

pdfjs-find-input =
    .title = Bul
    .placeholder = Belgede bul…
pdfjs-find-previous-button =
    .title = Önceki eşleşmeyi bul
pdfjs-find-previous-button-label = Önceki
pdfjs-find-next-button =
    .title = Sonraki eşleşmeyi bul
pdfjs-find-next-button-label = Sonraki
pdfjs-find-highlight-checkbox = Tümünü vurgula
pdfjs-find-match-case-checkbox-label = Büyük-küçük harfe duyarlı
pdfjs-find-match-diacritics-checkbox-label = Fonetik işaretleri bul
pdfjs-find-entire-word-checkbox-label = Tam sözcükler
pdfjs-find-reached-top = Belgenin başına ulaşıldı, sonundan devam edildi
pdfjs-find-reached-bottom = Belgenin sonuna ulaşıldı, başından devam edildi
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $total } eşleşmeden { $current }. eşleşme
       *[other] { $total } eşleşmeden { $current }. eşleşme
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] { $limit } eşleşmeden fazla
       *[other] { $limit } eşleşmeden fazla
    }
pdfjs-find-not-found = Eşleşme bulunamadı

## Predefined zoom values

pdfjs-page-scale-width = Sayfa genişliği
pdfjs-page-scale-fit = Sayfayı sığdır
pdfjs-page-scale-auto = Otomatik yakınlaştır
pdfjs-page-scale-actual = Gerçek boyut
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = %{ $scale }

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Sayfa { $page }

## Loading indicator messages

pdfjs-loading-error = PDF yüklenirken bir hata oluştu.
pdfjs-invalid-file-error = Geçersiz veya bozulmuş PDF dosyası.
pdfjs-missing-file-error = PDF dosyası eksik.
pdfjs-unexpected-response-error = Beklenmeyen sunucu yanıtı.
pdfjs-rendering-error = Sayfa yorumlanırken bir hata oluştu.

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
    .alt = [{ $type } işareti]

## Password

pdfjs-password-label = Bu PDF dosyasını açmak için parolasını yazın.
pdfjs-password-invalid = Geçersiz parola. Lütfen yeniden deneyin.
pdfjs-password-ok-button = Tamam
pdfjs-password-cancel-button = İptal
pdfjs-web-fonts-disabled = Web fontları devre dışı: Gömülü PDF fontları kullanılamıyor.

## Editing

pdfjs-editor-free-text-button =
    .title = Metin
pdfjs-editor-free-text-button-label = Metin
pdfjs-editor-ink-button =
    .title = Çiz
pdfjs-editor-ink-button-label = Çiz
pdfjs-editor-stamp-button =
    .title = Resim ekle veya düzenle
pdfjs-editor-stamp-button-label = Resim ekle veya düzenle
pdfjs-editor-highlight-button =
    .title = Vurgula
pdfjs-editor-highlight-button-label = Vurgula
pdfjs-highlight-floating-button =
    .title = Vurgula
pdfjs-highlight-floating-button1 =
    .title = Vurgula
    .aria-label = Vurgula
pdfjs-highlight-floating-button-label = Vurgula

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Çizimi kaldır
pdfjs-editor-remove-freetext-button =
    .title = Metni kaldır
pdfjs-editor-remove-stamp-button =
    .title = Resmi kaldır
pdfjs-editor-remove-highlight-button =
    .title = Vurgulamayı kaldır

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Renk
pdfjs-editor-free-text-size-input = Boyut
pdfjs-editor-ink-color-input = Renk
pdfjs-editor-ink-thickness-input = Kalınlık
pdfjs-editor-ink-opacity-input = Saydamlık
pdfjs-editor-stamp-add-image-button =
    .title = Resim ekle
pdfjs-editor-stamp-add-image-button-label = Resim ekle
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Kalınlık
pdfjs-editor-free-highlight-thickness-title =
    .title = Metin dışındaki öğeleri vurgularken kalınlığı değiştir
pdfjs-free-text =
    .aria-label = Metin düzenleyicisi
pdfjs-free-text-default-content = Yazmaya başlayın…
pdfjs-ink =
    .aria-label = Çizim düzenleyicisi
pdfjs-ink-canvas =
    .aria-label = Kullanıcı tarafından oluşturulan resim

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = Alternatif metin
pdfjs-editor-alt-text-edit-button-label = Alternatif metni düzenle
pdfjs-editor-alt-text-dialog-label = Bir seçenek seçin
pdfjs-editor-alt-text-dialog-description = Alternatif metin, insanlar resmi göremediğinde veya resim yüklenmediğinde işe yarar.
pdfjs-editor-alt-text-add-description-label = Açıklama ekle
pdfjs-editor-alt-text-add-description-description = Konuyu, ortamı veya eylemleri tanımlayan bir iki cümle yazmaya çalışın.
pdfjs-editor-alt-text-mark-decorative-label = Dekoratif olarak işaretle
pdfjs-editor-alt-text-mark-decorative-description = Kenarlıklar veya filigranlar gibi dekoratif resimler için kullanılır.
pdfjs-editor-alt-text-cancel-button = Vazgeç
pdfjs-editor-alt-text-save-button = Kaydet
pdfjs-editor-alt-text-decorative-tooltip = Dekoratif olarak işaretlendi
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Örneğin, “Genç bir adam yemek yemek için masaya oturuyor”

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-label-top-left = Sol üst köşe — yeniden boyutlandır
pdfjs-editor-resizer-label-top-middle = Üst orta — yeniden boyutlandır
pdfjs-editor-resizer-label-top-right = Sağ üst köşe — yeniden boyutlandır
pdfjs-editor-resizer-label-middle-right = Orta sağ — yeniden boyutlandır
pdfjs-editor-resizer-label-bottom-right = Sağ alt köşe — yeniden boyutlandır
pdfjs-editor-resizer-label-bottom-middle = Alt orta — yeniden boyutlandır
pdfjs-editor-resizer-label-bottom-left = Sol alt köşe — yeniden boyutlandır
pdfjs-editor-resizer-label-middle-left = Orta sol — yeniden boyutlandır

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Vurgu rengi
pdfjs-editor-colorpicker-button =
    .title = Rengi değiştir
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Renk seçenekleri
pdfjs-editor-colorpicker-yellow =
    .title = Sarı
pdfjs-editor-colorpicker-green =
    .title = Yeşil
pdfjs-editor-colorpicker-blue =
    .title = Mavi
pdfjs-editor-colorpicker-pink =
    .title = Pembe
pdfjs-editor-colorpicker-red =
    .title = Kırmızı

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Tümünü göster
pdfjs-editor-highlight-show-all-button =
    .title = Tümünü göster

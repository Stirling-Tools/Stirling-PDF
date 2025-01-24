# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Önceki Sayfa
pdfjs-previous-button-label = Önceki
pdfjs-next-button =
    .title = Sonraki Sayfa
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
    .title = Sunum Moduna Geç
pdfjs-presentation-mode-button-label = Sunum Modu
pdfjs-open-file-button =
    .title = Dosya Aç
pdfjs-open-file-button-label = Aç
pdfjs-print-button =
    .title = Yazdır
pdfjs-print-button-label = Yazdır
pdfjs-save-button =
    .title = Kaydet
pdfjs-save-button-label = Kaydet

# Used in Firefox for Android as a tooltip for the download button ("download" is a verb).
pdfjs-download-button =
    .title = İndir

# Used in Firefox for Android as a label for the download button ("download" is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = İndir

pdfjs-bookmark-button =
    .title = Geçerli Sayfa (Geçerli Sayfanın URL'sini Görüntüle)
pdfjs-bookmark-button-label = Geçerli Sayfa

## Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Araçlar
pdfjs-tools-button-label = Araçlar

pdfjs-first-page-button =
    .title = İlk Sayfaya Git
pdfjs-first-page-button-label = İlk Sayfaya Git
pdfjs-last-page-button =
    .title = Son Sayfaya Git
pdfjs-last-page-button-label = Son Sayfaya Git
pdfjs-page-rotate-cw-button =
    .title = Saat Yönünde Döndür
pdfjs-page-rotate-cw-button-label = Saat Yönünde Döndür
pdfjs-page-rotate-ccw-button =
    .title = Saat Yönünün Tersine Döndür
pdfjs-page-rotate-ccw-button-label = Saat Yönünün Tersine Döndür
pdfjs-cursor-text-select-tool-button =
    .title = Metin Seçme Aracını Etkinleştir
pdfjs-cursor-text-select-tool-button-label = Metin Seçme Aracı
pdfjs-cursor-hand-tool-button =
    .title = El Aracını Etkinleştir
pdfjs-cursor-hand-tool-button-label = El Aracı
pdfjs-scroll-page-button =
    .title = Sayfa Kaydırmayı Kullan
pdfjs-scroll-page-button-label = Sayfa Kaydırma
pdfjs-scroll-vertical-button =
    .title = Dikey Kaydırmayı Kullan
pdfjs-scroll-vertical-button-label = Dikey Kaydırma
pdfjs-scroll-horizontal-button =
    .title = Yatay Kaydırmayı Kullan
pdfjs-scroll-horizontal-button-label = Yatay Kaydırma
pdfjs-scroll-wrapped-button =
    .title = Sarmalı Kaydırmayı Kullan
pdfjs-scroll-wrapped-button-label = Sarmalı Kaydırma
pdfjs-spread-none-button =
    .title = Sayfa Yayılmalarını Birleştirme
pdfjs-spread-none-button-label = Yayılma Yok
pdfjs-spread-odd-button =
    .title = Tek Numaralı Sayfalardan Başlayarak Sayfa Yayılmalarını Birleştir
pdfjs-spread-odd-button-label = Tek Yayılma
pdfjs-spread-even-button =
    .title = Çift Numaralı Sayfalardan Başlayarak Sayfa Yayılmalarını Birleştir
pdfjs-spread-even-button-label = Çift Yayılma

## Document properties dialog

pdfjs-document-properties-button =
    .title = Belge Özellikleri…
pdfjs-document-properties-button-label = Belge Özellikleri…
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
pdfjs-document-properties-creation-date = Oluşturma Tarihi:
pdfjs-document-properties-modification-date = Değiştirme Tarihi:

# Variables:
#   $date (Date) - the creation/modification date of the PDF file
#   $time (Time) - the creation/modification time of the PDF file
pdfjs-document-properties-date-string = { $date }, { $time }

pdfjs-document-properties-creator = Oluşturan:
pdfjs-document-properties-producer = PDF Üretici:
pdfjs-document-properties-version = PDF Sürümü:
pdfjs-document-properties-page-count = Sayfa Sayısı:
pdfjs-document-properties-page-size = Sayfa Boyutu:
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
pdfjs-document-properties-linearized = Hızlı Web Görünümü:
pdfjs-document-properties-linearized-yes = Evet
pdfjs-document-properties-linearized-no = Hayır
pdfjs-document-properties-close-button = Kapat

## Print

pdfjs-print-progress-message = Belge yazdırma için hazırlanıyor…

# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = %{ $progress }

pdfjs-print-progress-close-button = İptal
pdfjs-printing-not-supported = Uyarı: Yazdırma bu tarayıcıda tam olarak desteklenmiyor.
pdfjs-printing-not-ready = Uyarı: PDF yazdırma için tam olarak yüklenmedi.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Kenar Çubuğunu Aç/Kapat
pdfjs-toggle-sidebar-notification-button =
    .title = Kenar Çubuğunu Aç/Kapat (belge ana hat/ekler/katmanlar içeriyor)
pdfjs-toggle-sidebar-button-label = Kenar Çubuğunu Aç/Kapat
pdfjs-document-outline-button =
    .title = Belge Ana Hatlarını Göster (tüm öğeleri genişletmek/daraltmak için çift tıklayın)
pdfjs-document-outline-button-label = Belge Ana Hatları
pdfjs-attachments-button =
    .title = Ekleri Göster
pdfjs-attachments-button-label = Ekler
pdfjs-layers-button =
    .title = Katmanları Göster (tüm katmanları varsayılan duruma sıfırlamak için çift tıklayın)
pdfjs-layers-button-label = Katmanlar
pdfjs-thumbs-button =
    .title = Küçük Resimleri Göster
pdfjs-thumbs-button-label = Küçük Resimler
pdfjs-current-outline-item-button =
    .title = Geçerli Ana Hat Öğesini Bul
pdfjs-current-outline-item-button-label = Geçerli Ana Hat Öğesi
pdfjs-findbar-button =
    .title = Belgede Bul
pdfjs-findbar-button-label = Bul
pdfjs-additional-layers = Ek Katmanlar

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Sayfa { $page }

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Sayfa { $page } küçük resmi

## Find panel button title and messages

pdfjs-find-input =
    .title = Bul
    .placeholder = Belgede bul…

pdfjs-find-previous-button =
    .title = İfadenin önceki geçtiği yeri bul
pdfjs-find-previous-button-label = Önceki

pdfjs-find-next-button =
    .title = İfadenin sonraki geçtiği yeri bul
pdfjs-find-next-button-label = Sonraki

pdfjs-find-highlight-checkbox = Tümünü Vurgula
pdfjs-find-match-case-checkbox-label = Büyük/Küçük Harf Eşleştir
pdfjs-find-match-diacritics-checkbox-label = Aksanlı Harfleri Eşleştir
pdfjs-find-entire-word-checkbox-label = Tam Kelimeler
pdfjs-find-reached-top = Belgenin başına ulaşıldı, sonundan devam edildi
pdfjs-find-reached-bottom = Belgenin sonuna ulaşıldı, başından devam edildi

# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $current } / { $total } eşleşme
       *[other] { $current } / { $total } eşleşme
    }

# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] { $limit } eşleşmeden fazla
       *[other] { $limit } eşleşmeden fazla
    }

pdfjs-find-not-found = İfade bulunamadı

## Predefined zoom values

pdfjs-page-scale-width = Sayfa Genişliği
pdfjs-page-scale-fit = Sayfayı Sığdır
pdfjs-page-scale-auto = Otomatik Yakınlaştırma
pdfjs-page-scale-actual = Gerçek Boyut

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
pdfjs-invalid-file-error = Geçersiz veya bozuk PDF dosyası.
pdfjs-missing-file-error = PDF dosyası eksik.
pdfjs-unexpected-response-error = Beklenmeyen sunucu yanıtı.
pdfjs-rendering-error = Sayfa oluşturulurken bir hata meydana geldi.

## Annotations

# Variables:
#   $date (Date) - the modification date of the annotation
#   $time (Time) - the modification time of the annotation
pdfjs-annotation-date-string = { $date }, { $time }

# .alt: This is used as a tooltip.
# Variables:
#   $type (String) - an annotation type from a list defined in the PDF spec
# (32000-1:2008 Table 169 – Annotation types).
# Some common types are e.g.: "Check", "Text", "Comment", "Note"
pdfjs-text-annotation-type =
    .alt = [{ $type } İşareti]

## Password

pdfjs-password-label = Bu PDF dosyasını açmak için parolayı girin.
pdfjs-password-invalid = Geçersiz parola. Lütfen tekrar deneyin.
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

pdfjs-free-text =
    .aria-label = Metin Düzenleyici
pdfjs-free-text-default-content = Yazmaya başlayın…
pdfjs-ink =
    .aria-label = Çizim Düzenleyici
pdfjs-ink-canvas =
    .aria-label = Kullanıcı tarafından oluşturulan resim

## Alt-text dialog

# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button-label = Alternatif metin
pdfjs-editor-alt-text-edit-button-label = Alternatif metni düzenle
pdfjs-editor-alt-text-dialog-label = Bir seçenek seçin
pdfjs-editor-alt-text-dialog-description = Alternatif metin, insanlar resmi göremediğinde veya resim yüklenmediğinde yardımcı olur.
pdfjs-editor-alt-text-add-description-label = Bir açıklama ekleyin
pdfjs-editor-alt-text-add-description-description = Konuyu, ortamı veya eylemleri tanımlayan 1-2 cümle yazmaya çalışın.
pdfjs-editor-alt-text-mark-decorative-label = Dekoratif olarak işaretle
pdfjs-editor-alt-text-mark-decorative-description = Bu, kenarlıklar veya filigranlar gibi süsleme amaçlı resimler için kullanılır.
pdfjs-editor-alt-text-cancel-button = İptal
pdfjs-editor-alt-text-save-button = Kaydet
pdfjs-editor-alt-text-decorative-tooltip = Dekoratif olarak işaretlendi

# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Örneğin, "Genç bir adam yemek yemek için masaya oturuyor"

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
pdfjs-editor-highlight-colorpicker-label = Vurgulama rengi

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

pdfjs-editor-highlight-show-all-button-label = Tümünü Göster
pdfjs-editor-highlight-show-all-button =
    .title = Tümünü Göster

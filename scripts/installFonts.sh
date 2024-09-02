#!/bin/bash

LANGS=$1

# Function to install a font package
install_font() {
    echo "Installing font package: $1"
    if ! apk add "$1" --no-cache; then
        echo "Failed to install $1"
    fi
}

# Install common fonts used across many languages
#common_fonts=(
#    font-terminus
#    font-dejavu
#    font-noto
#    font-noto-cjk
#    font-awesome
#    font-noto-extra
#)
#
#for font in "${common_fonts[@]}"; do
#    install_font $font
#done

# Map languages to specific font packages
declare -A language_fonts=(
    ["ar_AR"]="font-noto-arabic"
    ["zh_CN"]="font-isas-misc"
    ["zh_TW"]="font-isas-misc"
    ["ja_JP"]="font-noto font-noto-thai font-noto-tibetan font-ipa font-sony-misc font-jis-misc"
    ["ru_RU"]="font-vollkorn font-misc-cyrillic font-mutt-misc font-screen-cyrillic font-winitzki-cyrillic font-cronyx-cyrillic"
    ["sr_LATN_RS"]="font-vollkorn font-misc-cyrillic font-mutt-misc font-screen-cyrillic font-winitzki-cyrillic font-cronyx-cyrillic"
    ["uk_UA"]="font-vollkorn font-misc-cyrillic font-mutt-misc font-screen-cyrillic font-winitzki-cyrillic font-cronyx-cyrillic"
    ["ko_KR"]="font-noto font-noto-thai font-noto-tibetan"
    ["el_GR"]="font-noto"
    ["hi_IN"]="font-noto-devanagari"
    ["bg_BG"]="font-vollkorn font-misc-cyrillic"
    ["GENERAL"]="font-terminus font-dejavu font-noto font-noto-cjk font-awesome font-noto-extra"
)

# Install fonts for other languages which generally do not need special packages beyond 'font-noto'
other_langs=("en_GB" "en_US" "de_DE" "fr_FR" "es_ES" "ca_CA" "it_IT" "pt_BR" "nl_NL" "sv_SE" "pl_PL" "ro_RO" "hu_HU" "tr_TR" "id_ID" "eu_ES")
if [[ $LANGS == "ALL" ]]; then
    # Install all fonts from the language_fonts map
    for fonts in "${language_fonts[@]}"; do
        for font in $fonts; do
            install_font $font
        done
    done
else
    # Split comma-separated languages and install necessary fonts
    IFS=',' read -ra LANG_CODES <<< "$LANGS"
    for code in "${LANG_CODES[@]}"; do
        if [[ " ${other_langs[@]} " =~ " ${code} " ]]; then
            install_font font-noto
        else
            fonts_to_install=${language_fonts[$code]}
            if [ ! -z "$fonts_to_install" ]; then
                for font in $fonts_to_install; do
                    install_font $font
                done
            fi
        fi
    done
fi

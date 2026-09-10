#!/bin/bash
# Download the corpora the profile derivation and the detection evaluation need.
#
#   ./fetch-corpus.sh [target-dir]
#
# Two corpora, deliberately different in register so profiles derived from one
# can be evaluated on the other:
#   corpora/   Tatoeba sentences (CC-BY 2.0 FR, tatoeba.org) - conversational
#   wiki/      Wikipedia article prose (CC-BY-SA) - third-person, the register
#              documents are written in
#
# Neither is committed: ~100 MB, and the repo should not carry third-party text.
set -u
cd "$(dirname "$0")"
DEST="${1:-$(pwd)/corpus}"
mkdir -p "$DEST/corpora" "$DEST/wiki"
tags=$(awk 'NR>2 {print $1"\t"$2}' languages.tsv)

echo "==> Tatoeba sentences -> $DEST/corpora"
while IFS=$'\t' read -r tag t3; do
  out="$DEST/corpora/$tag.txt"
  [ -s "$out" ] && { echo "    skip $tag"; continue; }
  url="https://downloads.tatoeba.org/exports/per_language/$t3/${t3}_sentences.tsv.bz2"
  if curl -sS -m 300 "$url" -o "$DEST/$t3.bz2"; then
    bunzip2 -c "$DEST/$t3.bz2" 2>/dev/null | cut -f3 | awk 'length($0)>25' | head -4000 > "$out"
    rm -f "$DEST/$t3.bz2"
    printf "    %-3s %6d sentences\n" "$tag" "$(wc -l < "$out")"
  else
    echo "    FAIL $tag"
  fi
done <<< "$tags"

echo "==> Wikipedia article prose -> $DEST/wiki"
CLASSIFIER_CORPUS="$DEST" python3 fetch-wikipedia.py

echo "done: $DEST"

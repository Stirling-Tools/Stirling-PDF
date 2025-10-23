import json
import sys
from pathlib import Path

if len(sys.argv) != 3:
    print('Usage: compare_json.py <file1> <file2>')
    sys.exit(1)

path1, path2 = map(Path, sys.argv[1:])

def load(path):
    with path.open('r', encoding='utf-8') as fh:
        return json.load(fh)

doc1 = load(path1)
doc2 = load(path2)

if doc1 == doc2:
    print('Documents identical')
    sys.exit(0)

pages1 = doc1.get('pages', [])
pages2 = doc2.get('pages', [])

for page_index, (p1, p2) in enumerate(zip(pages1, pages2), start=1):
    elems1 = p1.get('textElements') or []
    elems2 = p2.get('textElements') or []
    if len(elems1) != len(elems2):
        print(f'Page {page_index}: element count {len(elems1)} vs {len(elems2)}')
    diff_found = False
    for elem_index, (e1, e2) in enumerate(zip(elems1, elems2)):
        if e1 == e2:
            continue
        diff_found = True
        print(f'Page {page_index} element {elem_index} differs')
        common_keys = sorted(set(e1) | set(e2))
        for key in common_keys:
            if e1.get(key) != e2.get(key):
                print(f'  {key}: {e1.get(key)!r} -> {e2.get(key)!r}')
        break
    if diff_found:
        break


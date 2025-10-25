#!/bin/bash

# dist/icons 폴더 생성
mkdir -p dist/icons

# sips 명령어로 SVG를 PNG로 변환 (macOS 기본 도구)
for size in 16 48 128; do
  # 임시로 단색 PNG 생성
  python3 << PYTHON
from PIL import Image
img = Image.new('RGB', ($size, $size), color='#4A90E2')
img.save('dist/icons/icon$size.png')
print(f'Created icon$size.png')
PYTHON
done

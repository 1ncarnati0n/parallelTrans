#!/usr/bin/env python3
"""
간단한 PNG 아이콘 생성 스크립트
PIL(Pillow) 라이브러리 필요
"""

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("Pillow 라이브러리가 필요합니다.")
    print("설치: pip install Pillow")
    exit(1)

def create_icon(size):
    # 이미지 생성 (파란색 배경)
    img = Image.new('RGB', (size, size), color='#4A90E2')
    draw = ImageDraw.Draw(img)

    # 텍스트 "A한" 그리기
    font_size = int(size * 0.4)
    try:
        # 시스템 폰트 사용
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", font_size)
    except:
        font = ImageFont.load_default()

    text = "A한"

    # 텍스트 중앙 정렬
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]

    x = (size - text_width) // 2
    y = (size - text_height) // 2

    # 흰색 텍스트
    draw.text((x, y), text, fill='white', font=font)

    return img

# 아이콘 생성
sizes = [16, 48, 128]
output_dir = "dist/icons"

import os
os.makedirs(output_dir, exist_ok=True)

for size in sizes:
    img = create_icon(size)
    filename = f"{output_dir}/icon{size}.png"
    img.save(filename)
    print(f"✓ {filename} 생성 완료")

print("\n모든 아이콘이 생성되었습니다!")
print(f"위치: {output_dir}/")

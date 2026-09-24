"""Generate the 2500 x 1686 LINE customer rich-menu image.

Requires Pillow and a Thai font path passed as the first argument.
"""
from pathlib import Path
import sys
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).with_name("customer-rich-menu.png")
font_path = sys.argv[1]
image = Image.new("RGB", (2500, 1686), "#EAF3F8")
draw = ImageDraw.Draw(image)
labels = [
    ("ยอดปิด", "ดูยอดปิดรายการ", "01"),
    ("วันครบกำหนดชำระ", "เช็กวันชำระรอบถัดไป", "02"),
    ("ยอดค้าง", "ดูยอดที่ยังค้าง", "03"),
    ("สถานะ", "ตรวจสอบรายการ", "04"),
    ("สิทธิ์ส่วนลด", "ดูสิทธิ์ของคุณ", "05"),
    ("ติดต่อแอดมิน", "พูดคุยกับเจ้าหน้าที่", "06"),
]
title = ImageFont.truetype(font_path, 89)
subtitle = ImageFont.truetype(font_path, 49)
number = ImageFont.truetype(font_path, 48)
for idx, (label, hint, ordinal) in enumerate(labels):
    col, row = idx % 3, idx // 3
    left = round(col * 2500 / 3)
    right = round((col + 1) * 2500 / 3)
    top, bottom = row * 843, (row + 1) * 843
    draw.rounded_rectangle((left + 22, top + 22, right - 22, bottom - 22), radius=58, fill="#FFFFFF")
    cx = (left + right) // 2
    cy = top + 295
    draw.ellipse((cx - 113, cy - 113, cx + 113, cy + 113), fill="#D6F3EF")
    draw.text((cx, cy - 8), ordinal, font=number, fill="#086C6A", anchor="mm")
    draw.text((cx, top + 527), label, font=title, fill="#163948", anchor="mm")
    draw.text((cx, top + 660), hint, font=subtitle, fill="#55727D", anchor="mm")
image.save(OUT, optimize=True)
print(OUT, OUT.stat().st_size)

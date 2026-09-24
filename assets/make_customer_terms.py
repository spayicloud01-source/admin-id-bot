"""Generate the exact-text LINE customer payment-terms poster."""
from pathlib import Path
import sys
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).with_name("customer-terms.png")
FONT = sys.argv[1]
W, H = 1080, 1600
image = Image.new("RGB", (W, H), "#F7F4EC")
draw = ImageDraw.Draw(image)
bold = ImageFont.truetype(FONT, 53)
body = ImageFont.truetype(FONT, 35)
small = ImageFont.truetype(FONT, 31)

draw.rounded_rectangle((45, 45, W - 45, H - 45), radius=44, fill="#FFFFFF", outline="#0D5D65", width=7)
draw.rounded_rectangle((45, 45, W - 45, 230), radius=44, fill="#0D5D65")
draw.rectangle((45, 150, W - 45, 230), fill="#0D5D65")
draw.text((W // 2, 105), "เงื่อนไขการชำระค่าเช่าฝาก", font=bold, fill="#FFFFFF", anchor="ma")
draw.text((W // 2, 178), "กรุณาอ่านให้ครบถ้วนก่อนกดยืนยัน", font=small, fill="#D8F2EF", anchor="ma")

rules = [
    "ชำระค่าเช่าตามยอดและวันครบกำหนดที่ระบบ LINE แจ้ง โดยนับรอบจากวันที่รับเงิน",
    "หากยังไม่คืนเงินต้น ต้องชำระค่าเช่าต่อเนื่องจนกว่าจะปิดยอด และต้องปิดยอดภายใน 6 เดือน",
    "กรุณาชำระภายในเวลา 18:00 น. ของวันครบกำหนด",
    "ชำระล่าช้ามีค่าปรับวันละ 50 บาท และเครื่องอาจถูกระงับตามข้อตกลง",
    "ยอดปิด = เงินต้น + ค่าเช่า + ค่าปรับ − ส่วนลด (ถ้ามี)",
    "หากเครื่องถูกล็อก อาจเข้าใช้งานหรือออกจากบัญชี iCloud ไม่ได้ และข้อมูลในเครื่องอาจมีความเสี่ยง",
    "หลังชำระ กรุณาส่งสลิปผ่าน LINE และรอเจ้าหน้าที่ตรวจสอบ",
    "หากมีข้อสงสัย กรุณากด ติดต่อแอดมิน ก่อนถึงวันครบกำหนด",
]

def wrap(text, font, width):
    lines, current = [], ""
    for word in text.split(" "):
        candidate = (current + " " + word).strip()
        if draw.textlength(candidate, font=font) <= width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines

y = 275
for index, rule in enumerate(rules, 1):
    lines = wrap(rule, body, 820)
    draw.ellipse((82, y + 2, 132, y + 52), fill="#D6F3EF")
    draw.text((107, y + 26), str(index), font=small, fill="#086C6A", anchor="mm")
    for line_no, line in enumerate(lines):
        draw.text((155, y + line_no * 46), line, font=body, fill="#173B46")
    y += max(82, len(lines) * 46 + 32)

draw.rounded_rectangle((85, H - 240, W - 85, H - 95), radius=30, fill="#FFF1ED")
warning = "ชำระให้ตรงเวลา เพื่อหลีกเลี่ยงค่าปรับ\nและการระงับการใช้งานเครื่อง"
draw.multiline_text((W // 2, H - 168), warning, font=bold, fill="#B83C32", anchor="mm", align="center", spacing=10)
image.save(OUT, optimize=True)
print(OUT, OUT.stat().st_size)

// Exact LINE button layout; pass an OFL Noto Sans Thai font path as argv[2].
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
const font = process.argv[2];
if (!font) throw new Error('Usage: node scripts/build-customer-menu.mjs FONT_PATH [PREVIEW_PATH]');
const labels = ['ชำระยอด', 'ยอดปิด', 'สถานะ', 'ข้อมูล', 'สิทธิ์ส่วนลด', 'ติดต่อแอดมิน'];
const icons = [
  '<rect x="40" y="65" width="150" height="110" rx="20"/><path d="M40 95h150"/><circle cx="115" cy="137" r="22"/>',
  '<path d="M65 35h100v160l-15-12-20 12-20-12-20 12-25-12z"/><path d="M85 80l20 20 40-40m-60 75h60"/>',
  '<circle cx="115" cy="115" r="80"/><path d="M115 60v55l40 25"/>',
  '<circle cx="115" cy="80" r="35"/><path d="M45 195v-20c0-60 140-60 140 0v20z"/>',
  '<path d="M40 75h150v35c-30 0-30 35 0 35v35H40v-35c30 0 30-35 0-35z"/><path d="M90 150l50-50"/><circle cx="95" cy="100" r="8"/><circle cx="140" cy="150" r="8"/>',
  '<path d="M40 115a75 75 0 0 1 150 0v45"/><rect x="30" y="105" width="35" height="65" rx="15"/><rect x="165" y="105" width="35" height="65" rx="15"/><path d="M185 170v20h-65"/>',
];
const composites = [];
for (let i = 0; i < 6; i++) {
  const x = [0,833,1667][i%3], y = i<3 ? 0 : 843, w = i%3===1 ? 834 : 833;
  const svg = `<svg width="${w}" height="843"><rect x="15" y="15" width="${w-30}" height="813" rx="38" fill="${i===5?'#176858':'#F6F5EE'}"/><circle cx="${w/2}" cy="300" r="165" fill="${i===5?'#F6F5EE':'#E0EAE0'}"/><g transform="translate(${w/2-115},185)" fill="none" stroke="#176858" stroke-width="13" stroke-linecap="round" stroke-linejoin="round">${icons[i]}</g><rect x="${w/2-38}" y="497" width="76" height="8" rx="4" fill="#B79751"/></svg>`;
  composites.push({input:Buffer.from(svg),left:x,top:y});
  const text = await sharp({text:{text:`<span foreground="${i===5?'#FFFFFF':'#174C41'}">${labels[i]}</span>`,font:'Noto Sans Thai Bold 74',fontfile:font,rgba:true}}).png().toBuffer();
  const meta = await sharp(text).metadata();
  composites.push({input:text,left:x+Math.round((w-meta.width)/2),top:y+570});
}
const png = await sharp({create:{width:2500,height:1686,channels:3,background:'#D7E2D5'}}).composite(composites).png().toBuffer();
if (png.length > 1000000) throw new Error('Image exceeds LINE limit');
writeFileSync('lib/customerRichMenuImage.js', `// Six customer buttons, matching staff styling. Noto Sans Thai (OFL).\nexport const CUSTOMER_MENU_IMAGE_BASE64 = '${png.toString('base64')}';\n`);
if (process.argv[3]) await sharp(png).resize(1000).toFile(process.argv[3]);
console.log(`Customer menu: ${png.length} bytes`);

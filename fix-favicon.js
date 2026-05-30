
const sharp = require('sharp');
async function run() {
  // Use the pure handshake-only source image (Image 5)
  const src = 'C:/Users/Celeste/.gemini/antigravity-ide/brain/9e020cf8-a9fc-420d-85a1-faf2dc58b82d/media__1779891271571.png';
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2];
    const distFromWhite = Math.sqrt(Math.pow(255-r,2)+Math.pow(255-g,2)+Math.pow(255-b,2));
    data[i+3] = distFromWhite < 20 ? 0 : distFromWhite < 50 ? Math.floor(distFromWhite * 5) : 255;
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 }})
    .resize(512, 512, { fit: 'contain', background: { r:0,g:0,b:0,alpha:0 } })
    .png()
    .toFile('src/app/icon.png');
  console.log('Favicon done!');
}
run().catch(console.error);


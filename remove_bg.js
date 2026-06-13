const sharp = require('sharp');
const path = require('path');

async function makeTransparent() {
  const inputPath = "C:\\Users\\Celeste\\.gemini\\antigravity-ide\\brain\\7a2f34bc-c9fe-487a-8ae0-029e551d7438\\media__1781307637459.png";
  
  // Get raw pixel data
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Loop through all pixels
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // If pixel is mostly white, make it transparent
    // Using a threshold to catch off-white anti-aliasing pixels too
    if (r > 240 && g > 240 && b > 240) {
      data[i + 3] = 0; // Set alpha to 0
    }
  }

  // Create the transparent outputs
  const transparentBuffer = await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4
    }
  }).png().toBuffer();

  const outputs = [
    { dest: path.join(__dirname, 'public', 'katuwang-logo-final.png'), size: 2048 },
    { dest: path.join(__dirname, 'src', 'app', 'icon.png'), size: 512 },
    { dest: path.join(__dirname, 'src', 'app', 'apple-icon.png'), size: 180 },
    { dest: path.join(__dirname, 'public', 'apple-touch-icon.png'), size: 180 }
  ];

  for (const { dest, size } of outputs) {
    await sharp(transparentBuffer)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toFile(dest);
    console.log('Successfully created ' + dest);
  }
}

makeTransparent().catch(console.error);

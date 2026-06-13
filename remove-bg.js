const Jimp = require('jimp');

async function removeWhite() {
  const imagePath = process.argv[2];
  const outputPath = process.argv[3];
  
  if (!imagePath || !outputPath) {
    console.error('Usage: node remove-bg.js <input> <output>');
    process.exit(1);
  }

  try {
    const image = await Jimp.read(imagePath);
    
    image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx) {
      const red = this.bitmap.data[idx + 0];
      const green = this.bitmap.data[idx + 1];
      const blue = this.bitmap.data[idx + 2];
      
      // If the pixel is very close to white, make it transparent
      if (red > 240 && green > 240 && blue > 240) {
        this.bitmap.data[idx + 3] = 0; // Set alpha to 0
      }
    });

    await image.writeAsync(outputPath);
    console.log('Successfully processed image.');
  } catch (err) {
    console.error(err);
  }
}

removeWhite();

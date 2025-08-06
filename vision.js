// Image comparison functionality using Canvas

// Compare two images and return differences
async function compareImages(designImage, webpageImage) {
  // Create canvases for both images
  const designCanvas = document.createElement('canvas');
  const webpageCanvas = document.createElement('canvas');
  const designCtx = designCanvas.getContext('2d');
  const webpageCtx = webpageCanvas.getContext('2d');

  // Set canvas sizes to match images
  designCanvas.width = designImage.width;
  designCanvas.height = designImage.height;
  webpageCanvas.width = webpageImage.width;
  webpageCanvas.height = webpageImage.height;

  // Draw images to canvases
  designCtx.drawImage(designImage, 0, 0);
  webpageCtx.drawImage(webpageImage, 0, 0);

  // Get image data
  const designData = designCtx.getImageData(0, 0, designCanvas.width, designCanvas.height);
  const webpageData = webpageCtx.getImageData(0, 0, webpageCanvas.width, webpageCanvas.height);

  // Compare pixels and find differences
  const differences = [];
  const tolerance = 30; // Color difference tolerance

  for (let y = 0; y < designCanvas.height; y++) {
    for (let x = 0; x < designCanvas.width; x++) {
      const i = (y * designCanvas.width + x) * 4;
      
      // Get pixel colors
      const designPixel = {
        r: designData.data[i],
        g: designData.data[i + 1],
        b: designData.data[i + 2],
        a: designData.data[i + 3]
      };

      const webpagePixel = {
        r: webpageData.data[i],
        g: webpageData.data[i + 1],
        b: webpageData.data[i + 2],
        a: webpageData.data[i + 3]
      };

      // Check if pixels are significantly different
      if (isPixelDifferent(designPixel, webpagePixel, tolerance)) {
        differences.push({ x, y });
      }
    }
  }

  return differences;
}

// Helper function to check if two pixels are significantly different
function isPixelDifferent(pixel1, pixel2, tolerance) {
  return Math.abs(pixel1.r - pixel2.r) > tolerance ||
         Math.abs(pixel1.g - pixel2.g) > tolerance ||
         Math.abs(pixel1.b - pixel2.b) > tolerance ||
         Math.abs(pixel1.a - pixel2.a) > tolerance;
}

// Create a visual representation of differences
function visualizeDifferences(differences, canvas) {
  const ctx = canvas.getContext('2d');
  
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw differences
  ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
  differences.forEach(diff => {
    ctx.fillRect(diff.x, diff.y, 1, 1);
  });
}

// Export functions
export {
  compareImages,
  visualizeDifferences
}; 
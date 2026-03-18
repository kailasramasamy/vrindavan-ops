import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";
import { createServer } from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate a thumbnail from a PDF file using Puppeteer
 * @param {string} pdfPath - Path to the PDF file
 * @param {string} outputPath - Path where thumbnail should be saved
 * @param {number} width - Thumbnail width (default: 200)
 * @param {number} pageNumber - Page number to render (default: 1)
 * @returns {Promise<string>} Path to the generated thumbnail
 */
export async function generatePdfThumbnail(pdfPath, outputPath, width = 200, pageNumber = 1) {
  let server = null;
  let serverPort = null;
  
  try {
    // Use Puppeteer for reliable PDF rendering
    const puppeteer = await import("puppeteer");
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Convert PDF to absolute path
    const absolutePdfPath = path.isAbsolute(pdfPath) 
      ? pdfPath 
      : path.join(process.cwd(), pdfPath);
    
    // Read PDF to get dimensions
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdfBuffer = fs.readFileSync(absolutePdfPath);
    const data = new Uint8Array(pdfBuffer);
    
    const loadingTask = pdfjsLib.getDocument({ data, verbosity: 0 });
    const pdf = await loadingTask.promise;
    const pdfPage = await pdf.getPage(pageNumber);
    const viewport = pdfPage.getViewport({ scale: 1.0 });
    
    // Calculate dimensions maintaining aspect ratio
    const scale = width / viewport.width;
    const thumbnailHeight = Math.ceil(viewport.height * scale);
    
    // Convert PDF to base64 for embedding
    const pdfBase64 = pdfBuffer.toString('base64');
    
    // Create an HTML page that renders the PDF using PDF.js
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      margin: 0;
      padding: 0;
      background: white;
      display: flex;
      justify-content: center;
      align-items: center;
      width: ${Math.ceil(viewport.width * scale)}px;
      height: ${thumbnailHeight}px;
      overflow: hidden;
    }
    #pdf-container {
      width: ${Math.ceil(viewport.width * scale)}px;
      height: ${thumbnailHeight}px;
    }
    canvas {
      display: block;
      width: 100% !important;
      height: 100% !important;
    }
  </style>
</head>
<body>
  <div id="pdf-container"></div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <script>
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    
    const pdfData = atob('${pdfBase64}');
    const loadingTask = pdfjsLib.getDocument({ data: pdfData, verbosity: 0 });
    
    loadingTask.promise.then(function(pdf) {
      return pdf.getPage(${pageNumber});
    }).then(function(page) {
      const scale = ${scale};
      const viewport = page.getViewport({ scale: scale });
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };
      
      return page.render(renderContext).promise.then(function() {
        document.getElementById('pdf-container').appendChild(canvas);
        // Signal that rendering is complete
        window.renderComplete = true;
      });
    }).catch(function(error) {
      console.error('PDF rendering error:', error);
      window.renderError = error.message;
    });
  </script>
</body>
</html>`;
    
    // Create a simple HTTP server to serve the HTML
    serverPort = 30000 + Math.floor(Math.random() * 1000);
    server = createServer((req, res) => {
      if (req.url === '/') {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': Buffer.byteLength(htmlContent)
        });
        res.end(htmlContent);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    
    await new Promise((resolve, reject) => {
      server.listen(serverPort, '127.0.0.1', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Launch browser
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    try {
      const page = await browser.newPage();
      
      // Set viewport to match PDF dimensions
      const viewportWidth = Math.ceil(viewport.width * scale);
      const viewportHeight = thumbnailHeight;
      await page.setViewport({ 
        width: viewportWidth, 
        height: viewportHeight 
      });
      
      // Navigate to the HTML page
      const htmlUrl = `http://127.0.0.1:${serverPort}/`;
      await page.goto(htmlUrl, { 
        waitUntil: 'networkidle0', 
        timeout: 30000 
      });
      
      // Wait for PDF to render (check for renderComplete flag)
      await page.waitForFunction(() => {
        return window.renderComplete === true || window.renderError !== undefined;
      }, { timeout: 10000 });
      
      // Check if there was an error
      const hasError = await page.evaluate(() => window.renderError);
      if (hasError) {
        throw new Error(`PDF rendering error: ${hasError}`);
      }
      
      // Wait a bit more for canvas to be fully painted
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Take screenshot of the canvas
      await page.screenshot({ 
        path: outputPath, 
        type: 'png',
        clip: {
          x: 0,
          y: 0,
          width: viewportWidth,
          height: viewportHeight
        }
      });
      
      await browser.close();
      
      return outputPath;
    } catch (error) {
      await browser.close();
      throw error;
    } finally {
      // Close server
      if (server) {
        await new Promise((resolve) => {
          server.close(() => resolve());
        });
      }
    }
  } catch (error) {
    // Ensure server is closed on error
    if (server) {
      await new Promise((resolve) => {
        server.close(() => resolve());
      });
    }
    
    // Log error but don't throw - allow the app to continue without thumbnails
    console.error("Error generating PDF thumbnail with Puppeteer:", error.message);
    
    // If it's a dependency issue, provide helpful message
    if (error.message.includes("cannot open shared object file") || 
        error.message.includes("Failed to launch the browser process")) {
      // Detect specific missing library if mentioned in error
      let missingLib = "";
      if (error.message.includes("libcairo")) {
        missingLib = " (missing libcairo)";
      } else if (error.message.includes("libatk")) {
        missingLib = " (missing libatk)";
      } else if (error.message.includes("libasound")) {
        missingLib = " (missing libasound)";
      }
      
      console.error(
        "\n⚠️  Puppeteer system dependencies are missing" + missingLib + ".\n" +
        "To fix this, install the required packages on your Linux server:\n\n" +
        "  Ubuntu 24.04+ (t64 packages):\n" +
        "    sudo apt-get update\n" +
        "    sudo apt-get install -y \\\n" +
        "      libnss3 \\\n" +
        "      libatk1.0-0t64 \\\n" +
        "      libatk-bridge2.0-0t64 \\\n" +
        "      libcups2t64 \\\n" +
        "      libdrm2 \\\n" +
        "      libxkbcommon0 \\\n" +
        "      libxcomposite1 \\\n" +
        "      libxdamage1 \\\n" +
        "      libxfixes3 \\\n" +
        "      libxrandr2 \\\n" +
        "      libgbm1 \\\n" +
        "      libasound2t64 \\\n" +
        "      libcairo2 \\\n" +
        "      libpango-1.0-0 \\\n" +
        "      libpangocairo-1.0-0\n\n" +
        "  Older Ubuntu/Debian:\n" +
        "    sudo apt-get update\n" +
        "    sudo apt-get install -y \\\n" +
        "      libnss3 \\\n" +
        "      libatk1.0-0 \\\n" +
        "      libatk-bridge2.0-0 \\\n" +
        "      libcups2 \\\n" +
        "      libdrm2 \\\n" +
        "      libxkbcommon0 \\\n" +
        "      libxcomposite1 \\\n" +
        "      libxdamage1 \\\n" +
        "      libxfixes3 \\\n" +
        "      libxrandr2 \\\n" +
        "      libgbm1 \\\n" +
        "      libasound2 \\\n" +
        "      libcairo2 \\\n" +
        "      libpango-1.0-0 \\\n" +
        "      libpangocairo-1.0-0\n\n" +
        "  CentOS/RHEL:\n" +
        "    sudo yum install -y \\\n" +
        "      nss atk at-spi2-atk cups-libs drm libXcomposite libXdamage \\\n" +
        "      libXfixes libXrandr mesa-libgbm alsa-lib cairo pango\n\n" +
        "After installing, restart your Node.js application.\n" +
        "Thumbnail generation will be skipped until dependencies are installed.\n"
      );
    }
    
    // Re-throw the error so callers know it failed
    throw error;
  }
}

/**
 * Get thumbnail path for a PDF design file
 * @param {string} designFilePath - Path to the design file (e.g., /uploads/product-labels/designs/file.pdf)
 * @returns {string} Path to the thumbnail
 */
export function getThumbnailPath(designFilePath) {
  if (!designFilePath) return null;

  const fileName = path.basename(designFilePath, path.extname(designFilePath));
  return `/uploads/product-labels/thumbnails/${fileName}.png`;
}

/**
 * Generate thumbnail if it doesn't exist
 * @param {string} designFilePath - Path to the design file
 * @returns {Promise<string|null>} Path to thumbnail or null if generation failed
 */
export async function ensureThumbnailExists(designFilePath) {
  if (!designFilePath) return null;

  try {
    const thumbnailPath = getThumbnailPath(designFilePath);
    const fullThumbnailPath = path.join(process.cwd(), "public", thumbnailPath);

    // Check if thumbnail already exists
    if (fs.existsSync(fullThumbnailPath)) {
      return thumbnailPath;
    }

    // Generate thumbnail
    const fullPdfPath = path.join(process.cwd(), "public", designFilePath);
    if (!fs.existsSync(fullPdfPath)) {
      console.warn(`PDF file not found: ${fullPdfPath}`);
      return null;
    }

    await generatePdfThumbnail(fullPdfPath, fullThumbnailPath, 200, 1);
    
    // Verify thumbnail was created
    if (!fs.existsSync(fullThumbnailPath)) {
      return null;
    }
    
    const fileStats = fs.statSync(fullThumbnailPath);
    if (fileStats.size === 0) {
      fs.unlinkSync(fullThumbnailPath);
      return null;
    }
    
    return thumbnailPath;
  } catch (error) {
    // Silently fail - thumbnails are optional, app should continue working
    // Error details are already logged in generatePdfThumbnail
    return null;
  }
}

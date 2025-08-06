// This file will handle comparison functionality 

export async function compare() {
  console.log("Starting compare function");
  
  // Get the current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  console.log("Current tab:", tab);
  
  // Get the selected frame's preview image URL and data
  const previewImage = document.querySelector('.preview-image');
  console.log("Preview image:", previewImage);
  if (!previewImage || !previewImage.src) {
    console.error('No frame selected or preview not loaded');
    return;
  }

  // Get the frame data from the popup
  const frameData = await chrome.storage.local.get('currentFrameData');
  console.log("Raw frame data from storage:", frameData);
  if (!frameData.currentFrameData) {
    console.error('No frame data available');
    return;
  }

  // Log the frame data structure
  console.log("Frame data structure:", {
    name: frameData.currentFrameData.name,
    type: frameData.currentFrameData.type,
    width: frameData.currentFrameData.width,
    height: frameData.currentFrameData.height,
    x: frameData.currentFrameData.x,
    y: frameData.currentFrameData.y,
    children: frameData.currentFrameData.children?.map(child => ({
      name: child.name,
      type: child.type,
      width: child.width,
      height: child.height,
      x: child.x,
      y: child.y,
      absoluteBoundingBox: child.absoluteBoundingBox,
      absoluteRenderBounds: child.absoluteRenderBounds,
      layoutMode: child.layoutMode,
      paddingLeft: child.paddingLeft,
      paddingRight: child.paddingRight,
      paddingTop: child.paddingTop,
      paddingBottom: child.paddingBottom,
      itemSpacing: child.itemSpacing,
      cornerRadius: child.cornerRadius
    }))
  });

  // Inject the overlay into the current tab
  await chrome.scripting.insertCSS({
    target: { tabId: tab.id },
    css: `
      .design-lens-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100vh;
        z-index: 999999;
        background: transparent;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        overflow: hidden;
        pointer-events: none;
      }
      .design-lens-overlay .figma-frame {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: auto;
        object-fit: contain;
        pointer-events: none;
        z-index: 999999;
      }
      .design-lens-overlay .figma-element {
        position: absolute;
        border: 2px solid transparent;
        background-color: transparent;
        cursor: pointer;
        z-index: 1000000;
        pointer-events: none;
        opacity: 0;
      }
      .design-lens-overlay .figma-element:hover {
        border-color: #2196F3;
        background-color: rgba(33, 150, 243, 0.1);
        opacity: 0.3;
      }
      .design-lens-overlay .element-highlight {
        position: absolute;
        border: 2px solid #2196F3;
        background-color: rgba(33, 150, 243, 0.1);
        pointer-events: none;
        z-index: 1000001;
      }
      .design-lens-overlay .element-info {
        position: fixed;
        background: white;
        border: 1px solid #ccc;
        border-radius: 4px;
        padding: 8px;
        max-width: 300px;
        z-index: 1000002;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        font-size: 16px;
        font-family: 'Arial', sans-serif;
        color: rgb(98, 98, 98);
        margin-top: 20px;
      }
      .design-lens-overlay .element-info br {
        content: "";
        display: block;
        margin: 4px 0;
      }
      .design-lens-overlay .inspection-mode {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        cursor: crosshair;
        z-index: 1000000;
        pointer-events: auto;
      }
      .debug-message {
        position: fixed;
        top: 10px;
        left: 10px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 10px;
        border-radius: 4px;
        z-index: 1000003;
        font-family: monospace;
        display: none; /* Hide the debug message by default */
      }
    `
  });

  console.log("CSS injected, executing script...");

  try {
    // Create and inject the overlay HTML
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (imageUrl, frameData) => {
        try {
          // Add debug message to the page
          const debugMessage = document.createElement('div');
          debugMessage.className = 'debug-message';
          debugMessage.textContent = 'Shift key state: Released';
          document.body.appendChild(debugMessage);

          // Log the frame data
          console.log('Frame data:', frameData);

          // Remove existing overlay if any
          const existingOverlay = document.querySelector('.design-lens-overlay');
          if (existingOverlay) {
            existingOverlay.remove();
          }

          // Create new overlay
          const overlay = document.createElement('div');
          overlay.className = 'design-lens-overlay';
          
          // Create inspection mode layer
          const inspectionMode = document.createElement('div');
          inspectionMode.className = 'inspection-mode';
          overlay.appendChild(inspectionMode);

          // Create Figma frame image
          const figmaFrame = document.createElement('img');
          figmaFrame.className = 'figma-frame';
          figmaFrame.src = imageUrl;
          overlay.appendChild(figmaFrame);

          // Set up message listener for opacity changes

          chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'updateOpacity') {
              // Set opacity on the entire overlay
              overlay.style.opacity = message.opacity / 100;
              sendResponse({ success: true });
            }
            if(message.type==='updatePosition'){
              // Set position of the overlay
              overlay.style.left = `${message.x}px`
              figmaFrame.style.left = `${message.x}px`
              overlay.style.top = `${message.y}px`
              figmaFrame.style.top = `${message.y}px`
            }
            return true; // Keep the message channel open for async response
          });

          // Function to convert Figma color to CSS color
          function figmaColorToCSS(color) {
            if (!color) return 'transparent';
            const { r, g, b, a } = color;
            return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a * 0.75})`;
          }

          // Function to get color from fills array
          function getColorFromFills(fills) {
            if (!fills || !fills.length) return 'transparent';
            const solidFill = fills.find(fill => fill.type === 'SOLID');
            if (!solidFill) return 'transparent';
            return figmaColorToCSS(solidFill.color);
          }

          // Function to get stroke color
          function getStrokeColor(strokes) {
            if (!strokes || !strokes.length) return 'transparent';
            const solidStroke = strokes.find(stroke => stroke.type === 'SOLID');
            if (!solidStroke) return 'transparent';
            return figmaColorToCSS(solidStroke.color);
          }

          // Function to get shadow CSS
          function getShadowCSS(effects) {
            if (!effects || !effects.length) return 'none';
            const dropShadow = effects.find(effect => effect.type === 'DROP_SHADOW' && effect.visible);
            if (!dropShadow) return 'none';
            const { offset, radius, color } = dropShadow;
            return `${offset.x}px ${offset.y}px ${radius}px ${figmaColorToCSS(color)}`;
          }

          // Create interactive elements for each Figma element
          function createFigmaElements(node, parentBox = null, parentX = 0, parentY = 0, isRoot = false) {
            if (!node) return;

            // Skip if no bounding box
            if (!node.absoluteBoundingBox) {
              debugMessage.textContent = `No absoluteBoundingBox for element: ${node.name}`;
              return;
            }

            // Check if element is hidden
            if (node.visible === false) {
              debugMessage.textContent = `Skipping hidden element: ${node.name}`;
              return;
            }

            const box = node.absoluteBoundingBox;
            debugMessage.textContent = `Processing element: ${node.name}\nAbsoluteBoundingBox: ${JSON.stringify(box)}`;
            
            // Calculate relative position
            let relativeX, relativeY;
            if (isRoot) {
              // Root element stays at 0,0
              relativeX = 0;
              relativeY = 0;
            } else if (parentBox) {
              // Calculate position relative to immediate parent
              relativeX = box.x - parentBox.x;
              relativeY = box.y - parentBox.y;
            } else {
              // Fallback to absolute position
              relativeX = box.x;
              relativeY = box.y;
            }

            // Calculate final screen position by adding parent's position
            const finalX = relativeX + parentX;
            const finalY = relativeY + parentY;

            // Create element for this node
            const element = document.createElement('div');
            element.className = 'figma-element';

            debugMessage.textContent = `Element: ${node.name}\nSize: ${box.width}x${box.height}\nRelative position: ${relativeX},${relativeY}\nFinal position: ${finalX},${finalY}`;

            // Get background color and fill color
            const backgroundColor = figmaColorToCSS(node.backgroundColor);
            const fillColor = getColorFromFills(node.fills);
            const strokeColor = getStrokeColor(node.strokes);
            const shadowCSS = getShadowCSS(node.effects);

            // For text elements, add the text content
            if (node.type === 'TEXT' && node.characters) {
              element.textContent = node.characters;
            }

            // Set explicit style attributes
            element.setAttribute('style', `
              position: absolute;
              left: ${finalX}px;
              top: ${finalY}px;
              width: ${box.width}px;
              height: ${box.height}px;
              border: ${node.strokeWeight || 0}px solid ${node.strokeColor};
              background-color: transparent;
              color: transparent;
              cursor: pointer;
              z-index: 1000000;
              pointer-events: none;
              display: flex;
              align-items: center;
              justify-content: center;
              font-family: ${node.style?.fontFamily || 'Arial'};
              font-size: ${node.style?.fontSize ? `${node.style.fontSize}px` : '16px'};
              font-weight: ${node.style?.fontWeight || 'normal'};
              border-radius: ${node.cornerRadius ? `${node.cornerRadius}px` : '0'};
              box-sizing: border-box;
              box-shadow: ${shadowCSS};
              opacity: 0;
            `);
            
            // Store element data
            element.dataset.name = node.name;
            element.dataset.type = node.type;
            element.dataset.cornerRadius = node.cornerRadius || '0';
            element.dataset.width = box.width;
            element.dataset.height = box.height;
            element.dataset.strokeWeight = node.strokeWeight || '0';
            element.dataset.strokeAlign = node.strokeAlign || 'INSIDE';
            element.dataset.shadow = shadowCSS;
            element.dataset.backgroundColor = backgroundColor;
            element.dataset.fillColor = fillColor;
            element.dataset.padding = `${node.paddingTop}px ${node.paddingRight}px ${node.paddingBottom}px ${node.paddingLeft}px`

            overlay.appendChild(element);
            debugMessage.textContent = `Added Figma element: ${node.name} at position ${finalX},${finalY} with size ${box.width}x${box.height} and colors: bg=${backgroundColor}, fill=${fillColor}, stroke=${strokeColor}, shadow=${shadowCSS}`;

            // Recursively create elements for children
            if (node.children) {
              node.children.forEach(child => {
                createFigmaElements(child, box, finalX, finalY, false);
              });
            }
          }

          // Create Figma elements immediately
          debugMessage.textContent = 'Creating Figma elements';
          createFigmaElements(frameData, null, 0, 0, true);
          debugMessage.textContent = 'Finished creating Figma elements';

          let highlightElement = null;
          let infoElements = []; // Array to store all info elements
          let isShiftPressed = false;
          let commentsSection = null; // Store reference to comments section
          let isTextAreaFocused = false; // Track text area focus state

          // Store original borders
          const originalBorders = new Map();

          // Function to get Figma element information
          function getFigmaElementInfo(element) {
            // Get the original colors from the element's dataset and convert to hex
            const backgroundColor = rgbToHex(element.dataset.backgroundColor || 'transparent');
            const fillColor = rgbToHex(element.dataset.fillColor || 'transparent');
            
            // Get the name, showing text content for TEXT type elements
            let name = element.dataset.name;
            if (element.dataset.type === 'TEXT' && element.textContent) {
              name = `"${element.textContent}"`;
            }
            
            return {
              name: name,
              type: element.dataset.type,
              dimensions: `${Math.round(element.offsetWidth)}px × ${Math.round(element.offsetHeight)}px`,
              position: `x: ${Math.round(element.offsetLeft)}px, y: ${Math.round(element.offsetTop)}px`,
              'border-radius': `${element.dataset.cornerRadius}px`,
              // 'padding':`${element.dataset.padding} `,
              'background-color': backgroundColor,
              color: fillColor,
              'border': `${element.dataset.strokeWeight}px` ,
              // 'stroke-align': element.dataset.strokeAlign,
              shadow: element.dataset.shadow
            };
          }

          // Function to highlight an element
          function highlightClickedElement(element) {
            // Remove highlight from previous element
            if (highlightElement) {
              const originalBorder = originalBorders.get(highlightElement);
              highlightElement.style.border = originalBorder || 'none';
              originalBorders.delete(highlightElement);
            }
            
            // Store original border if not already stored
            if (!originalBorders.has(element)) {
              originalBorders.set(element, element.style.border);
            }
            
            // Apply new highlight with thicker, darker red border for HTML elements
            element.style.border = '8px solid #DC3545';
            highlightElement = element;
          }

          // Function to take screenshot
          async function takeScreenshot() {
            try {
              // Hide submit button before taking screenshot
              const submitButton = commentsSection.querySelector('button');
              if (submitButton) {
                submitButton.style.display = 'none';
              }

              // Send message to background script to take screenshot
              chrome.runtime.sendMessage({ action: 'takeScreenshot' }, (response) => {
                // Show submit button again after screenshot is taken
                if (submitButton) {
                  submitButton.style.display = 'block';
                }

                if (response && response.error) {
                  console.error('Error taking screenshot:', response.error);
                } else {
                  console.log('Screenshot saved successfully');
                }
              });
            } catch (error) {
              console.error('Error taking screenshot:', error);
              // Make sure to show the button again even if there's an error
              const submitButton = commentsSection.querySelector('button');
              if (submitButton) {
                submitButton.style.display = 'block';
              }
            }
          }

          // Function to create comments section
          function createCommentsSection() {
            if (commentsSection) return; // Don't create if it already exists

            const screenWidth = window.innerWidth;
            let top, left;

            if (screenWidth < 700) {
              // For small screens, position comments below the last inspector popup
              const allPopups = document.querySelectorAll('.element-info');
              if (allPopups.length > 0) {
                // Find the last popup (either HTML or Figma)
                const lastPopup = allPopups[allPopups.length - 1];
                const lastRect = lastPopup.getBoundingClientRect();
                top = lastRect.bottom + 20;
                left = Math.max(10, (screenWidth - 294) / 2); // Center horizontally with 10px margin
              } else {
                top = 20;
                left = Math.max(10, (screenWidth - 294) / 2); // Center horizontally with 10px margin
              }
            } else {
              // For larger screens, use the original positioning
              const lastHtmlPopup = Array.from(document.querySelectorAll('.element-info'))
                .find(popup => popup.querySelector('.info-type').textContent === 'Browser');
              top = lastHtmlPopup ? lastHtmlPopup.getBoundingClientRect().bottom + 20 : 20;
              left = lastHtmlPopup ? lastHtmlPopup.getBoundingClientRect().left : 20;
            }

            // Remove existing comments section if it exists
            if (commentsSection) {
              commentsSection.remove();
            }

            commentsSection = document.createElement('div');
            commentsSection.style.cssText = `
              position: fixed;
              top: ${top}px;
              left: ${left}px;
              width: 294px;
              background: white;
              border: 1px solid #ccc;
              border-radius: 4px;
              padding: 12px;
              z-index: 1000002;
              box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            `;

            // Add Comments title
            const commentsTitle = document.createElement('div');
            commentsTitle.textContent = 'Comments';
            commentsTitle.style.cssText = `
              font-weight: bold;
              margin-bottom: 8px;
              color: #626262;
              font-size: 16px;
              font-family: Arial, sans-serif;
            `;
            commentsSection.appendChild(commentsTitle);

            // Add text area
            const textArea = document.createElement('textarea');
            textArea.style.cssText = `
              width: 100%;
              height: 60px;
              padding: 8px;
              border: 1px solid #ccc;
              border-radius: 4px;
              margin-bottom: 8px;
              resize: vertical;
              font-family: Arial, sans-serif;
              font-size: 15px;
              color: #626262;
              font-weight: normal;
              box-sizing: border-box;
            `;

            // Add focus event listeners
            textArea.addEventListener('focus', () => {
              isTextAreaFocused = true;
            });

            textArea.addEventListener('blur', () => {
              isTextAreaFocused = false;
            });

            // Add keydown event listener for Enter key
            textArea.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault(); // Prevent new line
                takeScreenshot();
              }
            });

            commentsSection.appendChild(textArea);

            // Add submit button
            const submitButton = document.createElement('button');
            submitButton.textContent = 'Capture';
            submitButton.style.cssText = `
              background-color: #2196F3;
              color: white;
              border: none;
              padding: 6px 12px;
              border-radius: 4px;
              cursor: pointer;
              font-size: 14px;
              float: right;
            `;

            // Add click event listener to submit button
            submitButton.addEventListener('click', () => {
              takeScreenshot();
            });

            commentsSection.appendChild(submitButton);

            // Add clearfix to handle button float
            const clearfix = document.createElement('div');
            clearfix.style.cssText = 'clear: both;';
            commentsSection.appendChild(clearfix);

            document.body.appendChild(commentsSection);
          }

          // Function to parse position string into x and y coordinates
          function parsePosition(positionStr) {
            // Handle the format "position: x: 30px, y: 30px"
            const match = positionStr.match(/x:\s*(\d+)px,\s*y:\s*(\d+)px/);
            if (match) {
              return {
                x: parseInt(match[1]),
                y: parseInt(match[2])
              };
            }
            return null;
          }

          // Function to parse dimensions string into width and height
          function parseDimensions(dimensionsStr) {
            const match = dimensionsStr.match(/(\d+)px\s*×\s*(\d+)px/);
            if (match) {
              return {
                width: parseInt(match[1]),
                height: parseInt(match[2])
              };
            }
            return null;
          }

          // Function to compare and highlight differences in inspector popups
          function highlightDifferences(htmlInfo, figmaInfo) {
            const commonProperties = ['dimensions', 'position', 'color', 'background-color', 'border-radius'];
            
            // Find both inspector popups
            const htmlPopup = document.querySelector('.element-info:not(.figma-info)');
            const figmaPopup = document.querySelector('.element-info.figma-info');
            
            if (!htmlPopup || !figmaPopup) return;

            // Compare and highlight differences
            commonProperties.forEach(prop => {
              // Get the actual values from the elements
              const htmlElement = htmlPopup.querySelector(`[data-property="${prop}"]`);
              const figmaElement = figmaPopup.querySelector(`[data-property="${prop}"]`);
              
              if (htmlElement && figmaElement) {
                // Extract just the value part (after the last colon)
                const htmlValue = htmlElement.textContent.split(':').pop()?.trim();
                const figmaValue = figmaElement.textContent.split(':').pop()?.trim();
                
                let isDifferent = false;

                // Special handling for position and dimensions
                // if (prop === 'position') {
                //   const htmlPos = parsePosition(htmlValue);
                //   const figmaPos = parsePosition(figmaValue);
                //   if (htmlPos && figmaPos) {
                //     isDifferent = htmlPos.x !== figmaPos.x || htmlPos.y !== figmaPos.y;
                //   }
                // } else 
                if (prop === 'dimensions') {
                  const htmlDim = parseDimensions(htmlValue);
                  const figmaDim = parseDimensions(figmaValue);
                  if (htmlDim && figmaDim) {
                    isDifferent = htmlDim.width !== figmaDim.width || htmlDim.height !== figmaDim.height;
                  }
                } else {
                  // For other properties, compare values directly
                  isDifferent = htmlValue !== figmaValue;
                }
                
                // Only highlight if values are different
                if (isDifferent) {
                  htmlElement.style.color = '#DC3545';
                  htmlElement.style.fontWeight = 'bold';
                  
                  figmaElement.style.color = '#28A745';
                  figmaElement.style.fontWeight = 'bold';
                } else {
                  // Reset styles if values are the same
                  htmlElement.style.color = '';
                  htmlElement.style.fontWeight = '';
                  
                  figmaElement.style.color = '';
                  figmaElement.style.fontWeight = '';
                }
              }
            });
          }

          // Function to create info element
          function createInfoElement(info, x, y, type) {
            const infoElement = document.createElement('div');
            infoElement.className = `element-info ${type.toLowerCase()}-info`;
            
            // Calculate position based on type and existing popups
            const popupWidth = 300;
            const popupSpacing = 20;
            const screenWidth = window.innerWidth;
            
            const existingPopups = document.querySelectorAll('.element-info');
            const lastPopup = existingPopups[existingPopups.length - 1];
            
            let left, top;
            
            if (screenWidth < 700) {
              if (lastPopup) {
                const lastRect = lastPopup.getBoundingClientRect();
                left = Math.max(10, (screenWidth - popupWidth) / 2);
                top = lastRect.bottom + popupSpacing;
              } else {
                left = Math.max(10, (screenWidth - popupWidth) / 2);
                top = y;
              }
            } else {
              if (lastPopup) {
                const lastRect = lastPopup.getBoundingClientRect();
                left = lastRect.right + popupSpacing;
                top = lastRect.top;
                
                if (left + popupWidth > screenWidth) {
                  left = x;
                  top = lastRect.bottom + popupSpacing;
                }
              } else {
                left = x;
                top = y;
              }
            }
            
            if (left + popupWidth > screenWidth) {
              left = screenWidth - popupWidth - 10;
            }
            
            infoElement.style.left = `${left}px`;
            infoElement.style.top = `${top}px`;
            
            const typeHeader = document.createElement('div');
            typeHeader.className = 'info-type';
            typeHeader.textContent = type;
            typeHeader.style.cssText = `
              background-color: ${type === 'Figma' ? '#28A745' : '#DC3545'};
              color: white;
              padding: 4px 8px;
              border-radius: 4px 4px 0 0;
              font-weight: bold;
              margin-bottom: 8px;
            `;
            
            const content = Object.entries(info)
              .map(([key, value]) => key==='padding'||key==='margin'? null:`<div data-property="${key}"><strong>${key.charAt(0).toUpperCase()+key.slice(1)}:</strong> ${value}</div>`)
              .join('');
            
            infoElement.innerHTML = content;
            infoElement.insertBefore(typeHeader, infoElement.firstChild);
            
            infoElement.style.cssText += `
              position: fixed;
              background: white;
              border: 1px solid #ccc;
              border-radius: 4px;
              padding: 8px;
              width: ${popupWidth}px;
              z-index: 1000002;
              box-shadow: 0 2px 4px rgba(0,0,0,0.2);
              font-size: 20px;
              font-family: 'Arial', sans-serif;
              color: rgb(98, 98, 98);
              max-height: 80vh;
              overflow-y: auto;
              opacity: 1 !important;
              pointer-events: auto;
            `;
            
            return infoElement;
          }

          // Function to convert RGB to hex
          function rgbToHex(rgb) {
            // Handle transparent/empty values
            if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') {
              return 'transparent';
            }
            
            // Extract RGB values using regex
            const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
            if (!match) return rgb; // Return original if not RGB format
            
            const r = parseInt(match[1]);
            const g = parseInt(match[2]);
            const b = parseInt(match[3]);
            
            return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
          }

          // Function to get page element information
          function getPageElementInfo(element) {
            const rect = element.getBoundingClientRect();
            const styles = window.getComputedStyle(element);
            return {
              tag: element.tagName.toLowerCase(),
              dimensions: `${Math.round(rect.width)}px × ${Math.round(rect.height)}px`,
              position: `x: ${Math.round(rect.left)}px, y: ${Math.round(rect.top)}px`,
              'border-radius': styles.borderRadius,
              padding: `${styles.paddingTop} ${styles.paddingRight} ${styles.paddingBottom} ${styles.paddingLeft}`,
              margin: `${styles.marginTop} ${styles.marginRight} ${styles.marginBottom} ${styles.marginLeft}`,
              'background-color': rgbToHex(styles.backgroundColor),
              color: rgbToHex(styles.color),
              fontSize: styles.fontSize,
              fontFamily: styles.fontFamily
            };
          }

          // Function to get element at point
          function getElementAtPoint(x, y) {
            // Temporarily hide the overlay to get the actual element
            overlay.style.display = 'none';
            const element = document.elementFromPoint(x, y);
            overlay.style.display = 'flex';
            return element;
          }

          // Handle keydown events
          window.addEventListener('keydown', (e) => {
            if (e.key === 'Shift') {
              isShiftPressed = true;
              debugMessage.textContent = 'Shift key is down. Selecting Figma elements';
              debugMessage.style.display = 'block';
              // Show all Figma elements
              document.querySelectorAll('.figma-element').forEach(el => {
                // Store original border if not already stored
                if (!originalBorders.has(el)) {
                  originalBorders.set(el, el.style.border);
                }
                el.style.pointerEvents = 'auto';
                el.style.border = '2px solid #2196F3';
              });
            } else if (e.key === 'Escape') {
              if (isTextAreaFocused) {
                // If text area is focused, just blur it
                const textArea = commentsSection.querySelector('textarea');
                if (textArea) {
                  textArea.blur();
                }
              } else {
                // Remove all info elements when Escape is pressed and text area is not focused
                infoElements.forEach(element => element.remove());
                infoElements = [];
                
                // Remove highlight from last element
                if (highlightElement) {
                  // Restore original border or remove it completely
                  const originalBorder = originalBorders.get(highlightElement);
                  highlightElement.style.border = originalBorder || 'none';
                  originalBorders.delete(highlightElement); // Clean up the stored border
                  highlightElement = null;
                }

                // Remove comments section
                if (commentsSection) {
                  commentsSection.remove();
                  commentsSection = null;
                }
              }
            } else if (e.key === 'Backspace' && !isTextAreaFocused) {
              // Remove the last info element when Backspace is pressed, but only if text area is not focused
              if (infoElements.length > 0) {
                const lastElement = infoElements.pop();
                lastElement.remove();
              }
            }
          });

          window.addEventListener('keyup', (e) => {
            if (e.key === 'Shift') {
              isShiftPressed = false;
              debugMessage.textContent = 'Shift key state: Released';
              debugMessage.style.display = 'none';
              // Hide all Figma elements
              document.querySelectorAll('.figma-element').forEach(el => {
                el.style.pointerEvents = 'none';
                // Restore original border
                el.style.border = originalBorders.get(el) || 'none';
              });
            }
          });

          // Handle click for element info
          overlay.addEventListener('click', (e) => {
            if (isShiftPressed) {
              // Inspect Figma elements
              const figmaElement = document.elementFromPoint(e.clientX, e.clientY);
              
              if (figmaElement && figmaElement.classList.contains('figma-element')) {
                const info = getFigmaElementInfo(figmaElement);
                const infoElement = createInfoElement(info, e.clientX + 10, e.clientY + 10, 'Figma');
                document.body.appendChild(infoElement);
                infoElements.push(infoElement);
                
                // Update comments section position if it exists
                if (commentsSection) {
                  const lastPopup = document.querySelectorAll('.element-info');
                  if (lastPopup.length > 0) {
                    const lastRect = lastPopup[lastPopup.length - 1].getBoundingClientRect();
                    commentsSection.style.top = `${lastRect.bottom + 20}px`;
                  }
                }

                // Check if there's a previously inspected HTML element
                const htmlInfoElement = document.querySelector('.element-info.browser-info');
                if (htmlInfoElement) {
                  // Extract HTML info from the element
                  const htmlInfo = {
                    dimensions: htmlInfoElement.querySelector('[data-property="dimensions"]')?.textContent,
                    position: htmlInfoElement.querySelector('[data-property="position"]')?.textContent,
                    color: htmlInfoElement.querySelector('[data-property="color"]')?.textContent,
                    'background-color': htmlInfoElement.querySelector('[data-property="background-color"]')?.textContent,
                    'border-radius': htmlInfoElement.querySelector('[data-property="border-radius"]')?.textContent
                  };

                  // Highlight differences in both popups
                  highlightDifferences(htmlInfo, info);
                }
              }
            } else {
              // Inspect page elements
              const pageElement = getElementAtPoint(e.clientX, e.clientY);
              
              if (pageElement && !pageElement.classList.contains('design-lens-overlay')) {
                const info = getPageElementInfo(pageElement);
                const infoElement = createInfoElement(info, e.clientX + 10, e.clientY + 10, 'Browser');
                document.body.appendChild(infoElement);
                infoElements.push(infoElement);
                highlightClickedElement(pageElement);
                createCommentsSection();

                // Find the last Figma info element if it exists
                const figmaInfoElement = document.querySelector('.element-info.figma-info');
                if (figmaInfoElement) {
                  // Extract Figma info from the element
                  const figmaInfo = {
                    dimensions: figmaInfoElement.querySelector('[data-property="dimensions"]')?.textContent,
                    position: figmaInfoElement.querySelector('[data-property="position"]')?.textContent,
                    color: figmaInfoElement.querySelector('[data-property="color"]')?.textContent,
                    'background-color': figmaInfoElement.querySelector('[data-property="background-color"]')?.textContent,
                    'border-radius': figmaInfoElement.querySelector('[data-property="border-radius"]')?.textContent
                  };

                  // Highlight differences in both popups
                  highlightDifferences(info, figmaInfo);
                }
              }
            }
          });

          document.body.appendChild(overlay);
          debugMessage.textContent = 'Overlay added to document body';
          return true; // Indicate successful execution
        } catch (error) {
          console.error('Error in content script:', error);
          throw error;
        }
      },
      args: [previewImage.src, frameData.currentFrameData]
    });

    // Wait a moment for the content script to initialize
    await new Promise(resolve => setTimeout(resolve, 100));

    // Now send the initial opacity value
    await chrome.tabs.sendMessage(tab.id, {
      type: 'updateOpacity',
      opacity: 70
    });

    console.log("Script execution results:", results);
  } catch (error) {
    console.error('Error executing script:', error);
  }

  console.log("Script execution completed");
} 
import { compare } from './compare.js';

document.addEventListener('DOMContentLoaded', function () {
  // Get the active tab
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const activeTab = tabs[0];
  });

  const authButton = document.querySelector('.auth-button');
  const authForm = document.querySelector('.auth-form');
  const submitToken = document.querySelector('.submit-token');
  const cancelToken = document.querySelector('.cancel-token');
  const tokenInput = document.querySelector('.token-input');
  const urlInput = document.querySelector('.url-input');
  const pasteButton = document.querySelector('.paste-inline-button');
  const compareButton = document.querySelector('.compare-button');
  const authWarning = document.querySelector('.auth-warning');
  const authStatus = document.querySelector('.auth-status');
  const signOutButton = document.querySelector('.sign-out-button');
  const frameSelect = document.querySelector('.frame-select');
  const reloadFramesButton = document.querySelector('.reload-frames-button');
  const framePreview = document.querySelector('.frame-preview');
  const previewImage = document.querySelector('.preview-image');
  const previewLoading = document.querySelector('.preview-loading');
  const pageSelect = document.querySelector('.page-select');
  const reloadPagesButton = document.querySelector('.reload-pages-button');

  let errorMessageElement = null;
  let currentFileKey = null;
  let currentPageId = null;
  let frames = []; // Add frames array at module scope

  // Check for existing token on popup open
  checkSavedToken();

  async function checkSavedToken() {
    try {
      const result = await chrome.storage.local.get('figmaToken');
      if (result.figmaToken) {
        // Verify if the saved token is still valid
        validateAndSetupToken(result.figmaToken, true);
      }
    } catch (error) {
      console.error('Error checking saved token:', error);
    }
  }

  async function validateAndSetupToken(token, isSavedToken = false) {
    try {
      const response = await fetch('https://api.figma.com/v1/me', {
        method: 'GET',
        headers: {
          'X-Figma-Token': token,
          'Accept': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        if (isSavedToken) {
          // If saved token is invalid, clear it
          chrome.storage.local.remove('figmaToken');
          return;
        }
        handleAuthError(response.status, data);
        return false;
      }

      // Token is valid, setup the UI
      setupAuthenticatedState();

      // Save token if it's new
      if (!isSavedToken) {
        chrome.storage.local.set({ 'figmaToken': token }, () => {
          if (chrome.runtime.lastError) {
            console.error('Error storing token:', chrome.runtime.lastError);
          } else {
            console.log('Token stored successfully');
          }
        });
      }

      return true;
    } catch (error) {
      if (!isSavedToken) {
        handleAuthError(null, null, error);
      }
      return false;
    }
  }

  function handleAuthError(status, data, error = null) {
    let errorMessage;
    if (status === 403) {
      errorMessage = 'Invalid token: Access denied';
    } else if (status === 429) {
      errorMessage = 'Too many requests. Please try again later';
    } else if (error && error.message.includes('Failed to fetch')) {
      errorMessage = 'Network error: Please check your internet connection';
    } else {
      errorMessage = `API Error: ${(data && data.err) || error?.message || 'Unknown error'}`;
    }
    showErrorMessage(errorMessage);

    setupUnauthenticatedState();
  }

  function setupAuthenticatedState() {
    authForm.style.display = 'none';
    authWarning.innerHTML = '<span class="material-icons">check_circle</span>Successfully authenticated';
    authWarning.style.color = '#4CAF50';
    authButton.style.display = 'none';
    signOutButton.style.display = 'block';

    // Enable only URL input and paste button initially
    urlInput.disabled = false;
    pasteButton.disabled = false;
    compareButton.disabled = true;  // Keep compare button disabled until frame is selected

    // Keep selectors disabled until valid URL is entered
    frameSelect.disabled = true;
    reloadFramesButton.disabled = true;
    pageSelect.disabled = true;
    reloadPagesButton.disabled = true;
    framePreview.style.display = 'none';
  }

  function setupUnauthenticatedState() {
    authWarning.innerHTML = '<span class="material-icons">warning</span>Not authenticated with Figma';
    authWarning.style.color = '#dc3545';
    authButton.style.display = 'block';
    signOutButton.style.display = 'none';

    // Disable all interactive elements
    urlInput.disabled = true;
    pasteButton.disabled = true;
    compareButton.disabled = true;
    frameSelect.disabled = true;
    reloadFramesButton.disabled = true;
    pageSelect.disabled = true;
    reloadPagesButton.disabled = true;

    // Clear everything
    urlInput.value = '';
    currentFileKey = null;
    currentPageId = null;
    framePreview.style.display = 'none';
  }

  // Show auth form when clicking Authenticate
  authButton.addEventListener('click', () => {
    authForm.style.display = 'block';
    authButton.style.display = 'none';
    removeErrorMessage();
  });

  // Handle sign out
  signOutButton.addEventListener('click', () => {
    chrome.storage.local.remove('figmaToken', () => {
      if (chrome.runtime.lastError) {
        console.error('Error removing token:', chrome.runtime.lastError);
      } else {
        console.log('Token removed successfully');
        setupUnauthenticatedState();
      }
    });
  });

  // Hide auth form when clicking Cancel
  cancelToken.addEventListener('click', () => {
    authForm.style.display = 'none';
    authButton.style.display = 'block';
    tokenInput.value = ''; // Clear the input
    removeErrorMessage();
  });

  function removeErrorMessage() {
    if (errorMessageElement) {
      errorMessageElement.remove();
      errorMessageElement = null;
    }
  }

  function showErrorMessage(message) {
    removeErrorMessage();
    errorMessageElement = document.createElement('div');
    errorMessageElement.className = 'auth-error';
    errorMessageElement.textContent = message;
    authForm.insertBefore(errorMessageElement, authForm.querySelector('.button-group'));
  }

  // Handle token submission
  submitToken.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    if (!token) {
      showErrorMessage('Please enter a valid token');
      return;
    }

    // Disable submit button and show loading state
    submitToken.disabled = true;
    submitToken.textContent = 'Verifying...';
    removeErrorMessage();

    try {
      await validateAndSetupToken(token);
    } finally {
      // Reset submit button state
      submitToken.disabled = false;
      submitToken.textContent = 'Submit Token';
    }
  });

  // Validate Figma URL
  function isValidFigmaUrl(url) {
    try {
      const figmaUrl = new URL(url);
      return (
        figmaUrl.hostname === 'www.figma.com' &&
        figmaUrl.pathname.startsWith('/design/') &&
        figmaUrl.pathname.split('/').length >= 3
      );
    } catch {
      return false;
    }
  }

  // Extract file key from Figma URL
  function getFigmaFileKey(url) {
    try {
      const pathname = new URL(url).pathname;
      const parts = pathname.split('/');
      // File key is now the part after 'design'
      const designIndex = parts.indexOf('design');
      return designIndex >= 0 && parts.length > designIndex + 1 ? parts[designIndex + 1] : null;
    } catch {
      return null;
    }
  }

  // Handle URL input changes
  function handleUrlChange() {
    const url = urlInput.value.trim();
    if (isValidFigmaUrl(url)) {
      urlInput.classList.remove('invalid');
      pageSelect.disabled = false;
      reloadPagesButton.disabled = false;
      frameSelect.disabled = true;
      reloadFramesButton.disabled = true;
      currentFileKey = getFigmaFileKey(url);
      console.log('Extracted file key:', currentFileKey); // Debug log
      loadPagesForFile(currentFileKey, true);
    } else if (url) {
      urlInput.classList.add('invalid');
      pageSelect.disabled = true;
      reloadPagesButton.disabled = true;
      frameSelect.disabled = true;
      reloadFramesButton.disabled = true;
      pageSelect.innerHTML = '<option>Please enter a valid Figma design URL</option>';
      frameSelect.innerHTML = '<option>Select frame</option>';
      currentFileKey = null;
      currentPageId = null;
      framePreview.style.display = 'none';
    } else {
      urlInput.classList.remove('invalid');
      pageSelect.disabled = true;
      reloadPagesButton.disabled = true;
      frameSelect.disabled = true;
      reloadFramesButton.disabled = true;
      pageSelect.innerHTML = '<option>First authenticate and enter a Figma URL</option>';
      frameSelect.innerHTML = '<option>Select frame</option>';
      currentFileKey = null;
      currentPageId = null;
      framePreview.style.display = 'none';
    }
  }

  // Handle paste button click
  pasteButton.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      urlInput.value = text;
      handleUrlChange(); // This will trigger the page loading
      urlInput.focus();

      // Show success message
      const buttonText = pasteButton.querySelector('.button-text');
      const successMessage = pasteButton.querySelector('.success-message');
      buttonText.style.display = 'none';
      successMessage.style.display = 'flex';
      pasteButton.classList.add('success');

      setTimeout(() => {
        buttonText.style.display = 'inline';
        successMessage.style.display = 'none';
        pasteButton.classList.remove('success');
      }, 5000);

    } catch (err) {
      console.error('Failed to read clipboard:', err);
      urlInput.focus();
      const success = document.execCommand('paste');
      if (success) {
        handleUrlChange();
      }
    }
  });

  // Handle manual paste in the input field
  urlInput.addEventListener('paste', () => {
    setTimeout(handleUrlChange, 0);
  });

  // Handle URL input changes
  urlInput.addEventListener('input', handleUrlChange);

  // Handle page selection change
  pageSelect.addEventListener('change', (e) => {
    const pageId = e.target.value;
    if (!pageId || pageId === 'loading') return;

    currentPageId = pageId;
    frameSelect.disabled = false;
    reloadFramesButton.disabled = false;
    loadFramesForPage(pageId, true);
  });

  // Handle reload pages button
  reloadPagesButton.addEventListener('click', () => {
    if (currentFileKey) {
      loadPagesForFile(currentFileKey, true);
    }
  });

  // Handle reload frames button
  reloadFramesButton.addEventListener('click', () => {
    if (currentPageId) {
      framePreview.style.display = 'none';
      loadFramesForPage(currentPageId, true);
    }
  });

  async function loadPagesForFile(fileKey, shouldLoadFirstPage = false) {
    if (!fileKey) return;

    pageSelect.innerHTML = '<option>Loading pages...</option>';
    frameSelect.innerHTML = '<option>Select frame</option>';
    framePreview.style.display = 'none';

    try {
      const token = (await chrome.storage.local.get('figmaToken')).figmaToken;
      console.log('Fetching file with key:', fileKey); // Debug log

      const response = await fetch(`https://api.figma.com/v1/files/${fileKey}`, {
        headers: {
          'X-Figma-Token': token
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch file data');
      }

      const data = await response.json();
      console.log('Figma API response:', data); // Debug log

      if (!data.document || !data.document.children) {
        throw new Error('Invalid file data structure');
      }

      const pages = data.document.children.map(page => ({
        id: page.id,
        name: page.name
      }));

      console.log('Found pages:', pages); // Debug log

      if (pages.length === 0) {
        pageSelect.innerHTML = '<option>No pages found in this file</option>';
        return;
      }

      // Create the options HTML
      const optionsHtml = pages
        .map(page => `<option value="${page.id}">${page.name}</option>`)
        .join('');

      console.log('Generated options HTML:', optionsHtml); // Debug log

      // Set the innerHTML
      pageSelect.innerHTML = optionsHtml;

      // Select first page and load its frames
      if (pages.length > 0) {
        currentPageId = pages[0].id;
        pageSelect.value = currentPageId;
        frameSelect.disabled = false;
        reloadFramesButton.disabled = false;
        loadFramesForPage(currentPageId, true);
      }

    } catch (error) {
      console.error('Error loading pages:', error);
      pageSelect.innerHTML = '<option>Error loading pages</option>';
      frameSelect.innerHTML = '<option>Error loading pages</option>';
      framePreview.style.display = 'none';
    }
  }

  async function loadFramesForPage(pageId, shouldLoadFirstFrame = false) {
    if (!pageId) return;

    frameSelect.innerHTML = '<option>Loading frames...</option>';
    framePreview.style.display = 'none';
    compareButton.disabled = true;  // Disable compare button while loading frames

    try {
      const token = (await chrome.storage.local.get('figmaToken')).figmaToken;
      const response = await fetch(`https://api.figma.com/v1/files/${currentFileKey}`, {
        headers: {
          'X-Figma-Token': token
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch file data');
      }

      const data = await response.json();
      const page = data.document.children.find(p => p.id === pageId);

      if (!page) {
        throw new Error('Page not found');
      }

      frames = extractFrames(page); // Store frames in module scope variable

      if (frames.length === 0) {
        frameSelect.innerHTML = '<option>No frames found on this page</option>';
        return;
      }

      frameSelect.innerHTML = frames
        .map(frame => `<option value="${frame.id}">${frame.name}</option>`)
        .join('');

      // If this is a reload or initial load, show the first frame's preview
      if (shouldLoadFirstFrame && frames.length > 0) {
        const firstFrameId = frames[0].id;
        frameSelect.value = firstFrameId;
        loadFramePreview(firstFrameId);
        compareButton.disabled = false;  // Enable compare button when first frame is loaded
      }

    } catch (error) {
      console.error('Error loading frames:', error);
      frameSelect.innerHTML = '<option>Error loading frames</option>';
      framePreview.style.display = 'none';
    }
  }

  // Recursively extract frames from Figma document
  function extractFrames(node, frames = [], isTopLevel = true) {
    if (node.type === 'FRAME') {
      // Only add the frame if it's at the top level
      if (isTopLevel) {
        frames.push({
          id: node.id,
          name: node.name,
          data: node  // Store the complete frame data
        });
      }
      // Any frames inside this frame are not top-level
      if (node.children) {
        node.children.forEach(child => extractFrames(child, frames, false));
      }
    } else {
      // For non-frame nodes, maintain the current isTopLevel value
      if (node.children) {
        node.children.forEach(child => extractFrames(child, frames, isTopLevel));
      }
    }
    return frames;
  }

  async function loadFramePreview(frameId) {
    try {
      // Show loading state
      framePreview.style.display = 'block';
      previewImage.style.display = 'none';
      previewLoading.style.display = 'flex';

      const token = (await chrome.storage.local.get('figmaToken')).figmaToken;
      const response = await fetch(`https://api.figma.com/v1/images/${currentFileKey}?ids=${frameId}&scale=2`, {
        headers: {
          'X-Figma-Token': token
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch frame preview');
      }

      const data = await response.json();
      const imageUrl = data.images[frameId];

      if (!imageUrl) {
        throw new Error('No preview available');
      }

      // Load the image
      previewImage.src = imageUrl;
      previewImage.onload = () => {
        previewLoading.style.display = 'none';
        previewImage.style.display = 'block';
      };

      // Store the frame data
      const frameData = frames.find(frame => frame.id === frameId);
      if (frameData) {
        await chrome.storage.local.set({ 'currentFrameData': frameData.data });
      }

    } catch (error) {
      console.error('Error loading frame preview:', error);
      framePreview.style.display = 'none';
    }
  }

  // Handle frame selection change
  frameSelect.addEventListener('change', (e) => {
    const frameId = e.target.value;
    if (!frameId || frameId === 'loading') return;

    loadFramePreview(frameId);
    compareButton.disabled = false;  // Enable compare button only when a valid frame is selected
  });

  // Add click event listener to compare button
  compareButton.addEventListener('click', compare);

  // Show opacity control when compare button is clicked
  compareButton.addEventListener('click', async () => {
    const opacityControl = document.querySelector('.opacity-control');
    opacityControl.style.display = 'block';

    // show position control
    const positionControl = document.querySelector('.position-control');
    positionControl.style.display = 'block';

    // Get the current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Send initial opacity value with error handling
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'updateOpacity',
        opacity: 70
      });
    } catch (error) {
      console.log('Initial opacity message failed, content script not ready yet');
    }
  });

  // Handle opacity slider changes
  const opacitySlider = document.querySelector('.opacity-slider');
  const opacityValue = document.querySelector('.opacity-value');

  opacitySlider.addEventListener('input', async (e) => {
    const value = e.target.value;
    opacityValue.textContent = `${value}%`;

    // Get the current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Send opacity update to content script with error handling
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'updateOpacity',
        opacity: parseInt(value)
      });
    } catch (error) {
      console.log('Opacity update failed, content script not ready');
    }
  });

  // Handle position input changes
  const xPositionInput = document.querySelector('[name="x-position"]');
  const yPositionInput = document.querySelector('[name="y-position"]');

  let currentX = 0;
  let currentY = 0;

  // Utility to handle Shift + Arrow key stepping
  function setupShiftArrowStep(inputElement) {
    inputElement.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();

        const step = e.shiftKey ? 10 : 1;
        let currentValue = parseInt(inputElement.value) || 0;

        if (e.key === 'ArrowUp') {
          currentValue += step;
        } else {
          currentValue -= step;
        }

        inputElement.value = currentValue;
        inputElement.dispatchEvent(new Event('input')); // trigger your existing handler
      }
    });
  }

  // Attach shift key handling to both inputs
  setupShiftArrowStep(xPositionInput);
  setupShiftArrowStep(yPositionInput);

  xPositionInput.addEventListener('input', async (e) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const value = e.target.value;
    currentX = parseInt(value);
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'updatePosition',
        x: currentX,
        y: currentY
      });
    } catch (error) {
      console.log('Position update failed, content script not ready');
    }
  });

  yPositionInput.addEventListener('input', async (e) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentY = parseInt(e.target.value);
    console.log('Current X:', currentX);
    console.log('Current Y:', currentY);
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'updatePosition',
        x: currentX,
        y: currentY
      });
    } catch (error) {
      console.log('Position update failed, content script not ready');
    }
  });



}); 
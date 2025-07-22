// Set up the side panel
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// Optional: You can also handle the click event manually if needed
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id }).catch((error) => {
    console.error('Failed to open side panel:', error);
  });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'takeScreenshot') {
    takeScreenshot()
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ error: error.message }));
    return true; // Keep the message channel open for async response
  }
});

// Function to take and save screenshot
async function takeScreenshot() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    
    // Get current date and time for filename
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const filename = `screenshot-${timestamp}.png`;

    // Save the screenshot to downloads
    await chrome.downloads.download({
      url: screenshot,
      filename: filename,
      saveAs: false
    });

    console.log('Screenshot saved:', filename);
  } catch (error) {
    console.error('Error in takeScreenshot:', error);
    throw error;
  }
} 
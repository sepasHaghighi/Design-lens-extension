// Function to fetch and parse Figma data
async function fetchFigmaData(fileKey) {
  const token = (await chrome.storage.local.get('figmaToken')).figmaToken;
  const response = await fetch(`https://api.figma.com/v1/files/${fileKey}`, {
    headers: {
      'X-Figma-Token': token
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch Figma data');
  }

  const data = await response.json();
  
  // Log the JSON response to the console
  console.log('Figma API Response:', JSON.stringify(data, null, 2));

  return data;
}

// Export the function for use in other files
export { fetchFigmaData }; 
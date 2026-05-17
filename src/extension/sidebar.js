async function currentDomain() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tabs[0]?.url;
  if (!url) {
    return "Open a page to inspect the current domain.";
  }
  try {
    return new URL(url).hostname;
  } catch {
    return "Unable to resolve current domain.";
  }
}

currentDomain()
  .then((domain) => {
    document.getElementById("sidebar-domain").textContent = domain;
  })
  .catch((error) => {
    document.getElementById("sidebar-domain").textContent = String(error);
  });

function restoreOptions() {
  const dateTypeInput = document.querySelector('#date-type');
  const showColorsInput = document.querySelector('#show-colors');

  chrome.storage.sync.get({
    dateType: 'date',
    showColors: true
  }, ({ dateType, showColors }) => {
    console.log(showColors)
    dateTypeInput.value = dateType;
    showColorsInput.checked = showColors;
  });
  
}

function saveOptions() {
  const dateType = document.querySelector('#date-type').value;
  const showColors = document.querySelector('#show-colors').checked;

  chrome.storage.sync.set({ dateType, showColors }, () => {
    chrome.runtime.sendMessage({ dateType, showColors, type: 'options-changed' }, () => {
      window.close();
    });
  });
};

document.addEventListener('DOMContentLoaded', restoreOptions);
document.querySelector('#save').addEventListener('click', saveOptions);
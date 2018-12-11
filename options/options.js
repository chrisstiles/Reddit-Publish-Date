function restoreOptions() {
  const dateTypeInput = document.querySelector('#date-type');
  const showColorsInput = document.querySelector('#show-colors');
  const displayTypeInput = document.querySelector('#display-type');

  chrome.storage.sync.get({
    dateType: 'relative',
    showColors: true,
    displayType: 'text'
  }, ({ dateType, showColors, displayType }) => {
    dateTypeInput.value = dateType;
    showColorsInput.checked = showColors;
    displayTypeInput.value = displayType;
  });
  
}

function saveOptions() {
  const dateType = document.querySelector('#date-type').value;
  const showColors = document.querySelector('#show-colors').checked;
  const displayType = document.querySelector('#display-type').value;

  chrome.storage.sync.set({ dateType, showColors, displayType }, () => {
    chrome.runtime.sendMessage({ dateType, showColors, displayType, type: 'options-changed' }, () => {
      window.close();
    });
  });
};

document.addEventListener('DOMContentLoaded', restoreOptions);
document.querySelector('#save').addEventListener('click', saveOptions);
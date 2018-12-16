function restoreOptions() {
  const dateTypeInput = document.querySelector('#date-type');
  const displayTypeInput = document.querySelector('#display-type');
  const showColorsInput = document.querySelector('#show-colors');
  const boldTextInput = document.querySelector('#bold-text');

  chrome.storage.sync.get({
    dateType: 'relative',
    displayType: 'text',
    showColors: true,
    boldText: true
  }, ({ dateType, showColors, displayType, boldText }) => {
    dateTypeInput.value = dateType;
    displayTypeInput.value = displayType;
    showColorsInput.checked = showColors;
    boldTextInput.checked = boldText;
  });
  
}

function saveOptions() {
  const dateType = document.querySelector('#date-type').value;
  const displayType = document.querySelector('#display-type').value;
  const showColors = document.querySelector('#show-colors').checked;
  const boldText = document.querySelector('#bold-text').checked;

  chrome.storage.sync.set({ dateType, showColors, displayType, boldText }, () => {
    chrome.runtime.sendMessage({ dateType, showColors, displayType, boldText, type: 'options-changed' }, () => {
      window.close();
    });
  });
};

document.addEventListener('DOMContentLoaded', restoreOptions);
document.querySelector('#save').addEventListener('click', saveOptions);
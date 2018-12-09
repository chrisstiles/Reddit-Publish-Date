function restoreOptions() {
  const dateTypeInput = document.querySelector('#date-type');

  chrome.storage.sync.get({
    dateType: 'date'
  }, ({ dateType }) => {
    dateTypeInput.value = dateType;
  });
  
}

function saveOptions() {
  const dateType = document.querySelector('#date-type').value;

  chrome.storage.sync.set({ dateType }, () => {
    chrome.runtime.sendMessage({ dateType, type: 'options-changed' }, () => {
      window.close();
    });
  });
};

document.addEventListener('DOMContentLoaded', restoreOptions);
document.querySelector('#save').addEventListener('click', saveOptions);
let options = {};
let date = moment().subtract(2, 'd');

function restoreOptions() {
  setExampleDates();

  chrome.storage.sync.get({
    dateType: 'relative',
    displayType: 'text',
    showColors: true,
    boldText: true,
    dateFormat: 'M/D/YY'
  }, savedOptions => {
    options = savedOptions;

    const { dateType, displayType, showColors, boldText, dateFormat } = options;

    setButtonGroup('dateType', dateType);
    setButtonGroup('displayType', displayType);
    toggleDateFormatWrapper();
    setDateFormatInput(dateFormat);

    const showColorsInput = document.querySelector('#show-colors');
    showColorsInput.checked = showColors;

    const boldTextInput = document.querySelector('#bold-text');
    boldTextInput.checked = boldText;

    updatePreview();
  });
}

function setExampleDates() {
  setDateFormatExamples();

  const dateWrapper = document.querySelector('#date-type .date-text');
  dateWrapper.innerText = date.format('M/D/YY');

  const relativeWrapper = document.querySelector('#date-type .relative-text');
  relativeWrapper.innerText = date.fromNow();
}

function setButtonGroup(name, value) {
  const group = document.querySelector(`.button-group[data-name="${name}"]`);
  if (!group) return;

  const buttons = group.querySelectorAll('.button-option');

  for (let button of buttons) {
    if (button.getAttribute('data-value') === value) {
      button.classList.add('active');
    } else {
      button.classList.remove('active');
    }
  }

  toggleDateFormatWrapper();
}

const validOptions = {
  dateType: ['date', 'relative'],
  displayType: ['text', 'bubble']
};

const buttonGroups = document.querySelectorAll('.button-group');
for (let group of buttonGroups) {
  const buttons = group.querySelectorAll('.button-option');
  for (let button of buttons) {
    button.addEventListener('click', () => {
      if (!button.classList.contains('active')) {
        const name = group.getAttribute('data-name');
        const value = button.getAttribute('data-value');

        if (validOptions[name].includes(value)) {
          options[name] = value;
          setButtonGroup(name, value);
          updatePreview();
        }
      }
    });
  }
}

function setDateFormatInput(format) {
  const dateFormatInput = document.querySelector('#date-format');
  dateFormatInput.value = format;
}

document.querySelector('#reset-format').addEventListener('click', () => {
  setDateFormatInput('M/D/YY');
});

document.querySelector('#date-format').addEventListener('input', e => {
  options.dateFormat = e.target.value;
  updatePreview();
});

const checkboxes = document.querySelectorAll('.checkbox input');
for (let checkbox of checkboxes) {
  checkbox.addEventListener('change', () => {
    const name = checkbox.getAttribute('data-name');
    options[name] = checkbox.checked;
    updatePreview();
  });
}

function toggleDateFormatWrapper() {
  const wrapper = document.querySelector('#date-format-wrapper');

  if (options.dateType === 'date') {
    wrapper.classList.remove('disabled');
  } else {
    wrapper.classList.add('disabled');
  }
}

function setDateFormatExamples() {
  const items = document.querySelectorAll('.format-options .item');

  for (let item of items) {
    const token = item.querySelector('.token').innerText;
    const example = item.querySelector('.example .highlight');
    example.innerText = date.format(token);
  }
}

const preview = document.querySelector('#preview');
const previewDate = document.querySelector('#preview-date');

function updatePreview() {
  const { dateType, dateFormat, displayType, showColors, boldText } = options;
  if (dateType === 'relative') {
    previewDate.innerText = date.fromNow();
  } else {
    previewDate.innerText = date.format(dateFormat);
  }

  if (displayType === 'bubble') {
    preview.classList.add('bubble');
    preview.classList.remove('text');
  } else {
    preview.classList.remove('bubble');
    preview.classList.add('text');
  }

  if (showColors) {
    preview.classList.add('color');
    preview.classList.remove('no-color');
  } else {
    preview.classList.remove('color');
    preview.classList.add('no-color');
  }

  if (boldText) {
    preview.classList.add('bold');
  } else {
    preview.classList.remove('bold');
  }
}

function saveOptions() {
  options.type = 'options-changed';

  chrome.storage.sync.set(options, () => {
    chrome.runtime.sendMessage(options, () => {
      window.close();
    });
  });
};

document.addEventListener('DOMContentLoaded', restoreOptions);
document.querySelector('#save').addEventListener('click', saveOptions);
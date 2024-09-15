import './options.scss';
import moment from 'moment';
import { DEFAULT_OPTIONS } from '@constants';
import { isPlainObject } from 'lodash';

(() => {
  let options = {};
  let date = moment().subtract(2, 'd');
  let hasChangedDateFormat = false;
  let shouldDeleteSavedDateFormat = false;

  async function refreshPage(newOptions) {
    setExampleDates();

    if (isPlainObject(newOptions)) {
      options = Object.assign({}, DEFAULT_OPTIONS, options, newOptions);
    } else {
      options = await chrome.storage.sync.get(DEFAULT_OPTIONS);
    }

    setButtonGroup('dateType', options.dateType);
    setButtonGroup('displayType', options.displayType);
    toggleDateFormatWrapper();
    setDateFormatInput(options.dateFormat);

    const showColorsInput = document.querySelector('#show-colors');
    showColorsInput.checked = options.showColors;

    const boldTextInput = document.querySelector('#bold-text');
    boldTextInput.checked = options.boldText;

    updatePreview();
  }

  function setExampleDates() {
    setDateFormatExamples();

    const dateWrapper = document.querySelector('#date-type .date-text');
    dateWrapper.innerText = date.format(DEFAULT_OPTIONS.dateFormat);

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
    hasChangedDateFormat = false;
    shouldDeleteSavedDateFormat = true;

    const defaultFormat = DEFAULT_OPTIONS.dateFormat;
    options.dateFormat = defaultFormat;
    setDateFormatInput(defaultFormat);
    updatePreview();
  });

  document.querySelector('#date-format').addEventListener('input', e => {
    hasChangedDateFormat = true;
    shouldDeleteSavedDateFormat = false;

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

  function updatePreview(opts = {}) {
    options = Object.assign({}, options, opts);

    if (options.dateType === 'relative') {
      previewDate.innerText = date.fromNow();
    } else {
      previewDate.innerText = date.format(options.dateFormat);
    }

    if (options.displayType === 'bubble') {
      preview.classList.add('bubble');
      preview.classList.remove('text');
    } else {
      preview.classList.remove('bubble');
      preview.classList.add('text');
    }

    if (options.showColors) {
      preview.classList.add('color');
      preview.classList.remove('no-color');
    } else {
      preview.classList.remove('color');
      preview.classList.add('no-color');
    }

    if (options.boldText) {
      preview.classList.add('bold');
    } else {
      preview.classList.remove('bold');
    }
  }

  async function saveOptions() {
    const newOptions = { ...options, shouldDeleteSavedDateFormat };

    if (newOptions.dateType === 'relative' || !hasChangedDateFormat) {
      delete newOptions.dateFormat;
    }

    if (shouldDeleteSavedDateFormat) {
      await chrome.storage.sync.remove('dateFormat');
    }

    await chrome.storage.sync.set(newOptions);
    await chrome.runtime.sendMessage(
      Object.assign({}, newOptions, { type: 'options-changed' })
    );

    setTimeout(() => window.close(), 5);
  }

  chrome.runtime.onMessage.addListener((request = {}) => {
    const { type, ...newOptions } = request;

    if (type === 'options-changed') {
      refreshPage(newOptions);
    }
  });

  document.addEventListener('DOMContentLoaded', refreshPage);
  document.querySelector('#save').addEventListener('click', saveOptions);
})();

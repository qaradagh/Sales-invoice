/* Compact navigation. Invoice values and calculations remain in app.js. */
(function () {
  'use strict';
  var tabs = Array.from(document.querySelectorAll('[data-tab]'));
  function activate(tab, focus) {
    tabs.forEach(function (item) {
      var selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
    });
    if (focus) tab.focus();
  }
  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () { activate(tab); });
    tab.addEventListener('keydown', function (event) {
      var next;
      if (event.key === 'ArrowLeft') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowRight') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); activate(tabs[next], true); }
    });
  });
  document.querySelectorAll('[data-view]').forEach(function (button) {
    if (button.tagName !== 'BUTTON') return;
    button.addEventListener('click', function () {
      document.body.dataset.view = button.dataset.view;
      document.querySelectorAll('button[data-view]').forEach(function (item) {
        item.setAttribute('aria-pressed', String(item === button));
      });
      window.dispatchEvent(new Event('resize'));
    });
  });
  var menus = Array.from(document.querySelectorAll('.action-menu'));
  menus.forEach(function (menu) {
    var trigger = menu.querySelector('summary');
    function actions() { return Array.from(menu.querySelectorAll('button:not(:disabled)')).filter(function (button) { return !button.hidden; }); }
    menu.addEventListener('toggle', function () {
      if (menu.open) menus.forEach(function (other) { if (other !== menu) other.open = false; });
    });
    menu.addEventListener('click', function (event) {
      if (!event.target.closest('button')) return;
      menu.open = false;
      trigger.focus();
    }, true);
    menu.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { event.preventDefault(); menu.open = false; trigger.focus(); return; }
      var buttons = actions();
      if (!buttons.length) return;
      var index = buttons.indexOf(document.activeElement);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].indexOf(event.key) < 0) return;
      event.preventDefault();
      menu.open = true;
      if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = buttons.length - 1;
      else if (event.key === 'ArrowDown') index = (index + 1) % buttons.length;
      else index = index < 0 ? buttons.length - 1 : (index + buttons.length - 1) % buttons.length;
      buttons[index].focus();
    });
  });
  document.addEventListener('click', function (event) {
    menus.forEach(function (menu) { if (!menu.contains(event.target)) menu.open = false; });
  });
  document.addEventListener('focusin', function (event) {
    menus.forEach(function (menu) { if (!menu.contains(event.target)) menu.open = false; });
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Tab') return;
    var modal = document.querySelector('.modal:not([hidden])');
    if (!modal) return;
    var focusable = Array.from(modal.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]')).filter(function (item) {
      return !item.disabled && item.getClientRects().length;
    });
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
})();

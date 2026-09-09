const toolbarTitle = document.getElementById('toolbarTitle');
const confirmBtn = document.getElementById('confirmBtn');
const cancelBtn = document.getElementById('cancelBtn');

window.printApi.onRender(function (data) {
  const dateEl = document.getElementById('printDate');
  const modeEl = document.getElementById('printMode');
  const content = document.getElementById('content');

  dateEl.textContent = data.dateStr || new Date().toLocaleDateString();
  modeEl.textContent = data.mode === 'kd' ? 'Kruti Dev' : 'Mangal (Unicode)';
  content.textContent = data.text || '';
  content.className = data.mode === 'kd' ? 'kd' : 'deva';

  if (data.purpose === 'pdf') {
    toolbarTitle.textContent = 'Export Preview — Output as PDF';
    confirmBtn.textContent = 'Export as PDF...';
  } else {
    toolbarTitle.textContent = 'Print Preview — Output';
    confirmBtn.textContent = 'Print...';
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { window.printApi.ready(); });
  } else {
    window.printApi.ready();
  }
});

confirmBtn.addEventListener('click', function () {
  confirmBtn.disabled = true;
  cancelBtn.disabled = true;
  window.printApi.confirm();
});

cancelBtn.addEventListener('click', function () {
  window.printApi.cancel();
});

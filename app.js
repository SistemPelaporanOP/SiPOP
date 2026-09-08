// ════════════════════════════════════════════════
// SiPOP – Frontend Logic
// Strategi foto:
//   1. Kompres foto di browser
//   2. Upload ke ImgBB (free, dapat URL permanen)
//   3. Kirim URL foto ke Apps Script via GET
//   4. Apps Script tulis =IMAGE(url) ke sheet
// ════════════════════════════════════════════════

var API_URL    = 'https://script.google.com/macros/s/AKfycbz7WItHvgF-67d1Q4BQ24romWGHkLiMzlH8rfbZ8tbteelcOsAwt6fCClccVWyGSqViow/exec';
var IMGBB_KEY  = 'a8abff7a87bb3a7234beb3ca6ce70fce'; // free API key ImgBB

// ════════════════════════════════════════════════
// INISIALISASI
// ════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', function() {
  var now = new Date();
  document.getElementById('tanggal').value = now.toISOString().slice(0, 10);
  document.getElementById('waktu').value   = now.toTimeString().slice(0, 5);

  var dot  = document.getElementById('statusDot');
  var text = document.getElementById('statusText');
  if (dot)  dot.classList.add('on');
  if (text) text.textContent = 'Server Terhubung';
});

// ════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════

var currentStep = 0;
var TOTAL_STEPS = 3;
var fotoList    = [];
var MAX_FOTO    = 5;

// ════════════════════════════════════════════════
// NAVIGASI STEP
// ════════════════════════════════════════════════

function goStep(target) {
  if (target > currentStep && !validateStep(currentStep)) return;

  var prevPage = document.getElementById('page' + currentStep);
  var prevDot  = document.getElementById('si'   + currentStep);
  if (prevPage) prevPage.classList.remove('active');
  if (prevDot)  prevDot.classList.remove('active');
  if (prevDot && target > currentStep) prevDot.classList.add('done');

  currentStep = target;

  var nextPage = document.getElementById('page' + currentStep);
  var nextDot  = document.getElementById('si'   + currentStep);
  if (nextPage) nextPage.classList.add('active');
  if (nextDot)  { nextDot.classList.remove('done'); nextDot.classList.add('active'); }

  updateProgress();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateProgress() {
  var fill = document.getElementById('trackFill');
  if (!fill) return;
  var stepForPct = Math.min(currentStep, TOTAL_STEPS - 1);
  var pct = stepForPct === 0 ? 0 : (stepForPct / (TOTAL_STEPS - 1)) * 100;
  fill.style.width = pct + '%';
}

// ════════════════════════════════════════════════
// VALIDASI
// ════════════════════════════════════════════════

function validateStep(step) {
  if (step === 0) {
    if (!val('jabatan'))     { showToast('Pilih jabatan terlebih dahulu.', 'warn'); return false; }
    if (!val('namaPetugas')) { showToast('Nama petugas wajib diisi.',      'warn'); return false; }
    if (!val('tanggal'))     { showToast('Tanggal wajib diisi.',           'warn'); return false; }
    if (!val('waktu'))       { showToast('Waktu wajib diisi.',             'warn'); return false; }
  }
  if (step === 1) {
    if (!val('namaDI'))      { showToast('Pilih daerah irigasi.',          'warn'); return false; }
    if (!val('namaSaluran')) { showToast('Nama saluran wajib diisi.',      'warn'); return false; }
  }
  if (step === 2) {
    if (getCheckedKegiatan().length === 0) { showToast('Pilih minimal satu kegiatan.', 'warn'); return false; }
  }
  return true;
}

function val(id) {
  var el = document.getElementById(id);
  return el && el.value.trim() !== '';
}

function getVal(id) {
  var el = document.getElementById(id);
  return el ? el.value : '';
}

// ════════════════════════════════════════════════
// CHECKBOX
// ════════════════════════════════════════════════

function toggleCheck(labelEl) {
  if (!labelEl) return;
  var input = labelEl.querySelector('input[type="checkbox"]');
  setTimeout(function() {
    labelEl.classList.toggle('selected', !!(input && input.checked));
  }, 0);
}

function getCheckedKegiatan() {
  var results = [];
  document.querySelectorAll('#kegiatanList input[type="checkbox"]:checked').forEach(function(cb) {
    results.push(cb.value);
  });
  return results;
}

// ════════════════════════════════════════════════
// GPS
// ════════════════════════════════════════════════

function getGPS() {
  if (!navigator.geolocation) { showToast('GPS tidak didukung.', 'error'); return; }
  showToast('Mendeteksi lokasi...', 'info');
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      document.getElementById('koordinat').value =
        pos.coords.latitude.toFixed(6) + ', ' + pos.coords.longitude.toFixed(6);
      showToast('GPS berhasil (±' + Math.round(pos.coords.accuracy) + 'm)', 'success');
    },
    function(err) { showToast('Gagal GPS: ' + err.message, 'error'); },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// ════════════════════════════════════════════════
// UPLOAD FOTO — kompres & preview lokal
// ════════════════════════════════════════════════

function handleFiles(fileListRaw) {
  var files = Array.prototype.slice.call(fileListRaw);
  if (fotoList.length >= MAX_FOTO) {
    showToast('Maksimal ' + MAX_FOTO + ' foto.', 'warn');
    return;
  }
  files = files.slice(0, MAX_FOTO - fotoList.length);
  files.forEach(function(file) {
    if (!file.type.startsWith('image/')) return;
    kompresGambar(file, function(base64) {
      fotoList.push({ base64: base64, filename: file.name });
      renderPhotoGrid();
    });
  });
  document.getElementById('fotoInput').value = '';
}

function kompresGambar(file, callback) {
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var maxDim = 1000;
      var w = img.width, h = img.height;
      if (w > h && w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; }
      else if (h > maxDim)     { w = Math.round(w * maxDim / h); h = maxDim; }
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      callback(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function renderPhotoGrid() {
  var grid   = document.getElementById('photoGrid');
  var status = document.getElementById('uploadStatus');
  if (!grid) return;
  grid.innerHTML = '';
  fotoList.forEach(function(item, idx) {
    var thumb = document.createElement('div');
    thumb.className = 'photo-thumb';
    thumb.innerHTML =
      '<img src="' + item.base64 + '" alt="foto ' + (idx+1) + '">' +
      '<button class="remove-btn" onclick="hapusFoto(' + idx + ')">✕</button>';
    grid.appendChild(thumb);
  });
  if (status) status.textContent = fotoList.length > 0 ? fotoList.length + ' foto siap dikirim (maks ' + MAX_FOTO + ').' : '';
}

function hapusFoto(idx) { fotoList.splice(idx, 1); renderPhotoGrid(); }

document.addEventListener('DOMContentLoaded', function() {
  var zone = document.getElementById('uploadZone');
  if (!zone) return;
  zone.addEventListener('dragover',  function(e) { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', function()  { zone.classList.remove('dragover'); });
  zone.addEventListener('drop',      function(e) { e.preventDefault(); zone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
});

// ════════════════════════════════════════════════
// SUBMIT
// ════════════════════════════════════════════════

function submitForm() {
  if (!validateStep(2)) return;

  var btnSubmit  = document.getElementById('btnSubmit');
  var spinner    = document.getElementById('submitSpinner');
  var submitText = document.getElementById('submitText');
  if (btnSubmit)  btnSubmit.disabled     = true;
  if (spinner)    spinner.style.display  = 'inline-block';
  if (submitText) submitText.textContent = 'Mengirim...';

  var payload = {
    tanggal:         getVal('tanggal'),
    waktu:           getVal('waktu'),
    jabatan:         getVal('jabatan'),
    namaPetugas:     getVal('namaPetugas'),
    namaDI:          getVal('namaDI'),
    namaSaluran:     getVal('namaSaluran'),
    namaDesa:        getVal('namaDesa'),
    kecamatan:       getVal('kecamatan'),
    kabupaten:       getVal('namaKab'),
    koordinat:       getVal('koordinat'),
    kegiatan:        getCheckedKegiatan().join(', '),
    catatanTambahan: getVal('catatanTambahan'),
    jumlahFoto:      fotoList.length
  };

  // TAHAP 1: kirim data teks dulu — langsung tampil sukses
  var probe = new Image();
  probe.onload = probe.onerror = function() {
    tampilkanSukses(payload);
    // TAHAP 2: upload foto ke ImgBB lalu kirim URL ke Apps Script
    if (fotoList.length > 0) {
      uploadFotoImgBB(payload.namaPetugas, payload.tanggal, fotoList.slice());
    }
    if (btnSubmit)  btnSubmit.disabled     = false;
    if (spinner)    spinner.style.display  = 'none';
    if (submitText) submitText.textContent = '📤 Kirim Laporan';
  };
  probe.src = API_URL + '?action=data&payload=' + encodeURIComponent(JSON.stringify(payload));
}

// ════════════════════════════════════════════════
// UPLOAD FOTO ke ImgBB → dapat URL → kirim ke Sheet
// ════════════════════════════════════════════════

function uploadFotoImgBB(namaPetugas, tanggal, fotoArr) {
  var statusEl = document.getElementById('bgUploadStatus');

  function uploadSatu(idx) {
    if (idx >= fotoArr.length) {
      if (statusEl) {
        statusEl.textContent = '✅ Semua foto berhasil diunggah.';
        statusEl.style.color = '#16a34a';
      }
      return;
    }

    if (statusEl) {
      statusEl.textContent = '📤 Mengunggah foto ' + (idx+1) + ' dari ' + fotoArr.length + '...';
      statusEl.style.color = '#0369a1';
    }

    // Ambil base64 murni (tanpa prefix data:image/...)
    var base64 = fotoArr[idx].base64;
    if (base64.indexOf('base64,') > -1) base64 = base64.split('base64,')[1];

    var formData = new FormData();
    formData.append('key',    IMGBB_KEY);
    formData.append('image',  base64);
    formData.append('name',   'sipop_' + namaPetugas + '_' + tanggal + '_foto' + (idx+1));

    fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body:   formData
    })
    .then(function(res) { return res.json(); })
    .then(function(json) {
      if (json.success) {
        var imageUrl = json.data.url;
        // Kirim URL foto ke Apps Script agar ditulis ke sheet
        var fotoData = {
          namaPetugas: namaPetugas,
          tanggal:     tanggal,
          index:       idx + 1,
          imageUrl:    imageUrl
        };
        var p2 = new Image();
        p2.onload = p2.onerror = function() {
          setTimeout(function() { uploadSatu(idx + 1); }, 500);
        };
        p2.src = API_URL + '?action=foto&payload=' + encodeURIComponent(JSON.stringify(fotoData));
      } else {
        // Kalau ImgBB gagal, lanjut foto berikutnya
        setTimeout(function() { uploadSatu(idx + 1); }, 500);
      }
    })
    .catch(function() {
      setTimeout(function() { uploadSatu(idx + 1); }, 1000);
    });
  }

  uploadSatu(0);
}

// ════════════════════════════════════════════════
// TAMPIL SUKSES
// ════════════════════════════════════════════════

function tampilkanSukses(payload) {
  var prevPage = document.getElementById('page' + currentStep);
  var prevDot  = document.getElementById('si'   + currentStep);
  if (prevPage) prevPage.classList.remove('active');
  if (prevDot)  { prevDot.classList.remove('active'); prevDot.classList.add('done'); }

  currentStep = 3;
  var successPage = document.getElementById('page3');
  if (successPage) successPage.classList.add('active');

  var fill = document.getElementById('trackFill');
  if (fill) fill.style.width = '100%';

  showSummary(payload);
  showToast('Laporan berhasil dikirim!', 'success');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showSummary(data) {
  var box = document.getElementById('summaryBox');
  if (!box) return;
  box.innerHTML =
    '<table>' +
    sumRow('Tanggal',  data.tanggal + ' ' + data.waktu) +
    sumRow('Petugas',  data.namaPetugas + ' (' + data.jabatan + ')') +
    sumRow('Lokasi',   data.namaDI + ' \u2013 ' + data.namaSaluran) +
    sumRow('Wilayah',  [data.namaDesa, data.kecamatan, data.kabupaten].filter(Boolean).join(', ') || '-') +
    sumRow('Kegiatan', data.kegiatan || '-') +
    sumRow('Foto',     data.jumlahFoto + ' foto') +
    '</table>' +
    (data.jumlahFoto > 0
      ? '<p id="bgUploadStatus" style="margin-top:10px;font-size:12px;color:#0369a1;text-align:center;font-weight:500;">📤 Mengunggah foto...</p>'
      : '');
}

function sumRow(label, value) {
  return '<tr><td>' + label + '</td><td>' + (value || '-') + '</td></tr>';
}

// ════════════════════════════════════════════════
// RESET
// ════════════════════════════════════════════════

function resetForm() {
  document.querySelectorAll('input, textarea, select').forEach(function(el) {
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
    else if (el.type !== 'file') el.value = '';
  });
  document.querySelectorAll('.check-item').forEach(function(el) { el.classList.remove('selected'); });
  fotoList = [];
  renderPhotoGrid();
  var now = new Date();
  document.getElementById('tanggal').value = now.toISOString().slice(0, 10);
  document.getElementById('waktu').value   = now.toTimeString().slice(0, 5);
  var activePage = document.getElementById('page' + currentStep);
  if (activePage) activePage.classList.remove('active');
  currentStep = 0;
  var page0 = document.getElementById('page0');
  if (page0) page0.classList.add('active');
  document.querySelectorAll('.step-item').forEach(function(s) { s.classList.remove('active', 'done'); });
  var si0 = document.getElementById('si0');
  if (si0) si0.classList.add('active');
  updateProgress();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ════════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════════

var toastTimer = null;
function showToast(msg, type) {
  type = type || 'info';
  var toast     = document.getElementById('toast');
  var toastMsg  = document.getElementById('toastMsg');
  var toastIcon = document.getElementById('toastIcon');
  if (!toast) return;
  var icons = { info: 'ℹ️', success: '✅', warn: '⚠️', error: '❌' };
  if (toastIcon) toastIcon.textContent = icons[type] || 'ℹ️';
  if (toastMsg)  toastMsg.textContent  = msg;
  toast.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { toast.className = 'toast'; }, 3500);
}

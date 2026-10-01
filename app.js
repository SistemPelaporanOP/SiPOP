// ════════════════════════════════════════════════
// SiPOP – Frontend Logic
// Fitur offline: data & foto disimpan ke IndexedDB
// saat tidak ada internet, otomatis terkirim
// begitu internet tersedia kembali
// ════════════════════════════════════════════════

var API_URL   = 'https://script.google.com/macros/s/AKfycbz7WItHvgF-67d1Q4BQ24romWGHkLiMzlH8rfbZ8tbteelcOsAwt6fCClccVWyGSqViow/exec';
var IMGBB_KEY = 'a8abff7a87bb3a7234beb3ca6ce70fce';
var DB_NAME   = 'sipop_offline';
var DB_VER    = 1;
var db        = null;

// ════════════════════════════════════════════════
// SERVICE WORKER — register PWA
// ════════════════════════════════════════════════

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(function() {
    console.log('SW registered');
  });

  // Terima perintah sync dari Service Worker
  navigator.serviceWorker.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'SYNC_NOW') {
      kirimAntrianOffline();
    }
  });
}

// ════════════════════════════════════════════════
// INDEXEDDB — simpan laporan offline
// ════════════════════════════════════════════════

function bukaDB(callback) {
  if (db) { callback(db); return; }
  var req = indexedDB.open(DB_NAME, DB_VER);
  req.onupgradeneeded = function(e) {
    var _db = e.target.result;
    if (!_db.objectStoreNames.contains('antrian')) {
      var store = _db.createObjectStore('antrian', { keyPath: 'id', autoIncrement: true });
      store.createIndex('status', 'status', { unique: false });
    }
  };
  req.onsuccess = function(e) {
    db = e.target.result;
    callback(db);
  };
  req.onerror = function() {
    console.error('IndexedDB gagal dibuka');
  };
}

function simpanKeAntrian(payload, callback) {
  bukaDB(function(_db) {
    var tx    = _db.transaction('antrian', 'readwrite');
    var store = tx.objectStore('antrian');
    var item  = { payload: payload, status: 'pending', waktuSimpan: Date.now() };
    var req   = store.add(item);
    req.onsuccess = function(e) {
      if (callback) callback(e.target.result); // return id
    };
  });
}

function ambilAntrianPending(callback) {
  bukaDB(function(_db) {
    var tx    = _db.transaction('antrian', 'readonly');
    var store = tx.objectStore('antrian');
    var idx   = store.index('status');
    var req   = idx.getAll('pending');
    req.onsuccess = function(e) { callback(e.target.result); };
  });
}

function hapusDariAntrian(id) {
  bukaDB(function(_db) {
    var tx    = _db.transaction('antrian', 'readwrite');
    var store = tx.objectStore('antrian');
    store.delete(id);
  });
}

function updateStatusAntrian(id, status) {
  bukaDB(function(_db) {
    var tx    = _db.transaction('antrian', 'readwrite');
    var store = tx.objectStore('antrian');
    var req   = store.get(id);
    req.onsuccess = function(e) {
      var item = e.target.result;
      if (item) { item.status = status; store.put(item); }
    };
  });
}

// ════════════════════════════════════════════════
// INISIALISASI
// ════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', function() {
  var now = new Date();
  document.getElementById('tanggal').value = now.toISOString().slice(0, 10);
  document.getElementById('waktu').value   = now.toTimeString().slice(0, 5);

  updateStatusBar();
  bukaDB(function() {}); // buka DB lebih awal

  // Pantau status koneksi
  window.addEventListener('online',  function() {
    updateStatusBar();
    showToast('Kembali online — mengirim laporan tersimpan...', 'success');
    setTimeout(kirimAntrianOffline, 1500);
  });
  window.addEventListener('offline', function() {
    updateStatusBar();
    showToast('Tidak ada internet — laporan akan disimpan lokal', 'warn');
  });

  // Cek antrian saat halaman dibuka (mungkin ada yang belum terkirim)
  if (navigator.onLine) {
    setTimeout(kirimAntrianOffline, 3000);
  }
});

function updateStatusBar() {
  var dot  = document.getElementById('statusDot');
  var text = document.getElementById('statusText');
  if (navigator.onLine) {
    if (dot)  { dot.className = 'dot on'; }
    if (text) text.textContent = 'Server Terhubung';
  } else {
    if (dot)  { dot.className = 'dot'; dot.style.background = '#f59e0b'; }
    if (text) text.textContent = 'Mode Offline';
  }
}

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
  var pct = currentStep === 0 ? 0 : (Math.min(currentStep, TOTAL_STEPS - 1) / (TOTAL_STEPS - 1)) * 100;
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
  return el ? el.value.trim() : '';
}

// ════════════════════════════════════════════════
// CHECKBOX & RADIO
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
      var lat = pos.coords.latitude.toFixed(6);
      var lng = pos.coords.longitude.toFixed(6);
      document.getElementById('koordinat').value = lat + ', ' + lng;
      showToast('GPS berhasil (±' + Math.round(pos.coords.accuracy) + 'm)', 'success');
    },
    function(err) { showToast('Gagal GPS: ' + err.message, 'error'); },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// ════════════════════════════════════════════════
// UPLOAD FOTO
// ════════════════════════════════════════════════

function handleFiles(fileListRaw) {
  var files = Array.prototype.slice.call(fileListRaw);
  if (fotoList.length >= MAX_FOTO) { showToast('Maks ' + MAX_FOTO + ' foto.', 'warn'); return; }
  files = files.slice(0, MAX_FOTO - fotoList.length);

  files.forEach(function(file) {
    if (!file.type.startsWith('image/')) { showToast('"' + file.name + '" bukan gambar.', 'warn'); return; }
    kompresGambar(file, function(base64) {
      fotoList.push({ base64: base64, mimeType: 'image/jpeg', filename: file.name.replace(/\.[^/.]+$/, '') + '.jpg', previewUrl: base64 });
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
      var maxDim = 800, w = img.width, h = img.height;
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
  var grid = document.getElementById('photoGrid');
  var status = document.getElementById('uploadStatus');
  if (!grid) return;
  grid.innerHTML = '';
  fotoList.forEach(function(item, idx) {
    var thumb = document.createElement('div');
    thumb.className = 'photo-thumb';
    thumb.innerHTML = '<img src="' + item.previewUrl + '" alt="foto ' + (idx+1) + '"><button class="remove-btn" onclick="hapusFoto(' + idx + ')">✕</button>';
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
// SUBMIT — simpan lokal jika offline, kirim jika online
// ════════════════════════════════════════════════

function submitForm() {
  if (!validateStep(2)) return;

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
    jumlahFoto:      fotoList.length,
    foto:            fotoList.map(function(f) {
      return { base64: f.base64, mimeType: f.mimeType, filename: f.filename };
    })
  };

  if (!navigator.onLine) {
    // ── OFFLINE: simpan ke IndexedDB, tampilkan sukses ──
    simpanKeAntrian(payload, function(id) {
      showToast('Tersimpan lokal — akan terkirim saat online.', 'warn');
      tampilkanSukses(payload, true, id);
    });
    return;
  }

  // ── ONLINE: kirim langsung ──
  var btnSubmit  = document.getElementById('btnSubmit');
  var spinner    = document.getElementById('submitSpinner');
  var submitText = document.getElementById('submitText');
  if (btnSubmit)  btnSubmit.disabled     = true;
  if (spinner)    spinner.style.display  = 'inline-block';
  if (submitText) submitText.textContent = 'Mengirim...';

  kirimPayload(payload, function(berhasil) {
    if (btnSubmit)  btnSubmit.disabled     = false;
    if (spinner)    spinner.style.display  = 'none';
    if (submitText) submitText.textContent = '📤 Kirim Laporan';

    if (berhasil) {
      tampilkanSukses(payload, false, null);
    } else {
      // Gagal kirim online → simpan ke antrian
      simpanKeAntrian(payload, function(id) {
        showToast('Gagal kirim — tersimpan lokal, coba lagi nanti.', 'warn');
        tampilkanSukses(payload, true, id);
      });
    }
  });
}

// ════════════════════════════════════════════════
// KIRIM PAYLOAD (data teks + foto ke ImgBB)
// ════════════════════════════════════════════════

function kirimPayload(payload, callback) {
  // Step 1: kirim data teks ke Apps Script
  var dataTeks = {
    tanggal: payload.tanggal, waktu: payload.waktu,
    jabatan: payload.jabatan, namaPetugas: payload.namaPetugas,
    namaDI: payload.namaDI, namaSaluran: payload.namaSaluran,
    namaDesa: payload.namaDesa, kecamatan: payload.kecamatan,
    kabupaten: payload.kabupaten, koordinat: payload.koordinat,
    kegiatan: payload.kegiatan, catatanTambahan: payload.catatanTambahan,
    jumlahFoto: payload.jumlahFoto
  };

  var probe = new Image();
  probe.onload = probe.onerror = function() {
    // Step 2: upload foto ke ImgBB
    if (payload.foto && payload.foto.length > 0) {
      uploadFotoImgBB(payload.namaPetugas, payload.tanggal, payload.foto.slice(), function(semua) {
        callback(true);
      });
    } else {
      callback(true);
    }
  };

  try {
    probe.src = API_URL + '?action=data&payload=' + encodeURIComponent(JSON.stringify(dataTeks));
  } catch(e) {
    callback(false);
  }
}

// ════════════════════════════════════════════════
// UPLOAD FOTO KE IMGBB — satu per satu
// ════════════════════════════════════════════════

function uploadFotoImgBB(namaPetugas, tanggal, fotoArr, doneCallback) {
  var statusEl = document.getElementById('bgUploadStatus');

  function uploadSatu(idx) {
    if (idx >= fotoArr.length) {
      if (statusEl) { statusEl.textContent = '✅ Semua foto berhasil diunggah.'; statusEl.style.color = '#16a34a'; }
      if (doneCallback) doneCallback(true);
      return;
    }

    if (statusEl) { statusEl.textContent = '📤 Mengunggah foto ' + (idx+1) + ' dari ' + fotoArr.length + '...'; statusEl.style.color = '#0369a1'; }

    var base64 = fotoArr[idx].base64;
    if (base64.indexOf('base64,') > -1) base64 = base64.split('base64,')[1];

    var formData = new FormData();
    formData.append('key',   IMGBB_KEY);
    formData.append('image', base64);
    formData.append('name',  'sipop_' + namaPetugas + '_' + tanggal + '_' + (idx+1));

    fetch('https://api.imgbb.com/1/upload', { method: 'POST', body: formData })
    .then(function(res) { return res.json(); })
    .then(function(json) {
      if (json.success) {
        var imageUrl = json.data.url;
        var fotoData = { namaPetugas: namaPetugas, tanggal: tanggal, index: idx + 1, imageUrl: imageUrl };
        var p2 = new Image();
        p2.onload = p2.onerror = function() { setTimeout(function() { uploadSatu(idx + 1); }, 500); };
        p2.src = API_URL + '?action=foto&payload=' + encodeURIComponent(JSON.stringify(fotoData));
      } else {
        setTimeout(function() { uploadSatu(idx + 1); }, 500);
      }
    })
    .catch(function() { setTimeout(function() { uploadSatu(idx + 1); }, 1000); });
  }

  uploadSatu(0);
}

// ════════════════════════════════════════════════
// KIRIM ANTRIAN OFFLINE (dipanggil saat online)
// ════════════════════════════════════════════════

function kirimAntrianOffline() {
  if (!navigator.onLine) return;

  ambilAntrianPending(function(items) {
    if (!items || items.length === 0) return;

    showToast('Mengirim ' + items.length + ' laporan tersimpan...', 'info');

    function kirimSatu(idx) {
      if (idx >= items.length) {
        showToast('Semua laporan tersimpan berhasil dikirim!', 'success');
        // Update badge antrian
        updateBadgeAntrian();
        return;
      }

      var item = items[idx];
      updateStatusAntrian(item.id, 'sending');

      kirimPayload(item.payload, function(berhasil) {
        if (berhasil) {
          hapusDariAntrian(item.id);
        } else {
          updateStatusAntrian(item.id, 'pending');
        }
        setTimeout(function() { kirimSatu(idx + 1); }, 1000);
      });
    }

    kirimSatu(0);
  });
}

function updateBadgeAntrian() {
  ambilAntrianPending(function(items) {
    var badge = document.getElementById('offlineBadge');
    if (!badge) return;
    var jumlah = items ? items.length : 0;
    badge.textContent = jumlah > 0 ? jumlah + ' laporan menunggu' : '';
    badge.style.display = jumlah > 0 ? 'block' : 'none';
  });
}

// ════════════════════════════════════════════════
// TAMPILKAN SUKSES
// ════════════════════════════════════════════════

function tampilkanSukses(payload, isOffline, antrianId) {
  var prevPage = document.getElementById('page' + currentStep);
  var prevDot  = document.getElementById('si'   + currentStep);
  if (prevPage) prevPage.classList.remove('active');
  if (prevDot)  { prevDot.classList.remove('active'); prevDot.classList.add('done'); }

  currentStep = 3;
  var successPage = document.getElementById('page3');
  if (successPage) successPage.classList.add('active');

  var fill = document.getElementById('trackFill');
  if (fill) fill.style.width = '100%';

  showSummary(payload, isOffline);
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (!isOffline && payload.foto && payload.foto.length > 0) {
    uploadFotoImgBB(payload.namaPetugas, payload.tanggal, payload.foto.slice(), null);
  }
}

function showSummary(data, isOffline) {
  var box = document.getElementById('summaryBox');
  if (!box) return;

  var fotoInfo = data.jumlahFoto > 0
    ? data.jumlahFoto + ' foto' + (isOffline ? ' (akan dikirim saat online)' : ' (sedang diunggah...)')
    : 'Tidak ada foto';

  var offlineNote = isOffline
    ? '<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px;margin-top:12px;font-size:13px;color:#92400e;">' +
      '⚠️ <strong>Mode Offline:</strong> Laporan disimpan di perangkat ini. ' +
      'Akan otomatis dikirim ke spreadsheet begitu internet tersedia.' +
      '</div>'
    : '<p id="bgUploadStatus" style="margin-top:10px;font-size:12px;color:#0369a1;text-align:center;font-weight:500;">' +
      (data.jumlahFoto > 0 ? '📤 Mengunggah foto di background...' : '') +
      '</p>';

  box.innerHTML =
    '<table>' +
    sumRow('Tanggal',  data.tanggal + ' ' + data.waktu) +
    sumRow('Petugas',  data.namaPetugas + ' (' + data.jabatan + ')') +
    sumRow('Lokasi',   data.namaDI + ' – ' + data.namaSaluran) +
    sumRow('Wilayah',  [data.namaDesa, data.kecamatan, data.kabupaten].filter(Boolean).join(', ') || '-') +
    sumRow('Kegiatan', data.kegiatan || '-') +
    sumRow('Foto',     fotoInfo) +
    '</table>' + offlineNote;
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
  updateBadgeAntrian();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ════════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════════

var toastTimer = null;
function showToast(msg, type) {
  type = type || 'info';
  var toast = document.getElementById('toast');
  var toastMsg = document.getElementById('toastMsg');
  var toastIcon = document.getElementById('toastIcon');
  if (!toast) return;
  var icons = { info:'ℹ️', success:'✅', warn:'⚠️', error:'❌' };
  if (toastIcon) toastIcon.textContent = icons[type] || 'ℹ️';
  if (toastMsg)  toastMsg.textContent  = msg;
  toast.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { toast.className = 'toast'; }, 4000);
}

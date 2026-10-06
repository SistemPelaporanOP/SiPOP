// ════════════════════════════════════════════════
// SiPOP – Frontend Logic
// ════════════════════════════════════════════════

// GANTI dengan URL hasil Deploy Apps Script Anda
var API_URL = 'https://script.google.com/macros/s/AKfycbz7WItHvgF-67d1Q4BQ24romWGHkLiMzlH8rfbZ8tbteelcOsAwt6fCClccVWyGSqViow/exec';

// ════════════════════════════════════════════════
// INISIALISASI
// ════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', function() {
  var now = new Date();
  document.getElementById('tanggal').value = now.toISOString().slice(0, 10);
  document.getElementById('waktu').value   = now.toTimeString().slice(0, 5);

  updateStatus();          // lencana Server Terhubung / Offline
  updatePendingBanner();   // banner "X laporan tersimpan di perangkat"

  // Minta browser agar penyimpanan tidak dihapus otomatis saat memori HP penuh
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(function() {});
  }

  // Kirim otomatis antrean yang tertinggal saat aplikasi dibuka
  if (navigator.onLine) syncPendingReports();
});

// ════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════

var currentStep = 0;
var TOTAL_STEPS = 3; // step 0,1,2 = form aktif; step 3 = sukses
var fotoList = [];   // { base64, mimeType, filename, previewUrl }
var MAX_FOTO = 5;

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
// VALIDASI PER STEP
// ════════════════════════════════════════════════

function validateStep(step) {
  if (step === 0) {
    if (!val('jabatan'))     { showToast('Pilih jabatan terlebih dahulu.', 'warn'); return false; }
    if (!val('namaPetugas')) { showToast('Nama petugas wajib diisi.',      'warn'); return false; }
    if (!val('tanggal'))     { showToast('Tanggal wajib diisi.',           'warn'); return false; }
    if (!val('waktu'))       { showToast('Waktu wajib diisi.',             'warn'); return false; }
  }
  if (step === 1) {
    if (!val('namaDI'))      { showToast('Pilih daerah irigasi terlebih dahulu.',        'warn'); return false; }
    if (!val('namaSaluran')) { showToast('Nama saluran / bangunan wajib diisi.',         'warn'); return false; }
    if (!val('namaDesa'))    { showToast('Nama desa wajib diisi.',                       'warn'); return false; }
    if (!val('kecamatan'))   { showToast('Kecamatan wajib diisi.',                       'warn'); return false; }
    if (!val('namaKab'))     { showToast('Pilih kabupaten terlebih dahulu.',             'warn'); return false; }
    if (!val('koordinat'))   { showToast('Koordinat GPS wajib dideteksi — tekan tombol 📡 Deteksi GPS.', 'warn'); return false; }
  }
  if (step === 2) {
    var kegiatan = getCheckedKegiatan();
    if (kegiatan.length === 0) { showToast('Pilih minimal satu kegiatan.',              'warn'); return false; }
    if (fotoList.length === 0) { showToast('Minimal 1 foto dokumentasi wajib diunggah.','warn'); return false; }
  }
  return true;
}

function val(id) {
  var el = document.getElementById(id);
  return el && el.value.trim() !== '';
}

// ════════════════════════════════════════════════
// CHECKBOX KEGIATAN
// ════════════════════════════════════════════════

function toggleCheck(labelEl) {
  if (!labelEl) return;
  var input = labelEl.querySelector('input[type="checkbox"]');
  setTimeout(function() {
    if (input && input.checked) {
      labelEl.classList.add('selected');
    } else {
      labelEl.classList.remove('selected');
    }
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
  if (!navigator.geolocation) {
    showToast('Perangkat tidak mendukung GPS.', 'error');
    return;
  }
  showToast('Mendeteksi lokasi...', 'info');
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      var lat = pos.coords.latitude.toFixed(6);
      var lng = pos.coords.longitude.toFixed(6);
      var acc = Math.round(pos.coords.accuracy);
      document.getElementById('koordinat').value = lat + ', ' + lng;
      showToast('GPS berhasil (akurasi +/-' + acc + 'm)', 'success');
    },
    function(err) {
      var pesan = 'Gagal mendapatkan GPS: ' + err.message;
      if (err.code === 1) pesan = 'Izin lokasi ditolak. Aktifkan izin Lokasi untuk aplikasi ini.';
      if (err.code === 3) pesan = 'GPS belum terkunci. Pindah ke area terbuka, tunggu sebentar, lalu coba lagi (atau isi koordinat manual).';
      showToast(pesan, 'error');
    },
    {
      enableHighAccuracy: true,  // pakai chip GPS (bisa offline di HP)
      timeout: 60000,            // beri waktu 60 detik
      maximumAge: 300000         // boleh pakai posisi terakhir (< 5 menit)
    }
  );
}

// ════════════════════════════════════════════════
// UPLOAD FOTO — konversi ke base64, preview lokal
// ════════════════════════════════════════════════

function handleFiles(fileListRaw) {
  var files = Array.prototype.slice.call(fileListRaw);

  if (fotoList.length + files.length > MAX_FOTO) {
    showToast('Maksimal ' + MAX_FOTO + ' foto per laporan.', 'warn');
    files = files.slice(0, MAX_FOTO - fotoList.length);
  }

  files.forEach(function(file) {
    if (!file.type.startsWith('image/')) {
      showToast('File "' + file.name + '" bukan gambar, dilewati.', 'warn');
      return;
    }

    // Kompres dulu sebelum jadi base64 agar payload tidak terlalu besar
    kompresGambar(file, function(base64Compressed) {
      var item = {
        base64: base64Compressed,
        mimeType: 'image/jpeg',
        filename: file.name.replace(/\.[^/.]+$/, '') + '.jpg',
        previewUrl: base64Compressed
      };
      fotoList.push(item);
      renderPhotoGrid();
    });
  });

  // Reset input supaya bisa pilih file sama lagi jika perlu
  document.getElementById('fotoInput').value = '';
}

// Kompres gambar via canvas agar ukuran base64 wajar (max ~1200px, quality 0.7)
function kompresGambar(file, callback) {
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var maxDim = 1200;
      var w = img.width, h = img.height;
      if (w > h && w > maxDim) { h = h * (maxDim / w); w = maxDim; }
      else if (h > maxDim) { w = w * (maxDim / h); h = maxDim; }

      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      var dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      callback(dataUrl);
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
    thumb.innerHTML =
      '<img src="' + item.previewUrl + '" alt="foto ' + (idx + 1) + '">' +
      '<button class="remove-btn" onclick="hapusFoto(' + idx + ')">✕</button>';
    grid.appendChild(thumb);
  });

  if (status) {
    status.textContent = fotoList.length > 0
      ? fotoList.length + ' foto siap dikirim (maks ' + MAX_FOTO + ').'
      : '';
  }
}

function hapusFoto(idx) {
  fotoList.splice(idx, 1);
  renderPhotoGrid();
}

// Drag & drop support
document.addEventListener('DOMContentLoaded', function() {
  var zone = document.getElementById('uploadZone');
  if (!zone) return;

  zone.addEventListener('dragover', function(e) {
    e.preventDefault();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', function() {
    zone.classList.remove('dragover');
  });
  zone.addEventListener('drop', function(e) {
    e.preventDefault();
    zone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });
});

// ════════════════════════════════════════════════
// SUBMIT — kirim ke Apps Script; jika gagal/offline → antrean
// ════════════════════════════════════════════════

// Kirim satu payload ke server. Resolve jika request terkirim,
// reject jika gagal (offline, timeout 60 detik, dsb).
function kirimKeServer(payload) {
  var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  var timeoutId = controller ? setTimeout(function() {
    controller.abort();
  }, 60000) : null;

  return fetch(API_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload),
    signal: controller ? controller.signal : undefined
  }).then(function(res) {
    if (timeoutId) clearTimeout(timeoutId);
    return res;
  }, function(err) {
    if (timeoutId) clearTimeout(timeoutId);
    throw err;
  });
}

function submitForm() {
  if (!validateStep(2)) return;

  var btnSubmit  = document.getElementById('btnSubmit');
  var spinner    = document.getElementById('submitSpinner');
  var submitText = document.getElementById('submitText');
  var uploadProgress = document.getElementById('uploadProgress');
  var progressFill   = document.getElementById('progressFill');
  var uploadPct      = document.getElementById('uploadPct');

  function resetTombol() {
    if (btnSubmit)  btnSubmit.disabled     = false;
    if (spinner)    spinner.style.display  = 'none';
    if (submitText) submitText.textContent = '📤 Kirim Laporan';
    if (uploadProgress) uploadProgress.style.display = 'none';
  }

  if (btnSubmit)  btnSubmit.disabled     = true;
  if (spinner)    spinner.style.display  = 'inline-block';
  if (submitText) submitText.textContent = navigator.onLine ? 'Mengirim...' : 'Menyimpan...';

  // ── Bangun payload (idLaporan dipakai untuk mencegah laporan ganda)
  var payload;
  try {
    payload = {
      idLaporan:        'LP-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      tanggal:          valOf('tanggal'),
      waktu:            valOf('waktu'),
      jabatan:          valOf('jabatan'),
      namaPetugas:      valOf('namaPetugas'),
      namaDI:           valOf('namaDI'),
      namaSaluran:      valOf('namaSaluran'),
      namaDesa:         valOf('namaDesa'),
      kecamatan:        valOf('kecamatan'),
      namaKab:          valOf('namaKab'),
      koordinat:        valOf('koordinat'),
      kegiatan:         getCheckedKegiatan().join(', '),
      catatanTambahan:  valOf('catatanTambahan'),
      foto: fotoList.map(function(f) {
        return { base64: f.base64, mimeType: f.mimeType, filename: f.filename };
      })
    };
  } catch (errBuild) {
    console.error('Gagal menyusun data laporan:', errBuild);
    showToast('Gagal menyusun data laporan (cek console untuk detail).', 'error');
    resetTombol();
    return;
  }

  // Simpan ke antrean perangkat (IndexedDB), lalu tampilkan layar sukses
  function simpanOffline() {
    idbAdd({ data: payload, savedAt: Date.now() })
      .then(function() {
        resetTombol();
        updatePendingBanner();
        tampilkanSukses(payload, true);
      })
      .catch(function(err) {
        console.error('Gagal menyimpan ke antrean:', err);
        showToast('Gagal menyimpan laporan di perangkat (penyimpanan penuh?). Kosongkan ruang lalu coba lagi.', 'error');
        resetTombol();
      });
  }

  // Sedang offline → langsung simpan, tidak perlu mencoba fetch
  if (!navigator.onLine) {
    simpanOffline();
    return;
  }

  // Online → coba kirim. Jika GAGAL APA PUN → masuk antrean.
  if (uploadProgress && fotoList.length > 0) uploadProgress.style.display = 'block';
  var simPct = 0;
  var simInterval = null;
  if (fotoList.length > 0) {
    simInterval = setInterval(function() {
      simPct = Math.min(simPct + 8, 92);
      if (progressFill) progressFill.style.width = simPct + '%';
      if (uploadPct) uploadPct.textContent = simPct + '%';
    }, 200);
  }

  kirimKeServer(payload)
    .then(function() {
      if (simInterval) clearInterval(simInterval);
      if (progressFill) progressFill.style.width = '100%';
      if (uploadPct) uploadPct.textContent = '100%';
      setTimeout(function() { tampilkanSukses(payload, false); }, 300);
    })
    .catch(function(err) {
      if (simInterval) clearInterval(simInterval);
      console.warn('Kirim gagal, laporan dimasukkan ke antrean:', err);
      simpanOffline();
    });
}

// Ambil value elemen dengan aman; kalau elemen tidak ditemukan,
// lempar error yang jelas (bukan "Cannot read properties of null")
// supaya gampang dilacak id mana yang salah/hilang di HTML.
function valOf(id) {
  var el = document.getElementById(id);
  if (!el) {
    throw new Error('Elemen form dengan id="' + id + '" tidak ditemukan di halaman.');
  }
  return el.value;
}

function tampilkanSukses(payload, tersimpanOffline) {
  var btnSubmit  = document.getElementById('btnSubmit');
  var spinner    = document.getElementById('submitSpinner');
  var submitText = document.getElementById('submitText');

  if (btnSubmit)  btnSubmit.disabled     = false;
  if (spinner)    spinner.style.display  = 'none';
  if (submitText) submitText.textContent = '📤 Kirim Laporan';

  var prevPage = document.getElementById('page' + currentStep);
  var prevDot  = document.getElementById('si'   + currentStep);
  if (prevPage) prevPage.classList.remove('active');
  if (prevDot)  { prevDot.classList.remove('active'); prevDot.classList.add('done'); }

  currentStep = 3;
  var successPage = document.getElementById('page3');
  if (successPage) successPage.classList.add('active');

  updateProgress();
  var fill = document.getElementById('trackFill');
  if (fill) fill.style.width = '100%';

  // Teks layar sukses menyesuaikan: terkirim vs. tersimpan di perangkat
  var h2 = document.querySelector('#page3 h2');
  var p  = document.querySelector('#page3 .success-wrap p');
  if (tersimpanOffline) {
    if (h2) h2.textContent = 'Laporan Tersimpan!';
    if (p)  p.innerHTML = 'Laporan disimpan di perangkat dan akan <b>terkirim otomatis</b><br>saat koneksi internet tersedia.';
  } else {
    if (h2) h2.textContent = 'Laporan Terkirim!';
    if (p)  p.innerHTML = 'Data laporan Anda telah berhasil disimpan.<br>Terima kasih atas laporan Anda.';
  }

  showSummary(payload);
  showToast(tersimpanOffline
    ? 'Laporan disimpan di perangkat, akan dikirim otomatis saat online.'
    : 'Laporan berhasil dikirim!', tersimpanOffline ? 'warn' : 'success');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ════════════════════════════════════════════════
// RINGKASAN SUKSES
// ════════════════════════════════════════════════

function showSummary(data) {
  var box = document.getElementById('summaryBox');
  if (!box) return;
  box.innerHTML =
    '<table>' +
    sumRow('Tanggal', data.tanggal + ' ' + data.waktu) +
    sumRow('Petugas', data.namaPetugas + ' (' + data.jabatan + ')') +
    sumRow('Lokasi', data.namaDI + ' – ' + data.namaSaluran) +
    sumRow('Wilayah', [data.namaDesa, data.kecamatan, data.namaKab].filter(Boolean).join(', ') || '-') +
    sumRow('Kegiatan', data.kegiatan || '-') +
    sumRow('Foto', (data.foto ? data.foto.length : 0) + ' foto terlampir') +
    '</table>';
}

function sumRow(label, value) {
  return '<tr><td>' + label + '</td><td>' + (value || '-') + '</td></tr>';
}

// ════════════════════════════════════════════════
// RESET
// ════════════════════════════════════════════════

function resetForm() {
  document.querySelectorAll('input, textarea, select').forEach(function(el) {
    if (el.type === 'checkbox' || el.type === 'radio') {
      el.checked = false;
    } else if (el.type !== 'file') {
      el.value = '';
    }
  });

  document.querySelectorAll('.check-item').forEach(function(el) {
    el.classList.remove('selected');
  });

  fotoList = [];
  renderPhotoGrid();
  var uploadProgress = document.getElementById('uploadProgress');
  if (uploadProgress) uploadProgress.style.display = 'none';

  var now = new Date();
  document.getElementById('tanggal').value = now.toISOString().slice(0, 10);
  document.getElementById('waktu').value   = now.toTimeString().slice(0, 5);

  var activePage = document.getElementById('page' + currentStep);
  if (activePage) activePage.classList.remove('active');

  currentStep = 0;
  var page0 = document.getElementById('page0');
  if (page0) page0.classList.add('active');

  document.querySelectorAll('.step-item').forEach(function(s) {
    s.classList.remove('active', 'done');
  });
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
  toastTimer = setTimeout(function() {
    toast.className = 'toast';
  }, 3500);
}

// ════════════════════════════════════════════════
// ANTREAN OFFLINE — IndexedDB (muat banyak foto)
// ════════════════════════════════════════════════

var DB_NAME  = 'sipop-db';
var DB_STORE = 'antrean';

function idbOpen() {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = function() {
      req.result.createObjectStore(DB_STORE, { keyPath: 'key', autoIncrement: true });
    };
    req.onsuccess = function() { resolve(req.result); };
    req.onerror   = function() { reject(req.error); };
  });
}

function idbAdd(item) {
  return idbOpen().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).add(item);
      tx.oncomplete = function() { db.close(); resolve(); };
      tx.onerror    = function() { db.close(); reject(tx.error); };
      tx.onabort    = function() { db.close(); reject(tx.error || new Error('Transaksi dibatalkan')); };
    });
  });
}

function idbGetAll() {
  return idbOpen().then(function(db) {
    return new Promise(function(resolve, reject) {
      var req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).getAll();
      req.onsuccess = function() { db.close(); resolve(req.result || []); };
      req.onerror   = function() { db.close(); reject(req.error); };
    });
  });
}

function idbDelete(key) {
  return idbOpen().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(key);
      tx.oncomplete = function() { db.close(); resolve(); };
      tx.onerror    = function() { db.close(); reject(tx.error); };
    });
  });
}

function idbCount() {
  return idbOpen().then(function(db) {
    return new Promise(function(resolve, reject) {
      var req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).count();
      req.onsuccess = function() { db.close(); resolve(req.result); };
      req.onerror   = function() { db.close(); reject(req.error); };
    });
  });
}

// ── Banner "X laporan tersimpan di perangkat" ──
function updatePendingBanner() {
  return idbCount().then(function(n) {
    var banner = document.getElementById('pendingBanner');
    var count  = document.getElementById('pendingCount');
    if (count)  count.textContent = n;
    if (banner) banner.style.display = n > 0 ? 'flex' : 'none';
    return n;
  }).catch(function(err) {
    console.warn('Gagal membaca antrean:', err);
    return 0;
  });
}

// ── Kirim semua laporan di antrean (dipanggil tombol "Sinkronkan Sekarang") ──
var isSyncing = false;

function syncPendingReports() {
  if (isSyncing) return Promise.resolve();
  if (!navigator.onLine) {
    showToast('Belum ada koneksi internet. Laporan akan dikirim otomatis saat online.', 'warn');
    return Promise.resolve();
  }

  isSyncing = true;
  var btn = document.getElementById('btnSync');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Mengirim...'; }

  var terkirim = 0;
  var gagal = false;

  return idbGetAll().then(function(items) {
    // Kirim satu per satu (berurutan) agar tidak membebani sinyal lemah
    return items.reduce(function(chain, item) {
      return chain.then(function() {
        if (gagal) return;
        return kirimKeServer(item.data)
          .then(function() { return idbDelete(item.key); })
          .then(function() { terkirim++; })
          .catch(function(err) {
            console.warn('Sinkronisasi gagal, dicoba lagi nanti:', err);
            gagal = true;   // berhenti; sisanya tetap di antrean
          });
      });
    }, Promise.resolve());
  }).then(function() {
    return updatePendingBanner();
  }).then(function(sisa) {
    if (terkirim > 0) showToast(terkirim + ' laporan berhasil dikirim.' + (sisa > 0 ? ' Sisa ' + sisa + ' menunggu koneksi.' : ''), 'success');
    else if (gagal)   showToast('Gagal mengirim, akan dicoba lagi otomatis.', 'warn');
  }).catch(function(err) {
    console.error('Error sinkronisasi:', err);
  }).then(function() {
    isSyncing = false;
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Sinkronkan Sekarang'; }
  });
}

// ── Lencana status koneksi di header ──
function updateStatus() {
  var dot  = document.getElementById('statusDot');
  var text = document.getElementById('statusText');
  var online = navigator.onLine;
  if (dot)  { if (online) dot.classList.add('on'); else dot.classList.remove('on'); }
  if (text) text.textContent = online ? 'Server Terhubung' : 'Mode Offline';
}

window.addEventListener('online', function() {
  updateStatus();
  syncPendingReports();     // otomatis kirim saat sinyal kembali
});

window.addEventListener('offline', function() {
  updateStatus();
});

// Cadangan: coba kirim tiap 30 detik jika masih ada antrean
setInterval(function() {
  if (navigator.onLine && !isSyncing) {
    updatePendingBanner().then(function(n) {
      if (n > 0) syncPendingReports();
    });
  }
}, 30000);

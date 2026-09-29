const { Plugin, Notice } = require("obsidian");

/* Eski gizli blok (Obsidian %% yorumu — canlı önizlemede GÖRÜNÜR) */
const VERI_BAS = "%% not-defteri:veri";
const VERI_SON = "%% /not-defteri:veri";
/* Yeni gizli blok: ham HTML div + styles.css'te display:none (3d-maliyet/model-veri deseni) */
const DIV_BAS = '<div class="nd-veri">';
const DIV_SON = "</div>";

/* ---------- saf yardımcılar (test edilebilir) ---------- */

function splitList(v) {
  return String(v).split(/[,;]/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
}

function parseConfig(src) {
  const cfg = {
    baslik: "",
    ogeler: ["Ödev"],
    isaretler: ["+", "−", "G"],
    ogrenciler: [],
    tarih: "",
    oneriler: ["Ödev", "Ezber", "Derse katılım", "Araç gereç"],
    gsenkron: true,
    veliveri: ""
  };
  const lines = String(src == null ? "" : src).split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.slice(0, 2) === "- " || line.slice(0, 2) === "* ") {
      const ad = line.slice(2).trim();
      if (ad) cfg.ogrenciler.push(ad);
      continue;
    }
    const m = line.match(/^([^:]{1,24}):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim().toLowerCase();
    const val = m[2].trim();
    if (key === "başlık" || key === "baslik") cfg.baslik = val;
    else if (key === "öğeler" || key === "ogeler") cfg.ogeler = splitList(val);
    else if (key === "işaretler" || key === "isaretler") cfg.isaretler = splitList(val);
    else if (key === "tarih") cfg.tarih = val;
    else if (key === "öneriler" || key === "oneriler") cfg.oneriler = splitList(val);
    else if (key === "gsenkron" || key === "g_senkron") cfg.gsenkron = !/^(hayir|hayır|no|false|0|kapali|kapalı|off)$/i.test(val);
    else if (key === "veli-veri" || key === "veli_veri" || key === "veliveri" || key === "veli veri") cfg.veliveri = val;
  }
  if (!cfg.ogeler.length) cfg.ogeler = ["Ödev"];
  if (!cfg.isaretler.length) cfg.isaretler = ["+", "−", "G"];
  if (!cfg.oneriler.length) cfg.oneriler = cfg.ogeler.slice();
  return cfg;
}

function pad2(n) { return n < 10 ? "0" + n : "" + n; }

function isoBugun(d) {
  const t = d || new Date();
  return t.getFullYear() + "-" + pad2(t.getMonth() + 1) + "-" + pad2(t.getDate());
}

function isoTarih(s) {
  const m = String(s == null ? "" : s).trim().match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  if (!m) return "";
  return m[1] + "-" + pad2(parseInt(m[2], 10)) + "-" + pad2(parseInt(m[3], 10));
}

function gunEtiketi(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? m[3] + "." + m[2] : String(iso);
}

function isoDate(iso) {
  const m = String(iso == null ? "" : iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
}

/* Takvim günü ekler/çıkarır (‹ › butonları): "2026-09-18" + 1 → "2026-09-19".
   Kayıt olmayan güne de gidilebilir — gün sadece gezinirken oluşur. */
function isoGunEkle(iso, gun) {
  const d = isoDate(iso);
  if (!d) return "";
  d.setDate(d.getDate() + gun);
  return isoBugun(d);
}

const GUN_ADLARI = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

/* Nav etiketi: "22.09 Salı" — gün adı, hangi günde olduğunu hatırlatır */
function gunEtiketiUzun(iso) {
  const d = isoDate(iso);
  if (!d) return gunEtiketi(iso);
  return gunEtiketi(iso) + " " + GUN_ADLARI[d.getDay()];
}

function bosVeri() { return { aktif: "", kayit: {}, ogeler: {}, gizli: {}, ogrenciler: [], cikarilan: [] }; }

function diziTemizle(d) {
  if (Object.prototype.toString.call(d) !== "[object Array]") return [];
  return d.filter(function (x) { return typeof x === "string" && x.trim().length > 0; });
}

function veriNormalle(o) {
  const veri = bosVeri();
  if (!o || typeof o !== "object") return veri;
  veri.aktif = typeof o.aktif === "string" ? o.aktif : "";
  veri.kayit = o.kayit && typeof o.kayit === "object" ? o.kayit : {};
  veri.ogeler = {};
  if (o.ogeler && typeof o.ogeler === "object") {
    Object.keys(o.ogeler).forEach(function (t) {
      const temiz = diziTemizle(o.ogeler[t]);
      if (temiz.length) veri.ogeler[t] = temiz;
    });
  }
  /* gizli: konfigteki (`ogeler:`) bir ogenin O GUN icin kapatilmasi → {tarih:[oge...]} */
  veri.gizli = {};
  if (o.gizli && typeof o.gizli === "object") {
    Object.keys(o.gizli).forEach(function (t) {
      const temiz = diziTemizle(o.gizli[t]);
      if (temiz.length) veri.gizli[t] = temiz;
    });
  }
  /* ogrenciler: panelden (Ogrenciler) eklenen ogrenciler — kod blogundaki liste DEGISMEZ */
  veri.ogrenciler = diziTemizle(o.ogrenciler);
  /* cikarilan: listeden cikarilan ogrenciler (kod blogundakiler dahil) — satir SILINMEZ, gizlenir */
  veri.cikarilan = diziTemizle(o.cikarilan);
  return veri;
}

function veriJson(text) {
  const t = String(text == null ? "" : text);
  const k = t.indexOf(DIV_BAS);
  if (k !== -1) {
    const l = t.indexOf(DIV_SON, k + DIV_BAS.length);
    if (l !== -1) return t.slice(k + DIV_BAS.length, l).trim();
  }
  const i = t.indexOf(VERI_BAS);
  const j = t.indexOf(VERI_SON);
  if (i !== -1 && j !== -1 && j > i) return t.slice(i + VERI_BAS.length, j).trim();
  return "";
}

function parseData(text) {
  const raw = veriJson(text);
  if (!raw) return bosVeri();
  try {
    return veriNormalle(JSON.parse(raw));
  } catch (e) {
    return bosVeri(); /* bozuk veri bloğu: boş kabul et */
  }
}

function serializeData(veri) {
  return DIV_BAS + "\n" + JSON.stringify(veriNormalle(veri), null, 1) + "\n" + DIV_SON;
}

/* Eski %% bloğunu temizler, veriyi yeni gizli div'e yazar (çoğaltmaz). */
function writeData(text, veri) {
  let t = String(text == null ? "" : text);
  const blok = serializeData(veri);
  const i = t.indexOf(VERI_BAS);
  const j = t.indexOf(VERI_SON);
  if (i !== -1 && j !== -1 && j > i) t = t.slice(0, i) + t.slice(j + VERI_SON.length);
  const k = t.indexOf(DIV_BAS);
  if (k !== -1) {
    const l = t.indexOf(DIV_SON, k + DIV_BAS.length);
    if (l !== -1) return t.slice(0, k) + blok + t.slice(l + DIV_SON.length);
  }
  return t.replace(/\s+$/, "").replace(/\n{3,}/g, "\n\n") + "\n\n" + blok + "\n";
}

function tarihleri(veri) {
  return Object.keys(veri.kayit || {}).sort();
}

/* --- boş günler (Gelişmiş paneli): işareti, günlük öğesi ve kapatılmış öğesi olmayan tarih --- */

function bosGunMu(veri, t) {
  const gun = veri.kayit[t];
  if (gun) {
    const dolu = Object.keys(gun).some(function (ad) {
      const satir = gun[ad];
      return satir && Object.keys(satir).length > 0;
    });
    if (dolu) return false;
  }
  if (((veri.ogeler || {})[t] || []).length) return false;
  if (((veri.gizli || {})[t] || []).length) return false;
  return true;
}

function bosGunler(veri) {
  return tarihleri(veri).filter(function (t) { return bosGunMu(veri, t); });
}

/* Boş günleri siler; silinen tarihleri döndürür. Aktif gün silindiyse aktif sıfırlanır. */
function bosGunTemizle(veri) {
  const bos = bosGunler(veri);
  bos.forEach(function (t) {
    delete veri.kayit[t];
    if (veri.ogeler) delete veri.ogeler[t];
    if (veri.gizli) delete veri.gizli[t];
  });
  if (bos.indexOf(veri.aktif) >= 0) veri.aktif = "";
  return bos;
}

/* --- öğrenciler: kod bloğundaki liste + panelden eklenenler − çıkarılanlar --- */

/* Kod bloğu + panelden eklenenler (çıkarılanlar DAHİL — "geri al" için gerekli) */
function ogrenciHavuzu(cfg, veri) {
  const out = cfg.ogrenciler.slice();
  const ek = (veri && veri.ogrenciler) || [];
  ek.forEach(function (ad) { if (!out.some(function (a) { return adAyni(a, ad); })) out.push(ad); });
  return out;
}

/* Ekranda görünen öğrenciler: havuz − çıkarılanlar (v7) */
function ogrencilerOf(cfg, veri) {
  const cik = (veri && veri.cikarilan) || [];
  return ogrenciHavuzu(cfg, veri).filter(function (ad) {
    return !cik.some(function (c) { return adAyni(c, ad); });
  });
}

/* Çıkarılıp panelde ↺ ile geri alınabilecek öğrenciler */
function cikarilanlar(cfg, veri) {
  const cik = (veri && veri.cikarilan) || [];
  const havuz = ogrenciHavuzu(cfg, veri);
  return cik.filter(function (ad) { return havuz.some(function (a) { return adAyni(a, ad); }); });
}

function adTemizle(ad) {
  return String(ad == null ? "" : ad).trim().replace(/\s+/g, " ").slice(0, 60);
}

/* Ad karşılaştırma anahtarı: Türkçe İ/I/ı farkı + büyük-küçük harf + çoklu boşluk eşitlenir
   ("Zeynep ÇELİK" = "zeynep çelik"). JS toLowerCase() "İ"yi "i̇" (i + birleşik nokta) yapar — bu yüzden elle eşlenir. */
function adAnahtar(ad) {
  return adTemizle(ad).replace(/İ/g, "i").replace(/I/g, "i").replace(/ı/g, "i").toLowerCase();
}

function adAyni(a, b) {
  return adAnahtar(a) === adAnahtar(b);
}

/* Öğrenci ekler; eklendiyse temizlenmiş adı, eklenmediyse "" döner.
   Daha önce çıkarılmış ad yazılırsa GERİ GETİRİLİR (yeni kopya oluşmaz). */
function ogrenciEkle(cfg, veri, ad) {
  const temiz = adTemizle(ad);
  if (!temiz) return "";
  if (!veri.ogrenciler) veri.ogrenciler = [];
  if (!veri.cikarilan) veri.cikarilan = [];
  const k = veri.cikarilan.map(function (a) { return adAnahtar(a); }).indexOf(adAnahtar(temiz));
  if (k >= 0) { /* çıkarılmıştı → geri getirildi (kayıtlı ad korunur: "ali veli" yazsan da "Ali VELİ" görünür) */
    const orijinal = veri.cikarilan[k];
    veri.cikarilan.splice(k, 1);
    return orijinal;
  }
  if (ogrenciHavuzu(cfg, veri).some(function (a) { return adAyni(a, temiz); })) return "";
  veri.ogrenciler.push(temiz);
  return temiz;
}

/* Öğrenciyi listeden çıkarır — kod bloğundaki öğrenci dahil HERKES çıkarılabilir.
   Kalıcı silme DEĞİL: ad `veri.cikarilan`a yazılır (kod bloğu satırına dokunulmaz) ve
   panelden ↺ ile geri alınır. İşaretler SİLİNMEZ — geri alınırsa yerinde durur. */
function ogrenciKaldir(cfg, veri, ad) {
  if (!veri.cikarilan) veri.cikarilan = [];
  if (!ogrenciHavuzu(cfg, veri).some(function (a) { return adAyni(a, ad); })) return false;
  if (veri.cikarilan.some(function (a) { return adAyni(a, ad); })) return false;
  veri.cikarilan.push(adTemizle(ad));
  return true;
}

/* Çıkarılan öğrenciyi geri alır (↺) */
function ogrenciGeriAl(cfg, veri, ad) {
  const cik = (veri && veri.cikarilan) || [];
  const i = cik.map(function (a) { return adAnahtar(a); }).indexOf(adAnahtar(ad));
  if (i < 0) return false;
  cik.splice(i, 1);
  return true;
}

function markOf(veri, tarih, ad, oge) {
  const g = veri.kayit[tarih];
  if (!g || !g[ad]) return "";
  const v = g[ad][oge];
  return typeof v === "string" ? v : "";
}

const TIRELER = ["-", "–", "−", "—", "eksi"];
const GELMEDILER = ["o", "g", "gelmedi", "yok", "y", "0"];

function normMark(cfg, m) {
  if (!m) return "";
  const s = String(m).trim();
  if (cfg.isaretler.indexOf(s) >= 0) return s;
  const kucuk = s.toLowerCase();
  const tireMi = TIRELER.indexOf(s) >= 0;
  const gelmediMi = GELMEDILER.indexOf(kucuk) >= 0;
  for (let i = 0; i < cfg.isaretler.length; i++) {
    const a = cfg.isaretler[i];
    const ak = a.toLowerCase();
    if (tireMi && TIRELER.indexOf(a) >= 0) return a;
    if (gelmediMi && GELMEDILER.indexOf(ak) >= 0) return a;
    if (ak === kucuk) return a;
  }
  return s;
}

function markNorm(cfg, veri, tarih, ad, oge) {
  return normMark(cfg, markOf(veri, tarih, ad, oge));
}

/* G işareti (gelmedi) — isaretler listesinde "o/g/gelmedi..." olan ilk işaret */
function gelmediIsaret(cfg) {
  for (let i = 0; i < cfg.isaretler.length; i++) {
    const a = cfg.isaretler[i];
    if (GELMEDILER.indexOf(String(a).toLowerCase()) >= 0) return a;
  }
  return "";
}

function setMark(veri, tarih, ad, oge, isaret) {
  if (!veri.kayit[tarih]) veri.kayit[tarih] = {};
  if (!veri.kayit[tarih][ad]) veri.kayit[tarih][ad] = {};
  if (isaret) veri.kayit[tarih][ad][oge] = isaret;
  else delete veri.kayit[tarih][ad][oge];
  if (Object.keys(veri.kayit[tarih][ad]).length === 0) delete veri.kayit[tarih][ad];
  return veri;
}

/* --- veli verisi (ayrı JSON dosyası): öğrenci kartı ---
   Yapı: { "ogrenciler": { "<adAnahtar>": { ad, no, <alan>: deger, notlar: {...} } },
           "notlar": ["Rehberlik", "Sağlık", "Öğrenme stili"] }

   Kart alanları: Karışık (metin) sütun + Türkçe etiket + kısa ad (JSON anahtarı) + bölüm.
   Bölümler kartta başlıkla ayrılır: Kimlik / Aile / Veli / Sağlık / Ulaşım. */

const VELI_ALANLAR = [
  { ad: "tc", etiket: "T.C. kimlik", bolum: "Kimlik", tip: "text" },
  { ad: "dogum", etiket: "Doğum günü", bolum: "Kimlik", tip: "text" },
  { ad: "dogumYeri", etiket: "Doğum yeri", bolum: "Kimlik", tip: "text" },
  { ad: "kan", etiket: "Kan grubu", bolum: "Kimlik", tip: "text", havuz: "kan" },
  { ad: "adres", etiket: "Ev adresi", bolum: "Kimlik", tip: "text", genis: true },
  { ad: "anne", etiket: "Anne", bolum: "Aile", tip: "text" },
  { ad: "anneMeslek", etiket: "Meslek", bolum: "Aile", tip: "text" },
  { ad: "anneTel", etiket: "Tel", bolum: "Aile", tip: "tel" },
  { ad: "baba", etiket: "Baba", bolum: "Aile", tip: "text" },
  { ad: "babaMeslek", etiket: "Meslek", bolum: "Aile", tip: "text" },
  { ad: "babaTel", etiket: "Tel", bolum: "Aile", tip: "tel" },
  { ad: "veliYakinlik", etiket: "Veli yakınlığı", bolum: "Veli", tip: "text" },
  { ad: "veli", etiket: "Veli adı", bolum: "Veli", tip: "text" },
  { ad: "kardes", etiket: "Kardeş", bolum: "Veli", tip: "text" },
  { ad: "saglik", etiket: "Sağlık", bolum: "Sağlık", tip: "text", genis: true },
  { ad: "ilac", etiket: "İlaç", bolum: "Sağlık", tip: "text" },
  { ad: "alerji", etiket: "Alerji", bolum: "Sağlık", tip: "text" },
  { ad: "gozluk", etiket: "Gözlük", bolum: "Sağlık", tip: "text" },
  { ad: "duyma", etiket: "Duyma", bolum: "Sağlık", tip: "text" },
  { ad: "zorDers", etiket: "Zorlandığı ders", bolum: "Akademik", tip: "text" },
  { ad: "hedefMeslek", etiket: "Hedef meslek", bolum: "Akademik", tip: "text" },
  { ad: "hedefLise", etiket: "Hedef lise", bolum: "Akademik", tip: "text" },
  { ad: "izinIletisim", etiket: "İletişim grubu onayı", bolum: "İzin ve Onay", tip: "text", havuz: "evetHayir" },
  { ad: "izinGorsel", etiket: "Görsel materyal (KVKK)", bolum: "İzin ve Onay", tip: "text", havuz: "evetHayir" },
  { ad: "gelis", etiket: "Geliş", bolum: "Ulaşım", tip: "text", havuz: "gelis" },
  { ad: "internet", etiket: "İnternet", bolum: "Ulaşım", tip: "text" }
];

/* --- seçmeli alan havuzu (kart) -------------------------------------------------
   Alan tanımına `havuz: "<ad>"` eklenirse kart satırı SERBEST METİN yerine liste olur:
   - kapalıyken: seçili değeri gösteren buton (▾) — değer yoksa "— seç —"
   - tıklayınca açılan liste: havuzdaki seçenekler + "Diğer…" (serbest yazı) + "— boş —" (temizle)
   Aynı havuz TÜM ÖĞRENCİLER için ortaktır; bu dosyada tanımlı seçenekler + dosyada zaten
   yazılmış değerler görünür (ör. "Servis - Kadir"). Kullanıcı eklediği yeni değer dosyaya yazılır.
   Böylece standart veriler (kan grubu, onaylar, geliş) her seferinde elle yazılmaz, ama mevcut
   serbest değerler (ör. "Servis - Kadir Koçak") OLDUĞU GİBİ korunur. */
function veliHavuz(cfg, ad) {
  const H = {
    kan: ["0 Rh+", "0 Rh−", "A Rh+", "A Rh−", "B Rh+", "B Rh−", "AB Rh+", "AB Rh−"],
    evetHayir: ["Var", "Yok"],
    gelis: ["Yürüyerek", "Servis", "Velisi getiriyor"]
  };
  const c = cfg && cfg.havuzlar;
  if (c && c[ad] && c[ad].length) return diziTemizle(c[ad]);
  return (H[ad] || []).slice();
}

const VELI_BOLUMLER = ["Kimlik", "Aile", "Veli", "Sağlık", "Akademik", "İzin ve Onay", "Ulaşım"];

/* Metin alanlarının JSON anahtarları (not/<ad> ayrı tutulur) */
const VELI_METIN_ALANLAR = VELI_ALANLAR.map(function (a) { return a.ad; });

const VELI_NOT_VARSAYILAN = ["Rehberlik", "Sağlık", "Öğrenme stili"];

const VELI_ALAN_UZUNLUK = { no: 12, tc: 11, dogum: 24, dogumYeri: 40, kan: 8, adres: 120, anne: 60, anneMeslek: 60, anneTel: 40, baba: 60, babaMeslek: 60, babaTel: 40, veliYakinlik: 24, veli: 80, kardes: 40, saglik: 200, ilac: 120, alerji: 120, gozluk: 60, duyma: 60, zorDers: 60, hedefMeslek: 60, hedefLise: 60, izinIletisim: 40, izinGorsel: 40, gelis: 80, internet: 40 };

function veliAlanEtiketi(ad) {
  for (let i = 0; i < VELI_ALANLAR.length; i++) if (VELI_ALANLAR[i].ad === ad) return VELI_ALANLAR[i].etiket;
  return ad;
}

function veliBosKayit(ad) {
  return { ad: adTemizle(ad || ""), no: "", notlar: {} };
}

function veliBos() { return { ogrenciler: {}, notlar: VELI_NOT_VARSAYILAN.slice() }; }

function veliNormalle(o) {
  const v = veliBos();
  if (!o || typeof o !== "object") return v;
  v.notlar = diziTemizle(o.notlar);
  if (!v.notlar.length) v.notlar = VELI_NOT_VARSAYILAN.slice();
  if (o.ogrenciler && typeof o.ogrenciler === "object") {
    Object.keys(o.ogrenciler).forEach(function (k) {
      const s = o.ogrenciler[k];
      if (!s || typeof s !== "object") return;
      const kayit = veliBosKayit(s.ad || "");
      kayit.ad = adTemizle(s.ad || "") || k;
      // no + tüm tanımlı metin alanları
      ["no"].concat(VELI_METIN_ALANLAR).forEach(function (a) {
        const t = s[a] == null ? "" : String(s[a]).trim();
        if (t) kayit[a] = t.slice(0, VELI_ALAN_UZUNLUK[a] || 120);
      });
      if (s.notlar && typeof s.notlar === "object") {
        Object.keys(s.notlar).forEach(function (n) {
          const t = s.notlar[n] == null ? "" : String(s.notlar[n]);
          if (t.trim()) kayit.notlar[n] = t;
        });
      }
      v.ogrenciler[k] = kayit;
    });
  }
  return v;
}

function veliJson(text) {
  const t = String(text == null ? "" : text).trim();
  if (!t) return veliBos();
  try { return veliNormalle(JSON.parse(t)); } catch (e) { return veliBos(); }
}

function veliSerialize(v) { return JSON.stringify(veliNormalle(v), null, 1); }

/* Kayıtlı bilgileri kod bloğundaki/tanımlı sırayla eşleştirir (adAnahtar ile) */
function veliKaydi(veli, ad) {
  if (!veli || !veli.ogrenciler) return null;
  const k = adAnahtar(ad);
  if (veli.ogrenciler[k]) return veli.ogrenciler[k];
  /* anahtar tutmazsa kayıtlı ad üzerinden dene (isim yazımı değişmiş olabilir) */
  const anahtarlar = Object.keys(veli.ogrenciler);
  for (let i = 0; i < anahtarlar.length; i++) {
    const kayit = veli.ogrenciler[anahtarlar[i]];
    if (kayit && adAyni(kayit.ad, ad)) return kayit;
  }
  return null;
}

/* Havuzun tüm seçenekleri: alanın tanımlı havuzu + dosyada yazılmış değerler (tüm öğrenciler)
   + kod bloğundaki `havuzlar:` satırı (havuzlar.<alan>) + o an seçili değer. Sıra: seçili en üstte. */
function veliHavuzSecenekleri(veli, cfg, alan, secili) {
  const s = veliHavuz(cfg, alan).slice();
  const ekle = function (x) { x = String(x == null ? "" : x).trim(); if (x && s.indexOf(x) < 0) s.push(x); };
  if (veli && veli.ogrenciler) {
    Object.keys(veli.ogrenciler).forEach(function (k) {
      const r = veli.ogrenciler[k];
      if (r && r[alan]) ekle(r[alan]);
    });
  }
  ekle(secili);
  if (secili) {
    const i = s.indexOf(secili);
    if (i > 0) { s.splice(i, 1); s.unshift(secili); }
  }
  return s;
}

/* Kart alanını günceller; kayıt yoksa oluşturur. Dönen: kayıt.
   alan: "no" | tanımlı metin alanı | "not:<Alan Adı>" */
function veliAlanYaz(veli, ad, alan, deger) {
  const k = adAnahtar(ad);
  if (!veli.ogrenciler[k]) veli.ogrenciler[k] = veliBosKayit(ad);
  const kayit = veli.ogrenciler[k];
  kayit.ad = adTemizle(ad) || kayit.ad;
  const d = deger == null ? "" : String(deger);
  if (alan === "no" || VELI_METIN_ALANLAR.indexOf(alan) >= 0) {
    const t = d.trim();
    if (t) kayit[alan] = t.slice(0, VELI_ALAN_UZUNLUK[alan] || 120);
    else delete kayit[alan];
  } else if (alan.indexOf("not:") === 0) {
    const n = alan.slice(4);
    if (!n) return kayit;
    if (d.trim()) kayit.notlar[n] = d;
    else delete kayit.notlar[n];
  }
  return kayit;
}

/* Kart giriş kutusunun başlangıç değeri ("no" | "veli" | ... | "not:<ad>") */
function veliAlanKirisi(kayit, alan) {
  if (!kayit) return "";
  if (alan.indexOf("not:") === 0) return (kayit.notlar && kayit.notlar[alan.slice(4)]) || "";
  return kayit[alan] == null ? "" : String(kayit[alan]);
}

/* Kartta gösterilecek alan boş mu (satırda bilgi işareti için) */
function veliDolu(veli, ad) {
  const k = veliKaydi(veli, ad);
  if (!k) return false;
  if (k.no) return true;
  for (let i = 0; i < VELI_METIN_ALANLAR.length; i++) if (k[VELI_METIN_ALANLAR[i]]) return true;
  return Object.keys(k.notlar || {}).length > 0;
}

function veliNotlari(veli) {
  const out = (veli && veli.notlar) || VELI_NOT_VARSAYILAN.slice();
  return out.length ? out : VELI_NOT_VARSAYILAN.slice();
}

function veliNotEkle(veli, ad) {
  const t = String(ad == null ? "" : ad).trim().replace(/\s+/g, " ").slice(0, 40);
  if (!t) return "";
  if (!veli.notlar) veli.notlar = [];
  if (veli.notlar.indexOf(t) >= 0) return "";
  veli.notlar.push(t);
  return t;
}

/* Kayıttaki dolu alan sayısı (kart başlığında özet için) */
function veliDoluSayisi(veli, ad) {
  const k = veliKaydi(veli, ad);
  if (!k) return 0;
  let n = 0;
  if (k.no) n++;
  VELI_METIN_ALANLAR.forEach(function (a) { if (k[a]) n++; });
  return n;
}


/* --- öğeler: konfigtekiler + o güne eklenenler --- */

function ogelerOf(cfg, veri, tarih) {
  /* konfigteki öğeler − o gün kapatılanlar (veri.gizli) + o güne eklenenler */
  const kapali = (veri.gizli && veri.gizli[tarih]) || [];
  const out = cfg.ogeler.filter(function (o) { return kapali.indexOf(o) < 0; });
  const ek = (veri.ogeler && veri.ogeler[tarih]) || [];
  ek.forEach(function (o) { if (out.indexOf(o) < 0) out.push(o); });
  return out;
}

function tumOgeler(cfg, veri) {
  const out = cfg.ogeler.slice();
  const harita = veri.ogeler || {};
  /* Kayit tarihleri + gunluk oge anahtarlari (isaretleri silinmis gun oge listesi tutabilir) */
  const ts = tarihleri(veri);
  Object.keys(harita).forEach(function (t) { if (ts.indexOf(t) < 0) ts.push(t); });
  ts.forEach(function (t) {
    (harita[t] || []).forEach(function (o) { if (o && out.indexOf(o) < 0) out.push(o); });
  });
  return out;
}

/* Öğe HAVUZU (seçerek ekleme paneli): kod bloğundaki `oneriler:` + bugüne kadar
   kullanılmış tüm öğeler (konfigteki sabit öğeler dahil). Sıra: önce sabit/geçmiş öğeler,
   sonra henüz kullanılmamış öneriler. */
function ogeHavuzu(cfg, veri) {
  const out = tumOgeler(cfg, veri);
  (cfg.oneriler || []).forEach(function (o) {
    if (o && out.indexOf(o) < 0) out.push(o);
  });
  return out;
}

/* G senkronu: o gün "gelmedi" işaretli öğrencilere yeni açılan öğeye de G yazar */
function gSenkronDoldur(cfg, veri, tarih, oge) {
  const g = cfg.gsenkron ? gelmediIsaret(cfg) : "";
  if (!g) return;
  const gun = veri.kayit[tarih] || {};
  Object.keys(gun).forEach(function (ogr) {
    const satir = gun[ogr] || {};
    const varMi = Object.keys(satir).some(function (o) { return normMark(cfg, satir[o]) === g; });
    if (varMi) satir[oge] = g;
  });
}

/* Yeni öğe ekler. Eklendiyse adı, eklenmediyse "" döner.
   Konfigteki (`ogeler:`) öğe o gün kapatılmışsa GERİ AÇILIR.
   G senkronu açıksa o gün gelmedi işaretli öğrencilere yeni öğe de G yazılır. */
function ogeEkle(cfg, veri, tarih, ad) {
  const temiz = String(ad == null ? "" : ad).trim().replace(/\s+/g, " ").slice(0, 40);
  if (!temiz) return "";
  if (!veri.gizli) veri.gizli = {};
  if (cfg.ogeler.indexOf(temiz) >= 0) {
    const kapali = veri.gizli[tarih] || [];
    const k = kapali.indexOf(temiz);
    if (k < 0) return ""; /* zaten açık */
    kapali.splice(k, 1);
    if (!kapali.length) delete veri.gizli[tarih];
  } else {
    if (ogelerOf(cfg, veri, tarih).indexOf(temiz) >= 0) return "";
    if (!veri.ogeler) veri.ogeler = {};
    if (!veri.ogeler[tarih]) veri.ogeler[tarih] = [];
    veri.ogeler[tarih].push(temiz);
  }
  gSenkronDoldur(cfg, veri, tarih, temiz);
  return temiz;
}

/* Öğeyi O GÜNDEN kaldırır; o günün o öğe işaretlerini de siler.
   Konfigteki (`ogeler:`) öğe de kaldırılabilir: yalnız o gün için kapatılır (veri.gizli),
   başka günlerde açık kalır; seçim panelinden tek tıkla geri açılır. */
function ogeKaldir(cfg, veri, tarih, ad) {
  let oldu = false;
  if (cfg.ogeler.indexOf(ad) >= 0) {
    if (!veri.gizli) veri.gizli = {};
    if (!veri.gizli[tarih]) veri.gizli[tarih] = [];
    if (veri.gizli[tarih].indexOf(ad) < 0) { veri.gizli[tarih].push(ad); oldu = true; }
  } else {
    const ek = (veri.ogeler && veri.ogeler[tarih]) || [];
    const i = ek.indexOf(ad);
    if (i >= 0) { ek.splice(i, 1); if (!ek.length) delete veri.ogeler[tarih]; oldu = true; }
  }
  if (!oldu) return false;
  const gun = veri.kayit[tarih] || {};
  Object.keys(gun).forEach(function (ogr) {
    const satir = gun[ogr];
    if (!satir) return;
    delete satir[ad];
    if (!Object.keys(satir).length) delete gun[ogr];
  });
  return true;
}

function ozetSatirlari(cfg, veri) {
  const ts = tarihleri(veri);
  return ogrencilerOf(cfg, veri).map(function (ad) {
    const sayim = {};
    cfg.isaretler.forEach(function (s) { sayim[s] = 0; });
    let toplam = 0;
    ts.forEach(function (t) {
      ogelerOf(cfg, veri, t).forEach(function (o) {
        const m = markNorm(cfg, veri, t, ad, o);
        if (!m) return;
        toplam++;
        if (sayim[m] === undefined) sayim[m] = 0;
        sayim[m]++;
      });
    });
    const arti = cfg.isaretler.length > 0 ? (sayim[cfg.isaretler[0]] || 0) : 0;
    const eksi = cfg.isaretler.length > 1 ? (sayim[cfg.isaretler[1]] || 0) : 0;
    return { ad: ad, sayim: sayim, toplam: toplam, net: arti - eksi };
  });
}

/* Öğe bazında toplamlar (tüm tarihler + tüm öğrenciler) */
function ogeOzeti(cfg, veri) {
  const ts = tarihleri(veri);
  return tumOgeler(cfg, veri).map(function (oge) {
    const sayim = {};
    cfg.isaretler.forEach(function (s) { sayim[s] = 0; });
    let toplam = 0;
    ts.forEach(function (t) {
      ogrencilerOf(cfg, veri).forEach(function (ad) {
        const m = markNorm(cfg, veri, t, ad, oge);
        if (!m) return;
        toplam++;
        if (sayim[m] === undefined) sayim[m] = 0;
        sayim[m]++;
      });
    });
    const arti = cfg.isaretler.length > 0 ? (sayim[cfg.isaretler[0]] || 0) : 0;
    const eksi = cfg.isaretler.length > 1 ? (sayim[cfg.isaretler[1]] || 0) : 0;
    return { oge: oge, sayim: sayim, toplam: toplam, net: arti - eksi };
  });
}

/* ---------- eklenti ---------- */

class NotDefteriPlugin extends Plugin {
  async onload() {
    this.registerMarkdownCodeBlockProcessor("not-defteri", (source, el, ctx) => {
      const cfg = parseConfig(source);
      const ui = { ozet: false, yeniOge: false }; /* blok başına görünüm durumu */
      const ciz = () => boya(el, ctx, cfg, ui);
      ciz().catch((e) => {
        el.empty();
        el.createEl("div", { cls: "nd-kok nd-hata", text: "Not Defteri hatası: " + e.message });
        new Notice("Not Defteri hatası: " + e.message);
        console.error("not-defteri", e);
      });
    });
  }
}

async function dosyayiAl(ctx) {
  const yol = ctx && ctx.sourcePath ? ctx.sourcePath : "";
  const f = yol ? app.vault.getAbstractFileByPath(yol) : null;
  if (!f) throw new Error("not dosyası bulunamadı (" + yol + ")");
  return f;
}

async function oku(file) {
  const t = await app.vault.read(file);
  return { text: t, veri: parseData(t) };
}

async function yaz(file, veri) {
  if (app.vault.process) await app.vault.process(file, (t) => writeData(t, veri));
  else await app.vault.modify(file, writeData(await app.vault.read(file), veri));
}

/* --- veli verisi dosyası (notun yanında, kod bloğundaki `veli-veri:` adıyla) --- */

function veliYolu(ctx, cfg) {
  if (!cfg.veliveri) return "";
  const kaynak = (ctx && ctx.sourcePath) || "";
  const klasor = kaynak.indexOf("/") >= 0 ? kaynak.slice(0, kaynak.lastIndexOf("/") + 1) : "";
  let ad = cfg.veliveri;
  if (ad.indexOf("/") >= 0) return ad; /* tam yol verilmişse olduğu gibi */
  if (!/\.json$/i.test(ad)) ad += ".json";
  return klasor + ad;
}

function veliDosyasiAl(ctx, cfg) {
  const yol = veliYolu(ctx, cfg);
  if (!yol) return null;
  return app.vault.getAbstractFileByPath(yol);
}

async function veliDosyasiniOlustur(yol) {
  try { return await app.vault.create(yol, veliSerialize(veliBos())); }
  catch (e) { return app.vault.getAbstractFileByPath(yol); }
}

async function veliOku(ctx, cfg) {
  const yol = veliYolu(ctx, cfg);
  if (!yol) return null;
  let f = veliDosyasiAl(ctx, cfg);
  if (!f) f = await veliDosyasiniOlustur(yol);
  if (!f) throw new Error("veli veri dosyası açılamadı (" + yol + ")");
  return veliJson(await app.vault.read(f));
}

async function veliYaz(ctx, cfg, veli) {
  const yol = veliYolu(ctx, cfg);
  if (!yol) return;
  let f = veliDosyasiAl(ctx, cfg);
  if (!f) f = await veliDosyasiniOlustur(yol);
  if (!f) throw new Error("veli veri dosyası yazılamadı (" + yol + ")");
  const metin = veliSerialize(veli);
  if (app.vault.process) await app.vault.process(f, () => metin);
  else await app.vault.modify(f, metin);
}

function btn(el, metin, cls, fn) {
  const b = el.createEl("button", { cls: "nd-btn " + (cls || ""), text: metin });
  b.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    return Promise.resolve(fn()).catch((e) => new Notice("Not Defteri: " + e.message));
  });
  return b;
}

/* Buton olmayan tıklanır öğe (liste seçeneği, "— boş —" vb.) */
function anahtarTikla(el, fn) {
  if (!el || !el.addEventListener) return el;
  el.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    return Promise.resolve(fn()).catch((e) => new Notice("Not Defteri: " + e.message));
  });
  return el;
}

async function boya(el, ctx, cfg, ui) {
  ui = ui || {};
  if (ui.ozet === undefined) ui.ozet = false;
  if (ui.yeniOge === undefined) ui.yeniOge = false;
  if (ui.ogrenciler === undefined) ui.ogrenciler = false;
  if (ui.veli === undefined) ui.veli = "";
  if (ui.veliAlan === undefined) ui.veliAlan = null;
  if (ui.havuz === undefined) ui.havuz = null;

  const file = await dosyayiAl(ctx);
  let { text, veri } = await oku(file);
  let veli = cfg.veliveri ? await veliOku(ctx, cfg) : null;

  /* Tek seferlik göç: eski %% bloğu → gizli div */
  if (text.indexOf(VERI_BAS) !== -1) {
    await yaz(file, veri);
    veri = (await oku(file)).veri;
  }

  const ts = tarihleri(veri);
  if (cfg.tarih) {
    const iso = isoTarih(cfg.tarih);
    if (iso) {
      if (!veri.kayit[iso]) { veri.kayit[iso] = {}; await yaz(file, veri); }
      if (!veri.aktif) veri.aktif = iso;
    }
  }
  let aktif = veri.aktif;
  if (!aktif || !veri.kayit[aktif]) aktif = ts.length ? ts[ts.length - 1] : isoBugun();
  if (!veri.kayit[aktif]) veri.kayit[aktif] = {};

  const ogeler = ogelerOf(cfg, veri, aktif);
  const ogrenciler = ogrencilerOf(cfg, veri);
  const gIsaret = gelmediIsaret(cfg);

  el.empty();
  el.addClass("nd-kok");

  const baslik = el.createEl("div", { cls: "nd-baslik" });
  baslik.setText(cfg.baslik ? cfg.baslik : "Not Defteri");

  const git = async (yeni) => {
    const g = await oku(file);
    if (!g.veri.kayit[yeni]) g.veri.kayit[yeni] = {};
    g.veri.aktif = yeni;
    await yaz(file, g.veri);
    await boya(el, ctx, cfg, ui);
  };

  const isaretle = async (ad, oge, isaret) => {
    const g = await oku(file);
    const mevcut = markNorm(cfg, g.veri, aktif, ad, oge);
    const yeni = mevcut === isaret ? "" : isaret;
    const gunOgeler = ogelerOf(cfg, g.veri, aktif);
    if (cfg.gsenkron && gIsaret && isaret === gIsaret) {
      /* G her yerde: bir öğede gelmedi işaretlenirse o gün TÜM öğelere yazılır/silinir */
      gunOgeler.forEach(function (o) { setMark(g.veri, aktif, ad, o, yeni ? gIsaret : ""); });
    } else {
      setMark(g.veri, aktif, ad, oge, yeni);
    }
    g.veri.aktif = aktif;
    await yaz(file, g.veri);
    await boya(el, ctx, cfg, ui);
  };

  const ogeEkleTikla = async (ad) => {
    const g = await oku(file);
    const eklenen = ogeEkle(cfg, g.veri, aktif, ad);
    if (!eklenen) { new Notice("Not Defteri: \"" + ad + "\" zaten listede."); return; }
    g.veri.aktif = aktif;
    await yaz(file, g.veri);
    /* Panel AÇIK KALIR: seçim panelinden art arda birden fazla öğe eklenebilsin (v3). */
    await boya(el, ctx, cfg, ui);
  };

  const ogeKaldirTikla = async (ad) => {
    const g = await oku(file);
    if (!ogeKaldir(cfg, g.veri, aktif, ad)) { new Notice("Not Defteri: \"" + ad + "\" kaldırılamadı."); return; }
    g.veri.aktif = aktif;
    await yaz(file, g.veri);
    await boya(el, ctx, cfg, ui);
  };

  const ogrenciKaldirTikla = async (ad) => {
    const g = await oku(file);
    if (!ogrenciKaldir(cfg, g.veri, ad)) { new Notice("Not Defteri: \"" + ad + "\" listede bulunamadı."); return; }
    await yaz(file, g.veri);
    new Notice("Not Defteri: \"" + ad + "\" listeden çıkarıldı. İşaretleri silinmedi — ↺ ile geri alabilirsin.");
    await boya(el, ctx, cfg, ui);
  };

  const ogrenciGeriAlTikla = async (ad) => {
    const g = await oku(file);
    if (!ogrenciGeriAl(cfg, g.veri, ad)) { new Notice("Not Defteri: \"" + ad + "\" geri alınamadı."); return; }
    await yaz(file, g.veri);
    new Notice("Not Defteri: \"" + ad + "\" geri getirildi.");
    await boya(el, ctx, cfg, ui);
  };

  const ogrenciEkleTikla = async (ad) => {
    const g = await oku(file);
    const oncedenCikarilmis = ((g.veri.cikarilan) || []).some(function (a) { return adAyni(a, ad); });
    const eklenen = ogrenciEkle(cfg, g.veri, ad);
    if (!eklenen) { new Notice("Not Defteri: \"" + adTemizle(ad) + "\" zaten listede (ya da ad boş)."); return; }
    await yaz(file, g.veri);
    new Notice("Not Defteri: \"" + eklenen + "\" " + (oncedenCikarilmis ? "geri getirildi." : "eklendi."));
    await boya(el, ctx, cfg, ui);
  };

  /* --- veli verisi işlemleri (kart paneli) --- */
  const veliAlanKaydet = async (ad, alan, deger) => {
    const v = await veliOku(ctx, cfg);
    veliAlanYaz(v, ad, alan, deger);
    await veliYaz(ctx, cfg, v);
    const kayit = veliKaydi(v, ad);
    if (kayit) kayit._kaydedildi = new Date().toLocaleTimeString();
  };

  const kartAc = async (ad) => {
    ui.veli = adAyni(ui.veli, ad) ? "" : ad;
    ui.veliAlan = null;
    await boya(el, ctx, cfg, ui);
  };

  const veliNotEkleTikla = async (ad, girisEl) => {
    const adYeni = girisEl ? girisEl.value : "";
    const v = await veliOku(ctx, cfg);
    if (!veliNotEkle(v, adYeni)) { new Notice("Not Defteri: alan adı boş ya da zaten var."); return; }
    await veliYaz(ctx, cfg, v);
    ui.veliAlan = adYeni;
    await boya(el, ctx, cfg, ui);
  };

  const veliAlanSil = async (ad, alan) => {
    const v = await veliOku(ctx, cfg);
    veliAlanYaz(v, ad, alan, "");
    await veliYaz(ctx, cfg, v);
    await boya(el, ctx, cfg, ui);
  };

  const veliAlanYazTikla = async (ad, alan, deger) => {
    const v = await veliOku(ctx, cfg);
    veliAlanYaz(v, ad, alan, deger);
    await veliYaz(ctx, cfg, v);
    ui.havuz = null;
    await boya(el, ctx, cfg, ui);
  };

  const nav = el.createEl("div", { cls: "nd-nav" });
  const tumTarihler = tarihleri(veri);
  /* ‹ › artık TAKVİM GÜNÜ ilerler (kayıtlı günler arasında atlamaz): kayıt olmayan güne de gidilir,
     gün gezinirken oluşur. Eskiden yalnız var olan kayıtlar arasında geziliyordu → tek kayıtlı
     sınıfta iki ok da hiçbir şey yapmıyordu ("ileri geri gidemiyorum"). */
  btn(nav, "‹", "", () => git(isoGunEkle(aktif, -1) || aktif));
  nav.createEl("span", { cls: "nd-tarih", text: gunEtiketiUzun(aktif) });
  btn(nav, "›", "", () => git(isoGunEkle(aktif, 1) || aktif));
  /* Tarihe git: takvimden gün seç (eski "Yeni tarih" butonunun yerine — o yalnız bugüne götürüyordu) */
  const tarihGiris = nav.createEl("input", { cls: "nd-tarih-giris", attr: { type: "date", title: "Tarihe git" } });
  tarihGiris.value = aktif;
  tarihGiris.addEventListener("change", () => {
    const v = tarihGiris.value;
    return v && v !== aktif ? git(v) : Promise.resolve();
  });
  btn(nav, "Bugün", "", () => git(isoBugun()));
  btn(nav, "+ Öğe ekle", ui.yeniOge ? "nd-aktif" : "", async () => {
    ui.yeniOge = !ui.yeniOge;
    await boya(el, ctx, cfg, ui);
  });
  btn(nav, "Toplamlar", ui.ozet ? "nd-aktif" : "", async () => {
    ui.ozet = !ui.ozet;
    await boya(el, ctx, cfg, ui);
  });
  btn(nav, "Gelişmiş", ui.gelismis ? "nd-aktif" : "", async () => {
    ui.gelismis = !ui.gelismis;
    await boya(el, ctx, cfg, ui);
  });
  nav.createEl("span", { cls: "nd-not", text: ogrenciler.length + " öğrenci · " + tumTarihler.length + " ders kaydı" });

  if (ui.yeniOge) {
    /* SEÇEREK EKLEME: yazma yok — havuzdaki öğelere tıkla (☐ → eklendi ☑, tekrar tık → o günden kaldır). */
    const panel = el.createEl("div", { cls: "nd-ekle" });
    panel.createEl("div", { cls: "nd-ekle-baslik", text: "Öğeler — tıklayarak ekle / kaldır (" + gunEtiketi(aktif) + ")" });
    ogeHavuzu(cfg, veri).forEach(function (o) {
      const secili = ogeler.indexOf(o) >= 0;
      btn(panel, (secili ? "☑ " : "☐ ") + o, "nd-secim" + (secili ? " nd-aktif" : ""), () => (secili ? ogeKaldirTikla(o) : ogeEkleTikla(o)));
    });
    panel.createEl("span", { cls: "nd-not", text: "Havuz: kod bloğundaki `oneriler:` satırı + bugüne kadar kullandığın öğeler. Kaldırdığın öğe — kod bloğunda tanımlı olan dahil — yalnızca " + gunEtiketi(aktif) + " gününden çıkar; diğer günlerde yine görünür ve buradan tek tıkla geri açılır." });
  }

  if (ui.gelismis) {
    /* Gelişmiş: seyrek kullanılan bakım işleri (boş gün temizleme + öğrenci ekleme/çıkarma) */
    const gp = el.createEl("div", { cls: "nd-gelismis" });
    gp.createEl("div", { cls: "nd-ekle-baslik", text: "Gelişmiş" });
    /* v8: Öğrenciler butonu nav'dan buraya alındı (seyrek kullanılan işlev → Gelişmiş altında) */
    btn(gp, "Öğrenciler", ui.ogrenciler ? "nd-aktif" : "", async () => {
      ui.ogrenciler = !ui.ogrenciler;
      await boya(el, ctx, cfg, ui);
    });
    gp.createEl("span", { cls: "nd-not", text: "Öğrenci ekleme / çıkarma bu butonda (" + ogrenciler.length + " kişi)." });
    const bos = bosGunler(veri);
    btn(gp, "Boş günleri temizle" + (bos.length ? " (" + bos.length + ")" : ""), bos.length ? "" : "nd-pasif", async () => {
      const g = await oku(file);
      const silinen = bosGunTemizle(g.veri);
      if (!silinen.length) { new Notice("Not Defteri: silinecek boş gün yok."); return; }
      if (!g.veri.aktif) {
        /* aktif gün de silindiyse en son dolu güne (hiç kalmadıysa bugüne) düş ve diske yaz */
        const kalan = tarihleri(g.veri);
        g.veri.aktif = kalan.length ? kalan[kalan.length - 1] : isoBugun();
        if (!g.veri.kayit[g.veri.aktif]) g.veri.kayit[g.veri.aktif] = {};
      }
      await yaz(file, g.veri);
      new Notice("Not Defteri: " + silinen.length + " boş gün silindi (" + silinen.map(gunEtiketi).join(", ") + ").");
      await boya(el, ctx, cfg, ui);
    });
    gp.createEl("span", { cls: "nd-not", text: "Boş gün = hiç işaret ve günlük öğe içermeyen tarih (şu an " + bos.length + " tane). Silinen gün geri gelmez." });
  }

  if (ui.ogrenciler) {
    /* Öğrenciler paneli (Gelişmiş → Öğrenciler butonu) — TÜM liste (kod bloğu + sonradan eklenenler)
       tek ekranda, her satırda ✕ ile çıkarma, çıkarılanlar altta ↺ ile geri alınır. */
    const op = el.createEl("div", { cls: "nd-ogrenciler" });
    op.createEl("div", { cls: "nd-ekle-baslik", text: "Öğrenciler — " + ogrenciler.length + " kişi" });
    const giris = op.createEl("input", { cls: "nd-input", attr: { type: "text", placeholder: "Ad Soyad" } });
    const ekleTikla = () => ogrenciEkleTikla(giris.value || "");
    btn(op, "Ekle", "", ekleTikla);
    giris.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();
      return ekleTikla();
    });
    const izgara = op.createEl("div", { cls: "nd-ogr-liste" });
    ogrenciler.forEach(function (ad, i) {
      const satir = izgara.createEl("div", { cls: "nd-ogr-satir" });
      satir.createEl("span", { cls: "nd-ogr-ad", text: (i + 1) + ". " + ad });
      btn(satir, "✕", "nd-ogr-sil", () => ogrenciKaldirTikla(ad));
    });
    const cik = cikarilanlar(cfg, veri);
    if (cik.length) {
      const blok = op.createEl("div", { cls: "nd-ogr-cikarilan" });
      blok.createEl("span", { cls: "nd-not", text: "Çıkarılanlar (" + cik.length + "):" });
      cik.forEach(function (ad) {
        const kutu = blok.createEl("span", { cls: "nd-ogr-kutu nd-ogr-gizli" });
        kutu.createEl("span", { cls: "nd-ogr-ad", text: ad });
        btn(kutu, "↺", "nd-ogr-geri", () => ogrenciGeriAlTikla(ad));
      });
    }
    op.createEl("span", {
      cls: "nd-not",
      text: "Yazdığın ad listenin SONUNA eklenir (kayıt notun içindeki gizli veriye yazılır)."
        + " ✕ = listeden çıkar (işaretleri silinmez, alttaki ↺ ile geri alınır)."
        + " Kod bloğunda yazılı öğrenci satırı silinmez — ✕ yalnız o adı listeden gizler;"
        + " kalıcı silmek için notun kaynak modunda `- Ad Soyad` satırını kendin sil."
    });
  }

  const liste = el.createEl("div", { cls: "nd-liste" });
  if (liste.style && liste.style.setProperty) {
    /* kolon sayısı o günün öğe sayısına göre → öğe kolonları alt alta hizalı, karışmaz */
    liste.style.setProperty("--nd-kolon", "minmax(140px, 1.4fr) repeat(" + Math.max(1, ogeler.length) + ", minmax(104px, auto))");
  }
  if (!ogeler.length) {
    liste.createEl("div", { cls: "nd-not", text: gunEtiketi(aktif) + " gününde öğe yok — yukarıdaki \"+ Öğe ekle\" panelinden seç." });
  }
  ogrenciler.forEach(function (ad, i) {
    const satir = liste.createEl("div", { cls: "nd-satir" });
    const adHucre = satir.createEl("div", { cls: "nd-ad" });
    if (!veli) {
      adHucre.setText((i + 1) + ". " + ad);
    } else {
      /* veli verisi varsa: isme tıkla → öğrenci kartı; başında ● (bilgi var) / ○ (boş) */
      const dolu = veliDolu(veli, ad);
      const acik = adAyni(ui.veli, ad);
      const adBtn = btn(adHucre, (dolu ? "● " : "○ ") + (i + 1) + ". " + ad, "nd-ad-btn" + (acik ? " nd-aktif" : "") + (dolu ? " nd-ad-dolu" : ""), () => kartAc(ad));
      adBtn.setAttribute("title", "Öğrenci kartı: numara, veli iletişimi, özel notlar");
    }
    ogeler.forEach(function (oge) {
      const grup = satir.createEl("div", { cls: "nd-grup" });
      /* Öğe adı HER ZAMAN butonların üstünde (tek öğede de): "Öğeler:" rozet satırı kaldırıldı */
      grup.createEl("span", { cls: "nd-oge", text: oge });
      const butonlar = grup.createEl("div", { cls: "nd-butonlar" });
      cfg.isaretler.forEach(function (isaret) {
        const aktifMi = markNorm(cfg, veri, aktif, ad, oge) === isaret;
        btn(butonlar, isaret, aktifMi ? "nd-aktif" : "", () => isaretle(ad, oge, isaret));
      });
      /* güne özel öğe (kod bloğunda tanımlı olmayan) her zaman ✕ ile kaldırılabilir */
      if (cfg.ogeler.indexOf(oge) < 0) {
        btn(butonlar, "✕", "nd-oge-sil", () => ogeKaldirTikla(oge));
      }
    });
  });

  /* --- Öğrenci kartı (veli verisi): bölümlere ayrılmış bilgi formu --- */
  if (veli && ui.veli) {
    const kart = el.createEl("div", { cls: "nd-kart" });
    const bas = kart.createEl("div", { cls: "nd-kart-bas" });
    bas.createEl("span", { cls: "nd-kart-ad", text: ui.veli });
    const doluSay = veliDoluSayisi(veli, ui.veli);
    bas.createEl("span", { cls: "nd-not", text: doluSay + "/" + (VELI_ALANLAR.length + 1) + " alan dolu" });
    btn(bas, "✕", "nd-kart-kapat", () => kartAc(ui.veli));
    const kayit = veliKaydi(veli, ui.veli) || veliBosKayit(ui.veli);

    /* Tek satır alan: etiket solda, giriş sağda; blur'da kaydeder (kart yeniden çizilmez) */
    const alanSatiri = (kap, tanim, alan, etiket) => {
      const s = kap.createEl("div", { cls: "nd-kart-satir" + (tanim && tanim.genis ? " nd-kart-genis" : "") });
      s.createEl("span", { cls: "nd-kart-etiket", text: etiket });
      /* Seçmeli alan (tanımda `havuz`): serbest metin yerine liste + "Diğer…" */
      if (tanim && tanim.havuz) {
        const secili = (veliAlanKirisi(kayit, alan) || "").trim();
        const anahtar = adAnahtar(ui.veli) + ":" + alan;
        const acik = ui.havuz === anahtar;
        const dugme = btn(s, "", "nd-kart-secim" + (secili ? "" : " nd-kart-bos"), () => {
          ui.havuz = acik ? null : anahtar;
          return boya(el, ctx, cfg, ui);
        });
        dugme.createEl("span", { cls: "nd-kart-deger", text: secili || "— seç —" });
        dugme.createEl("span", { cls: "nd-kart-ok", text: "▾" });
        if (!acik) return dugme;
        const panel = s.createEl("div", { cls: "nd-havuz" });
        veliHavuzSecenekleri(veli, cfg, alan, secili).forEach(function (sec) {
          const secenek = panel.createEl("div", { cls: "nd-havuz-secenek" + (sec === secili ? " nd-aktif" : ""), text: sec });
          anahtarTikla(secenek, () => veliAlanYazTikla(ui.veli, alan, sec));
        });
        const diger = panel.createEl("div", { cls: "nd-havuz-secenek nd-havuz-diger", text: "Diğer…" });
        anahtarTikla(diger, () => {
          if (window.prompt) {
            const yeni = window.prompt(etiket + " — yeni değer", secili || "");
            if (yeni === null) return;
            return veliAlanYazTikla(ui.veli, alan, String(yeni).trim());
          }
          /* prompt yoksa (onay penceresi gibi): gizli metin girişine düş */
          const kutu = panel.createEl("input", { cls: "nd-input nd-havuz-giris", attr: { type: "text", placeholder: "Yeni değer…", value: secili || "" } });
          kutu.focus();
          kutu.addEventListener("keydown", (ev) => {
            if (ev.key !== "Enter") return;
            ev.preventDefault();
            return veliAlanYazTikla(ui.veli, alan, kutu.value);
          });
        });
        if (secili) {
          const bos = panel.createEl("div", { cls: "nd-havuz-secenek nd-havuz-bosla", text: "— boş —" });
          anahtarTikla(bos, () => veliAlanYazTikla(ui.veli, alan, ""));
        }
        return dugme;
      }
      const g = s.createEl("input", {
        cls: "nd-input nd-kart-giris",
        attr: { type: (tanim && tanim.tip) || "text", placeholder: etiket, value: (veliAlanKirisi(kayit, alan) || "") }
      });
      if (tanim && tanim.tip === "tel" && g.setAttribute) g.setAttribute("inputmode", "tel");
      g.addEventListener("blur", () => {
        if ((veliAlanKirisi(kayit, alan) || "") !== g.value) return veliAlanKaydet(ui.veli, alan, g.value);
      });
      g.addEventListener("keydown", (ev) => { if (ev.key !== "Enter") return; ev.preventDefault(); return g.blur(); });
      return g;
    };

    /* Numara en üstte (Kimlik'ten önce) */
    alanSatiri(kart, { tip: "text" }, "no", "Numara");

    VELI_BOLUMLER.forEach(function (bolum) {
      const alanlar = VELI_ALANLAR.filter(function (a) { return a.bolum === bolum; });
      if (!alanlar.length) return;
      /* Anne/Baba alt başlıkları Aile bölümünde ayrı gösterilir */
      kart.createEl("div", { cls: "nd-kart-bolum", text: bolum });
      alanlar.forEach(function (a) {
        alanSatiri(kart, a, a.ad, a.etiket);
      });
    });

    kart.createEl("div", { cls: "nd-kart-bolum", text: "Özel notlar" });
    veliNotlari(veli).forEach(function (n) {
      const s = kart.createEl("div", { cls: "nd-kart-satir nd-kart-genis" });
      const blok = s.createEl("div", { cls: "nd-kart-not" });
      blok.createEl("span", { cls: "nd-kart-etiket", text: n });
      const t = blok.createEl("textarea", { cls: "nd-input nd-kart-metin", attr: { rows: "2", placeholder: n + " notu…" } });
      t.value = veliAlanKirisi(kayit, "not:" + n) || "";
      t.addEventListener("blur", () => {
        if ((veliAlanKirisi(kayit, "not:" + n) || "") !== t.value) {
          return veliAlanKaydet(ui.veli, "not:" + n, t.value).then(() => {
            t.classList.add("nd-kart-kaydi");
            setTimeout(() => t.classList.remove("nd-kart-kaydi"), 700);
          });
        }
      });
    });
    /* yeni not alanı ekle (ör. "Servis", "Rehberlik görüşmesi") */
    const yeniSatir = kart.createEl("div", { cls: "nd-kart-satir nd-kart-genis" });
    const yeniGiris = yeniSatir.createEl("input", { cls: "nd-input nd-kart-giris", attr: { type: "text", placeholder: "Yeni alan adı (ör. Servis)" } });
    btn(yeniSatir, "+ Alan", "", () => veliNotEkleTikla(ui.veli, yeniGiris));
    kart.createEl("span", { cls: "nd-not", text: "Kutudan çıkınca otomatik kaydeder. Özel not alanları bu sınıfın veri dosyasında tarif edilir; tüm öğrencilerde görünür. Boş alan dosyada tutulmaz." });
  }

  if (ui.ozet) {
    const yazTablo = (basliklar, satirlar) => {
      const t = el.createEl("table", { cls: "nd-ozet" });
      const bas = t.createEl("thead").createEl("tr");
      basliklar.forEach(function (b) { bas.createEl("th", { text: b }); });
      const govde = t.createEl("tbody");
      satirlar.forEach(function (s) {
        const tr = govde.createEl("tr");
        s.forEach(function (hucre, k) { tr.createEl("td", k === 0 ? { cls: "nd-ad-h", text: hucre } : { text: hucre }); });
      });
      return t;
    };

    el.createEl("div", { cls: "nd-alt-baslik", text: "Öğrenci toplamları (tüm günler · tüm öğeler)" });
    yazTablo(
      ["Öğrenci"].concat(cfg.isaretler).concat(["Toplam", "Net"]),
      ozetSatirlari(cfg, veri).map((r) => [r.ad].concat(cfg.isaretler.map(function (s) { return String(r.sayim[s] || 0); })).concat([String(r.toplam), String(r.net)]))
    );

    el.createEl("div", { cls: "nd-alt-baslik", text: "Öğe bazında toplamlar" });
    yazTablo(
      ["Öğe"].concat(cfg.isaretler).concat(["Toplam", "Net"]),
      ogeOzeti(cfg, veri).map((r) => [r.oge].concat(cfg.isaretler.map(function (s) { return String(r.sayim[s] || 0); })).concat([String(r.toplam), String(r.net)]))
    );
    el.createEl("div", { cls: "nd-not", text: "Net = " + (cfg.isaretler[0] || "?") + " − " + (cfg.isaretler[1] || "?") + "." });
  }
}

module.exports = NotDefteriPlugin;
module.exports.__test = {
  parseConfig: parseConfig,
  parseData: parseData,
  writeData: writeData,
  serializeData: serializeData,
  veriJson: veriJson,
  markOf: markOf,
  normMark: normMark,
  markNorm: markNorm,
  gelmediIsaret: gelmediIsaret,
  setMark: setMark,
  ogelerOf: ogelerOf,
  tumOgeler: tumOgeler,
  ogeHavuzu: ogeHavuzu,
  ogeEkle: ogeEkle,
  ogeKaldir: ogeKaldir,
  ogrencilerOf: ogrencilerOf,
  ogrenciHavuzu: ogrenciHavuzu,
  cikarilanlar: cikarilanlar,
  ogrenciEkle: ogrenciEkle,
  ogrenciKaldir: ogrenciKaldir,
  ogrenciGeriAl: ogrenciGeriAl,
  adTemizle: adTemizle,
  adAnahtar: adAnahtar,
  adAyni: adAyni,
  ozetSatirlari: ozetSatirlari,
  ogeOzeti: ogeOzeti,
  tarihleri: tarihleri,
  bosGunMu: bosGunMu,
  bosGunler: bosGunler,
  bosGunTemizle: bosGunTemizle,
  isoTarih: isoTarih,
  isoDate: isoDate,
  isoGunEkle: isoGunEkle,
  gunEtiketiUzun: gunEtiketiUzun,
  isoBugun: isoBugun,
  gunEtiketi: gunEtiketi,
  veliNormalle: veliNormalle,
  veliJson: veliJson,
  veliSerialize: veliSerialize,
  veliKaydi: veliKaydi,
  veliAlanYaz: veliAlanYaz,
  veliAlanKirisi: veliAlanKirisi,
  veliDolu: veliDolu,
  veliDoluSayisi: veliDoluSayisi,
  veliAlanEtiketi: veliAlanEtiketi,
  veliHavuz: veliHavuz,
  veliHavuzSecenekleri: veliHavuzSecenekleri,
  veliNotlari: veliNotlari,
  veliNotEkle: veliNotEkle,
  veliYolu: veliYolu,
  VELI_ALANLAR: VELI_ALANLAR,
  VELI_BOLUMLER: VELI_BOLUMLER,
  VELI_METIN_ALANLAR: VELI_METIN_ALANLAR,
  boya: boya
};

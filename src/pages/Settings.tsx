import React, { useState } from 'react';
import { useStore } from '../store';
import { Save, Code, Database } from 'lucide-react';

const APPSCRIPT_CODE = `
function doGet(e) {
  const action = e.parameter.action;
  
  if (action === 'getUsers') {
    return getSheetData("User_Role");
  } else {
    // Default action: getODPs
    return getSheetData("ODP_Data");
  }
}

function getSheetData(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({ error: "Sheet " + sheetName + " not found" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const result = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }
    result.push(obj);
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// Format Kolom Spreadsheet yang dibutuhkan (Baris Pertama / Header):
// 1. Sheet "ODP_Data":
// ODP_NAME | LATITUDE | LONGITUDE | AVAI | USED | RSV | RSK | IS_TOTAL | STO | TGL_GOLIVE | TAHUN_ODP | BULAN_ODP | OCC_2 | validate_kelurahan | validate_kecamatan | validate_kabupatenkota
// 
// 2. Sheet "User_Role":
// username | password | role | name
`;

export default function Settings() {
  const { appScriptUrl, setAppScriptUrl } = useStore();
  const [urlInput, setUrlInput] = useState(appScriptUrl);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setAppScriptUrl(urlInput);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4 pb-20">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Pengaturan</h2>

      <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Database className="text-blue-600" size={20} />
          <h3 className="font-semibold text-gray-800">Sumber Data (AppScript)</h3>
        </div>
        
        <p className="text-sm text-gray-600 mb-4">
          Masukkan URL Web App dari Google Apps Script Anda untuk mengambil data secara real-time dari Spreadsheet. Jika kosong, aplikasi akan menggunakan data simulasi (mock data).
        </p>

        <div className="space-y-3">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://script.google.com/macros/s/.../exec"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
          />
          <button
            onClick={handleSave}
            className="flex items-center justify-center w-full gap-2 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Save size={16} />
            <span>Simpan URL</span>
          </button>
          {saved && <p className="text-green-600 text-xs text-center mt-2">Berhasil disimpan!</p>}
        </div>
      </div>

      <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 mb-4">
          <Code className="text-gray-700" size={20} />
          <h3 className="font-semibold text-gray-800">Kode Google Apps Script</h3>
        </div>
        
        <p className="text-sm text-gray-600 mb-3">
          Salin kode di bawah ini ke editor Google Apps Script Anda (Ekstensi &gt; Apps Script pada Google Sheets). Pastikan header kolom spreadsheet Anda sesuai dengan format di bawah.
        </p>

        <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
          <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">
            {APPSCRIPT_CODE}
          </pre>
        </div>
      </div>
    </div>
  );
}

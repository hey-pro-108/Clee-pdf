pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

let pdfData = null;
let translatedText = '';
let currentFileName = '';
let currentMode = 'text';
let pdfDoc = null;

const dropzone = document.getElementById('dropzone');
const pdfInput = document.getElementById('pdfInput');
const uploadLabel = document.getElementById('uploadLabel');
const fileInfo = document.getElementById('fileInfo');
const translateBtn = document.getElementById('translateBtn');
const btnLabel = document.getElementById('btnLabel');
const spinner = document.getElementById('spinner');
const resultPanel = document.getElementById('resultPanel');
const textOutput = document.getElementById('textOutput');
const pdfPreview = document.getElementById('pdfPreview');
const pdfPreviewContainer = document.getElementById('pdfPreviewContainer');
const resultTitle = document.getElementById('resultTitle');
const downloadBtn = document.getElementById('downloadResult');
const copyBtn = document.getElementById('copyResult');
const sourceLang = document.getElementById('sourceLang');
const targetLang = document.getElementById('targetLang');
const startPage = document.getElementById('startPage');
const endPage = document.getElementById('endPage');
const modeNote = document.getElementById('modeNote');

document.querySelectorAll('.toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentMode = btn.dataset.mode;
    
    if (currentMode === 'text') {
      modeNote.innerHTML = '<i class="ri-information-line"></i> Text Only: ekstrak dan terjemahkan teks saja';
    } else {
      modeNote.innerHTML = '<i class="ri-image-line"></i> PDF Text: hasil terjemahan dalam format PDF teks (tanpa gambar asli)';
    }
    
    if (resultPanel.style.display === 'block') {
      updateResultDisplay();
    }
  });
});

function updateResultDisplay() {
  if (currentMode === 'text') {
    textOutput.style.display = 'block';
    pdfPreview.style.display = 'none';
    downloadBtn.innerHTML = 'DOWNLOAD TXT';
    resultTitle.textContent = `${currentFileName || 'output'}_translated.txt`;
  } else {
    textOutput.style.display = 'block';
    pdfPreview.style.display = 'none';
    downloadBtn.innerHTML = 'DOWNLOAD PDF';
    resultTitle.textContent = `${currentFileName || 'output'}_translated.pdf`;
  }
}

dropzone.addEventListener('click', () => pdfInput.click());

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.style.background = '#ffeb3b';
});

dropzone.addEventListener('dragleave', () => {
  dropzone.style.background = '';
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.style.background = '';
  const files = e.dataTransfer.files;
  if (files.length && files[0].type === 'application/pdf') handleFile(files[0]);
  else alert('Please upload PDF file');
});

pdfInput.addEventListener('change', (e) => {
  if (e.target.files.length) handleFile(e.target.files[0]);
});

function handleFile(file) {
  if (file.size > 50 * 1024 * 1024) {
    alert('File exceeds 50MB limit');
    return;
  }
  
  currentFileName = file.name.replace('.pdf', '');
  let displayName = file.name;
  if (displayName.length > 40) displayName = displayName.substring(0, 35) + '...';
  uploadLabel.textContent = displayName;
  fileInfo.textContent = `✓ ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
  fileInfo.style.display = 'block';
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    pdfData = e.target.result;
    const loadingTask = pdfjsLib.getDocument({ data: pdfData });
    pdfDoc = await loadingTask.promise;
  };
  reader.readAsArrayBuffer(file);
}

async function extractTextFromPDF(data, start, end) {
  const task = pdfjsLib.getDocument({ data });
  const pdf = await task.promise;
  const total = pdf.numPages;
  const last = Math.min(end, total);
  let full = '';
  
  for (let i = start; i <= last; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    full += `\n\n╔═══ PAGE ${i} ═══╗\n${pageText}\n╚══════════════════╝\n`;
  }
  return full;
}

async function translateChunk(text, source, target) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  const data = await res.json();
  let result = '';
  for (let i = 0; i < data[0].length; i++) result += data[0][i][0];
  return result;
}

async function translateLarge(text, source, target, onProgress) {
  const chunks = [];
  const chunkSize = 4000;
  for (let i = 0; i < text.length; i += chunkSize) chunks.push(text.slice(i, i + chunkSize));
  
  const translated = [];
  for (let i = 0; i < chunks.length; i++) {
    if (onProgress) onProgress(i + 1, chunks.length);
    const res = await translateChunk(chunks[i], source, target);
    translated.push(res);
  }
  return translated.join('');
}

function createPDFFromText(text, fileName) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const lines = doc.splitTextToSize(text, 170);
  let y = 20;
  
  doc.setFont('helvetica');
  doc.setFontSize(11);
  
  for (let i = 0; i < lines.length; i++) {
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
    doc.text(lines[i], 20, y);
    y += 7;
  }
  
  doc.save(`${fileName}_translated.pdf`);
  return doc;
}

translateBtn.addEventListener('click', async () => {
  if (!pdfData) {
    alert('Please select a PDF file first');
    return;
  }
  
  translateBtn.disabled = true;
  btnLabel.textContent = 'PROCESSING';
  spinner.style.display = 'block';
  resultPanel.style.display = 'none';
  
  const source = sourceLang.value;
  const target = targetLang.value;
  const start = parseInt(startPage.value) || 1;
  const end = parseInt(endPage.value) || 9999;
  
  try {
    btnLabel.textContent = 'EXTRACTING';
    const extracted = await extractTextFromPDF(pdfData, start, end);
    
    if (!extracted.trim()) throw new Error('No text found in PDF');
    
    btnLabel.textContent = 'TRANSLATING';
    let final = '';
    
    if (source === 'auto') {
      final = await translateLarge(extracted, 'auto', target, (cur, tot) => {
        btnLabel.textContent = `TRANSLATING ${cur}/${tot}`;
      });
    } else {
      final = await translateLarge(extracted, source, target, (cur, tot) => {
        btnLabel.textContent = `TRANSLATING ${cur}/${tot}`;
      });
    }
    
    translatedText = final;
    
    textOutput.innerHTML = final.replace(/\n/g, '<br>');
    textOutput.style.display = 'block';
    pdfPreview.style.display = 'none';
    
    if (currentMode === 'text') {
      downloadBtn.innerHTML = 'DOWNLOAD TXT';
      resultTitle.textContent = `${currentFileName || 'output'}_translated.txt`;
    } else {
      downloadBtn.innerHTML = 'DOWNLOAD PDF';
      resultTitle.textContent = `${currentFileName || 'output'}_translated.pdf`;
    }
    
    resultPanel.style.display = 'block';
    resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    translateBtn.disabled = false;
    btnLabel.textContent = 'TRANSLATE NOW';
    spinner.style.display = 'none';
  }
});

downloadBtn.addEventListener('click', () => {
  if (!translatedText) return;
  
  const fileName = currentFileName || 'translated';
  
  if (currentMode === 'text') {
    const blob = new Blob([translatedText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}_translated.txt`;
    a.click();
    URL.revokeObjectURL(url);
  } else {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const lines = doc.splitTextToSize(translatedText, 170);
    let y = 20;
    
    doc.setFont('helvetica');
    doc.setFontSize(11);
    
    for (let i = 0; i < lines.length; i++) {
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
      doc.text(lines[i], 20, y);
      y += 7;
    }
    
    doc.save(`${fileName}_translated.pdf`);
  }
});

copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(translatedText);
    const original = copyBtn.innerHTML;
    copyBtn.innerHTML = '✓ COPIED!';
    setTimeout(() => { copyBtn.innerHTML = original; }, 2000);
  } catch (err) {
    alert('Failed to copy');
  }
});

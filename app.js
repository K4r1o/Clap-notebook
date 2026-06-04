// LocalStorage Key Constants
const STORAGE_KEYS = {
    NOTEBOOKS: 'warm_notebooks',
    ENTRIES: 'warm_notebook_entries',
    API_KEY: 'warm_notebook_api_key'
};

// Global App State
let notebooks = [];
let entries = [];
let currentNotebookId = null;

// DOM Elements
const apiKeyInput = document.getElementById('api-key-input');
const toggleApiKeyBtn = document.getElementById('toggle-api-key-btn');
const saveApiKeyBtn = document.getElementById('save-api-key-btn');
const apiKeyStatus = document.getElementById('api-key-status');
const createNotebookBtn = document.getElementById('create-notebook-btn');
const notebooksList = document.getElementById('notebooks-list');
const emptyState = document.getElementById('empty-state');
const workspace = document.getElementById('workspace');
const currentNotebookTitle = document.getElementById('current-notebook-title');
const currentNotebookTime = document.getElementById('current-notebook-time');
const currentNotebookStatus = document.getElementById('current-notebook-status');
const finalizeBtn = document.getElementById('finalize-btn');
const entriesContainer = document.getElementById('entries-container');
const noteTextarea = document.getElementById('note-textarea');
const sendNoteBtn = document.getElementById('send-note-btn');
const reportPanel = document.getElementById('report-panel');
const reportContent = document.getElementById('report-content');
const copyReportBtn = document.getElementById('copy-report-btn');
const downloadReportBtn = document.getElementById('download-report-btn');
const loadingOverlay = document.getElementById('loading-overlay');

// Settings Modal Elements
const openSettingsBtn = document.getElementById('open-settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const settingsModal = document.getElementById('settings-modal');
const apiWarningDot = document.getElementById('api-warning-dot');

// --- Helper Functions ---

// Date Formatter
function formatDateTime(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${yyyy}/${mm}/${dd} ${hh}:${min}:${ss}`;
}

// Generate Unique ID
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// Storage Helpers
function loadFromStorage() {
    notebooks = JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTEBOOKS)) || [];
    entries = JSON.parse(localStorage.getItem(STORAGE_KEYS.ENTRIES)) || [];
    const savedKey = localStorage.getItem(STORAGE_KEYS.API_KEY) || '';
    if (savedKey) {
        apiKeyInput.value = savedKey;
        updateApiKeyStatus(true, '金鑰已載入');
        if (apiWarningDot) apiWarningDot.style.display = 'none';
    } else {
        if (apiWarningDot) apiWarningDot.style.display = 'block';
    }
}

function saveNotebooksToStorage() {
    localStorage.setItem(STORAGE_KEYS.NOTEBOOKS, JSON.stringify(notebooks));
}

function saveEntriesToStorage() {
    localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(entries));
}

function updateApiKeyStatus(isSuccess, message) {
    apiKeyStatus.className = `api-key-status ${isSuccess ? 'success' : 'error'}`;
    apiKeyStatus.textContent = message;
}

// --- App Operations ---

// Render Notebooks list in Sidebar
function renderNotebooksList() {
    notebooksList.innerHTML = '';
    
    // Sort notebooks: latest created first
    const sortedNotebooks = [...notebooks].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    sortedNotebooks.forEach(notebook => {
        const li = document.createElement('li');
        li.dataset.id = notebook.id;
        if (notebook.id === currentNotebookId) {
            li.classList.add('active');
        }
        
        const isFinalized = notebook.status === 'finalized';
        const dateStr = notebook.created_at.split(' ')[0]; // Just show the date part in sidebar
        
        li.innerHTML = `
            <div class="notebook-item-content">
                <span class="notebook-item-title">${escapeHtml(notebook.title)}</span>
                <div class="notebook-item-meta">
                    <span class="notebook-item-date">${dateStr}</span>
                    <span class="badge-status ${isFinalized ? 'status-finalized' : 'status-active'}">
                        ${isFinalized ? '已整理' : '筆記中'}
                    </span>
                </div>
            </div>
            <button class="btn-delete-notebook" title="刪除筆記本">
                <i class="fa-regular fa-trash-can"></i>
            </button>
        `;
        
        // Select Notebook click
        li.addEventListener('click', (e) => {
            if (e.target.closest('.btn-delete-notebook')) return; // Ignore if delete is clicked
            selectNotebook(notebook.id);
        });
        
        // Delete Notebook click
        const deleteBtn = li.querySelector('.btn-delete-notebook');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`您確定要刪除「${notebook.title}」嗎？這會清除該筆記本內的所有內容且無法還原。`)) {
                deleteNotebook(notebook.id);
            }
        });
        
        notebooksList.appendChild(li);
    });
}

// HTML Escaping to prevent XSS
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Select a notebook and show in workspace
function selectNotebook(id) {
    currentNotebookId = id;
    const notebook = notebooks.find(n => n.id === id);
    if (!notebook) {
        currentNotebookId = null;
        updateWorkspaceView();
        return;
    }
    
    // Highlight in list
    document.querySelectorAll('.notebooks-list li').forEach(li => {
        li.classList.remove('active');
        if (li.dataset.id === id) li.classList.add('active');
    });
    
    updateWorkspaceView();
}

// Update workspace view depending on active notebook state
function updateWorkspaceView() {
    if (!currentNotebookId) {
        workspace.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
    }
    
    emptyState.style.display = 'none';
    workspace.style.display = 'flex';
    
    const notebook = notebooks.find(n => n.id === currentNotebookId);
    
    // Header Info
    currentNotebookTitle.textContent = notebook.title;
    currentNotebookTime.textContent = notebook.created_at;
    
    const isFinalized = notebook.status === 'finalized';
    
    // Update status badge
    currentNotebookStatus.textContent = isFinalized ? '已整理' : '筆記中';
    currentNotebookStatus.className = `status-badge ${isFinalized ? 'status-finalized' : 'status-active'}`;
    
    // Finalize Button status
    if (isFinalized) {
        finalizeBtn.innerHTML = '<i class="fa-solid fa-check-double"></i> 匯報已生成';
        finalizeBtn.disabled = true;
        finalizeBtn.style.opacity = '0.7';
        finalizeBtn.style.cursor = 'default';
        document.querySelector('.note-input-container').style.display = 'none';
    } else {
        finalizeBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> 結束筆記並生成匯報';
        finalizeBtn.disabled = false;
        finalizeBtn.style.opacity = '1';
        finalizeBtn.style.cursor = 'pointer';
        document.querySelector('.note-input-container').style.display = 'flex';
    }
    
    // Render Entries
    renderEntries();
    
    // Show Report Panel if finalized
    if (isFinalized && notebook.report) {
        reportPanel.style.display = 'flex';
        reportContent.innerHTML = marked.parse(notebook.report);
    } else {
        reportPanel.style.display = 'none';
        reportContent.innerHTML = '';
    }
    
    // Scroll paper-content container to bottom
    const paperContent = document.querySelector('.paper-content');
    setTimeout(() => {
        paperContent.scrollTop = paperContent.scrollHeight;
    }, 50);
}

// Render entries for current notebook
function renderEntries() {
    entriesContainer.innerHTML = '';
    
    const notebookEntries = entries.filter(e => e.notebook_id === currentNotebookId);
    
    if (notebookEntries.length === 0) {
        entriesContainer.innerHTML = `
            <div class="empty-entries-tip" style="font-family: var(--font-handwritten); text-align: center; color: var(--ink-muted); margin-top: 50px; font-size: 1.2rem; transform: rotate(-1deg);">
                這頁紙目前是空白的。<br>在下方寫下你第一筆天馬行空的靈感吧！✏️
            </div>
        `;
        return;
    }
    
    notebookEntries.forEach(entry => {
        const card = document.createElement('div');
        card.className = 'entry-card';
        card.dataset.id = entry.id;
        
        const notebook = notebooks.find(n => n.id === currentNotebookId);
        const isFinalized = notebook ? notebook.status === 'finalized' : false;
        
        // Show delete button only if notebook is active
        const deleteButtonHtml = !isFinalized 
            ? `<button class="btn-delete-entry" title="刪除隨筆"><i class="fa-regular fa-trash-can"></i></button>`
            : '';
            
        card.innerHTML = `
            <div class="entry-header">
                <span class="entry-time">${entry.created_at}</span>
                ${deleteButtonHtml}
            </div>
            <div class="entry-body">${escapeHtml(entry.content)}</div>
        `;
        
        if (!isFinalized) {
            const deleteBtn = card.querySelector('.btn-delete-entry');
            deleteBtn.addEventListener('click', () => {
                deleteEntry(entry.id);
            });
        }
        
        entriesContainer.appendChild(card);
    });
}

// Create new notebook
function createNotebook() {
    const id = generateId();
    const count = notebooks.length + 1;
    const newNotebook = {
        id: id,
        title: `隨筆筆記本 #${count}`,
        created_at: formatDateTime(new Date()),
        status: 'active',
        report: null
    };
    
    notebooks.push(newNotebook);
    saveNotebooksToStorage();
    renderNotebooksList();
    selectNotebook(id);
    
    // Focus title for easy rename
    setTimeout(() => {
        currentNotebookTitle.focus();
        document.execCommand('selectAll', false, null);
    }, 100);
}

// Delete notebook
function deleteNotebook(id) {
    notebooks = notebooks.filter(n => n.id !== id);
    entries = entries.filter(e => e.notebook_id !== id);
    
    saveNotebooksToStorage();
    saveEntriesToStorage();
    renderNotebooksList();
    
    if (currentNotebookId === id) {
        currentNotebookId = null;
        updateWorkspaceView();
    }
}

// Add new entry
function addEntry() {
    const content = noteTextarea.value.trim();
    if (!content) return;
    
    const notebook = notebooks.find(n => n.id === currentNotebookId);
    if (!notebook || notebook.status === 'finalized') return;
    
    const newEntry = {
        id: generateId(),
        notebook_id: currentNotebookId,
        content: content,
        created_at: formatDateTime(new Date())
    };
    
    entries.push(newEntry);
    saveEntriesToStorage();
    
    noteTextarea.value = '';
    renderEntries();
    
    // Auto scroll to bottom
    const paperContent = document.querySelector('.paper-content');
    paperContent.scrollTop = paperContent.scrollHeight;
    
    noteTextarea.focus();
}

// Delete entry
function deleteEntry(id) {
    entries = entries.filter(e => e.id !== id);
    saveEntriesToStorage();
    renderEntries();
}

// Update notebook title
function saveNotebookTitle() {
    if (!currentNotebookId) return;
    
    const newTitle = currentNotebookTitle.textContent.trim();
    const notebook = notebooks.find(n => n.id === currentNotebookId);
    
    if (notebook && newTitle && notebook.title !== newTitle) {
        notebook.title = newTitle;
        saveNotebooksToStorage();
        renderNotebooksList();
    }
}

// Send request to Gemini API to finalize and generate report
async function generateReport() {
    const apiKey = localStorage.getItem(STORAGE_KEYS.API_KEY);
    if (!apiKey) {
        alert('未偵測到 API 金鑰，請先在「系統設定」中輸入並儲存您的 Gemini API 金鑰！');
        // Open settings modal automatically
        settingsModal.style.display = 'flex';
        apiKeyInput.focus();
        return;
    }
    
    const notebook = notebooks.find(n => n.id === currentNotebookId);
    if (!notebook || notebook.status === 'finalized') return;
    
    const notebookEntries = entries.filter(e => e.notebook_id === currentNotebookId);
    if (notebookEntries.length === 0) {
        alert('筆記本中沒有內容，請先輸入一些筆記隨筆再進行整理！');
        noteTextarea.focus();
        return;
    }
    
    if (!confirm('結束筆記後，將無法再新增或刪除隨筆。是否確認要結束筆記並生成工作匯報？')) {
        return;
    }
    
    // Show Loading
    loadingOverlay.style.display = 'flex';
    
    try {
        // Build Prompt text from entries
        const entriesText = notebookEntries
            .map(e => `[記錄時間：${e.created_at}]\n${e.content}`)
            .join('\n\n---\n\n');
            
        const systemPrompt = `你是一位專業且貼心的隨身助理。以下是使用者在一段時間內隨手記錄下來的零星筆記（每條筆記都有準確的記錄時間與內容）。
請你幫忙將這些筆記內容進行邏輯整合，理清條理，去除零碎無用的字句或語氣詞，撰寫成一份排版精緻且高度專業的工作匯報。

請嚴格遵循以下匯報格式要求：
1. 請以「Markdown」格式進行輸出。
2. 匯報結構必須包含：
   - # [筆記本標題] - 助理整合工作匯報
   - ## 📋 工作概述
     (簡短整合總結這段時間內工作的核心重點與進度節奏)
   - ## 🔍 邏輯分類重點
     (將零碎記事依照工作類別、項目或任務性質進行模組化整合，使用列點方式寫出具體進度、面臨的問題與成果。如果是雜事、生活與工作交織，請理清主次)
   - ## 🚀 後續追蹤與待辦事項
     (從筆記中提煉出下一步明確的 Action Items 待辦清單，並視情況給予建議的時間規劃)
   - ## 💡 助理溫馨提醒
     (以溫暖、支持的助理語氣，簡短分析使用者的工作步調、提醒健康，或提供正向的工作反饋與打氣)
3. 報告內文請維持簡潔、專業與條理。如果有一些前後矛盾的記事，請以邏輯上最合理的方案呈現，或在提醒中貼心提出。
4. 使用專業的商務語氣，但保持親切。`;

        const userPrompt = `筆記本名稱：${notebook.title}
建立時間：${notebook.created_at}

【使用者隨筆列表】：
${entriesText}`;

        // Call Google Gemini API
        // Using gemini-1.5-flash as default stable and fast model
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `${systemPrompt}\n\n${userPrompt}`
                    }]
                }]
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error?.message || '呼叫 API 時發生未知錯誤');
        }
        
        const reportMarkdown = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!reportMarkdown) {
            throw new Error('API 回傳的格式不正確或內容為空');
        }
        
        // Save report & update status
        notebook.status = 'finalized';
        notebook.report = reportMarkdown;
        
        saveNotebooksToStorage();
        renderNotebooksList();
        updateWorkspaceView();
        
    } catch (error) {
        console.error('Gemini API Error:', error);
        alert(`工作匯報生成失敗：\n${error.message}\n\n請檢查您的 API Key 是否正確且具備 Gemini 1.5 Flash 權限，或檢查網路連線。`);
    } finally {
        // Hide Loading
        loadingOverlay.style.display = 'none';
    }
}

// Copy Markdown report to Clipboard
function copyReport() {
    const notebook = notebooks.find(n => n.id === currentNotebookId);
    if (!notebook || !notebook.report) return;
    
    navigator.clipboard.writeText(notebook.report).then(() => {
        const originalText = copyReportBtn.innerHTML;
        copyReportBtn.innerHTML = '<i class="fa-solid fa-check"></i> 已複製';
        copyReportBtn.style.color = '#4a8043';
        
        setTimeout(() => {
            copyReportBtn.innerHTML = originalText;
            copyReportBtn.style.color = '';
        }, 2000);
    }).catch(err => {
        alert('複製失敗，請手動選取文字進行複製。');
    });
}

// Download Markdown report as text file
function downloadReport() {
    const notebook = notebooks.find(n => n.id === currentNotebookId);
    if (!notebook || !notebook.report) return;
    
    const filename = `${notebook.title.replace(/[\/\\:\*\?"<>\|]/g, '_')}_工作匯報.txt`;
    const blob = new Blob([notebook.report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// --- Event Listeners Registration ---

// API Key Logic
saveApiKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
        localStorage.removeItem(STORAGE_KEYS.API_KEY);
        updateApiKeyStatus(false, '金鑰已清除');
        apiWarningDot.style.display = 'block';
    } else {
        localStorage.setItem(STORAGE_KEYS.API_KEY, key);
        updateApiKeyStatus(true, '金鑰儲存成功！');
        apiWarningDot.style.display = 'none';
        setTimeout(() => {
            apiKeyStatus.textContent = '金鑰已載入';
            // Auto close modal after successful save
            setTimeout(() => {
                settingsModal.style.display = 'none';
            }, 500);
        }, 1000);
    }
});

toggleApiKeyBtn.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    toggleApiKeyBtn.innerHTML = isPassword ? '<i class="fa-solid fa-eye"></i>' : '<i class="fa-solid fa-eye-slash"></i>';
});

// Notebook Management
createNotebookBtn.addEventListener('click', createNotebook);

currentNotebookTitle.addEventListener('blur', saveNotebookTitle);
currentNotebookTitle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        currentNotebookTitle.blur();
    }
});

// Entry Input Events
sendNoteBtn.addEventListener('click', addEntry);

noteTextarea.addEventListener('keydown', (e) => {
    // Send on Enter, Line break on Shift+Enter
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        addEntry();
    }
});

// Finalize Action
finalizeBtn.addEventListener('click', generateReport);

// Report Actions
copyReportBtn.addEventListener('click', copyReport);
downloadReportBtn.addEventListener('click', downloadReport);

// Settings Modal Toggle Logic
openSettingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'flex';
    apiKeyStatus.textContent = localStorage.getItem(STORAGE_KEYS.API_KEY) ? '金鑰已載入' : '';
    apiKeyInput.focus();
});

closeSettingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'none';
});

// Close modal when clicking outside the content
settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        settingsModal.style.display = 'none';
    }
});

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    loadFromStorage();
    renderNotebooksList();
    updateWorkspaceView();
});

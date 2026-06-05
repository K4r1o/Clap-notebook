const GOOGLE_CLIENT_ID = '814649418958-tdgd3kklgtaklg3av9n3m6r974i7i6b1.apps.googleusercontent.com'; // 請在這裡填入你申請的 Google Client ID

// LocalStorage Key Constants
const STORAGE_KEYS = {
    NOTEBOOKS: 'will_ai_notebooks',
    ENTRIES: 'will_ai_notebook_entries',
    API_KEY: 'will_ai_api_key',
    MODEL: 'will_ai_model',
    TRASH_NOTEBOOKS: 'will_ai_trash_notebooks',
    TRASH_ENTRIES: 'will_ai_trash_entries',
    THEME: 'will_ai_theme',
    FOLDERS: 'will_ai_folders',
    SUPABASE_URL: 'will_ai_supabase_url',
    SUPABASE_KEY: 'will_ai_supabase_key',
    SYNC_PROVIDER: 'will_ai_sync_provider',
    GOOGLE_TOKEN: 'will_ai_google_token',
    SUBJECTS: 'will_ai_subjects'
};

// Migration from Warm Notebook legacy storage keys to Will.ai keys
function migrateLegacyStorage() {
    const legacyKeys = {
        NOTEBOOKS: 'warm_notebooks',
        ENTRIES: 'warm_notebook_entries',
        API_KEY: 'warm_notebook_api_key',
        MODEL: 'warm_notebook_model',
        TRASH_NOTEBOOKS: 'warm_notebook_trash_notebooks',
        TRASH_ENTRIES: 'warm_notebook_trash_entries',
        THEME: 'warm_notebook_theme',
        FOLDERS: 'warm_notebook_folders',
        SUPABASE_URL: 'warm_notebook_supabase_url',
        SUPABASE_KEY: 'warm_notebook_supabase_key',
        SYNC_PROVIDER: 'warm_notebook_sync_provider',
        GOOGLE_TOKEN: 'warm_notebook_google_token'
    };

    const newKeys = {
        NOTEBOOKS: 'will_ai_notebooks',
        ENTRIES: 'will_ai_notebook_entries',
        API_KEY: 'will_ai_api_key',
        MODEL: 'will_ai_model',
        TRASH_NOTEBOOKS: 'will_ai_trash_notebooks',
        TRASH_ENTRIES: 'will_ai_trash_entries',
        THEME: 'will_ai_theme',
        FOLDERS: 'will_ai_folders',
        SUPABASE_URL: 'will_ai_supabase_url',
        SUPABASE_KEY: 'will_ai_supabase_key',
        SYNC_PROVIDER: 'will_ai_sync_provider',
        GOOGLE_TOKEN: 'will_ai_google_token'
    };

    Object.keys(legacyKeys).forEach(key => {
        const legacyVal = localStorage.getItem(legacyKeys[key]);
        const newVal = localStorage.getItem(newKeys[key]);
        if (legacyVal !== null && newVal === null) {
            localStorage.setItem(newKeys[key], legacyVal);
            // 遷移後刪除舊 key，避免殘留
            localStorage.removeItem(legacyKeys[key]);
        }
    });
}

// Global App State
let notebooks = [];
let entries = [];
let trashNotebooks = [];
let trashEntries = [];
let folders = [];
let subjects = [];
let currentSubjectId = null;
let currentFolderId = null;
let activeTrashTab = 'entries'; // 'entries' or 'notebooks'
let currentNotebookId = null;
let isBulkSelectMode = false;
let selectedNotebookIds = new Set();
let supabaseClient = null;

// Sync State
const syncProvider = 'google';
let googleTokenClient = null;
let googleAccessToken = localStorage.getItem(STORAGE_KEYS.GOOGLE_TOKEN) || null;
let gapiLoadStarted = false;
let gapiInited = false;
let gisInited = false;
let isSyncingToGoogle = false;

// DOM Elements
const apiKeyInput = document.getElementById('api-key-input');
const toggleApiKeyBtn = document.getElementById('toggle-api-key-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const settingsStatus = document.getElementById('settings-status');
const syncStatusBadge = document.getElementById('sync-status-badge');
const apiWarningDot = document.getElementById('api-warning-dot');
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
const modelSelect = document.getElementById('model-select');
const themeSelect = document.getElementById('theme-select');

// Trash Can Elements
const openTrashBtn = document.getElementById('open-trash-btn');
const closeTrashBtn = document.getElementById('close-trash-btn');
const trashModal = document.getElementById('trash-modal');
const trashBadge = document.getElementById('trash-badge');
const trashListContainer = document.getElementById('trash-list-container');
const tabTrashEntries = document.getElementById('tab-trash-entries');
const tabTrashNotebooks = document.getElementById('tab-trash-notebooks');
const emptyTrashBtn = document.getElementById('empty-trash-btn');

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

function saveFoldersToStorage() {
    localStorage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(folders));
    if (syncProvider === 'supabase' && supabaseClient) {
        (async () => {
            try {
                const activeIds = folders.map(f => f.id);
                if (activeIds.length > 0) {
                    await supabaseClient.from('folders').delete().not('id', 'in', activeIds);
                    await supabaseClient.from('folders').upsert(folders);
                } else {
                    await supabaseClient.from('folders').delete().neq('id', 'placeholder');
                }
            } catch (err) {
                console.error("Folder sync failed:", err);
            }
        })();
    } else if (syncProvider === 'google') {
        syncToGoogleDrive();
    }
}

function saveSubjectsToStorage() {
    localStorage.setItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(subjects));
    if (syncProvider === 'google') {
        syncToGoogleDrive();
    }
}

// Migrate legacy data structures to support subjects
function migrateSubjects() {
    const storedSubjects = localStorage.getItem(STORAGE_KEYS.SUBJECTS);
    if (storedSubjects) {
        subjects = JSON.parse(storedSubjects);
    } else {
        subjects = [];
    }
    
    if (subjects.length === 0) {
        const defaultSubject = {
            id: 'default-subject',
            name: '一般筆記',
            icon: '📝',
            created_at: formatDateTime(new Date())
        };
        subjects.push(defaultSubject);
        localStorage.setItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(subjects));
    }
    
    let folderUpdated = false;
    folders.forEach(f => {
        if (!f.subjectId) {
            f.subjectId = 'default-subject';
            folderUpdated = true;
        }
    });
    if (folderUpdated) {
        localStorage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(folders));
    }
    
    let notebookUpdated = false;
    notebooks.forEach(n => {
        if (!n.subjectId) {
            n.subjectId = 'default-subject';
            notebookUpdated = true;
        }
    });
    if (notebookUpdated) {
        localStorage.setItem(STORAGE_KEYS.NOTEBOOKS, JSON.stringify(notebooks));
    }
    
    if (!currentSubjectId || !subjects.find(s => s.id === currentSubjectId)) {
        currentSubjectId = subjects[0].id;
    }
}

// Supabase Client initialization
function initSupabase() {
    if (syncProvider !== 'supabase') return;
    const url = localStorage.getItem(STORAGE_KEYS.SUPABASE_URL);
    const key = localStorage.getItem(STORAGE_KEYS.SUPABASE_KEY);
    if (url && key && typeof supabase !== 'undefined') {
        try {
            supabaseClient = supabase.createClient(url, key);
            console.log("Supabase Sync Initialized Successfully");
            if (syncStatusBadge) {
                syncStatusBadge.className = 'sync-badge cloud';
                syncStatusBadge.innerHTML = '<i class="fa-solid fa-cloud"></i> Supabase 已同步';
            }
        } catch (e) {
            console.error("Failed to initialize Supabase:", e);
            supabaseClient = null;
            fallbackToLocalMode();
        }
    } else {
        supabaseClient = null;
        fallbackToLocalMode();
    }
}

function fallbackToLocalMode() {
    if (syncStatusBadge) {
        syncStatusBadge.className = 'sync-badge local';
        syncStatusBadge.innerHTML = '<i class="fa-solid fa-laptop"></i> 僅限本機';
    }
}

function loadSettingsFromStorage() {
    const savedGeminiKey = localStorage.getItem(STORAGE_KEYS.API_KEY) || '';
    const savedSupabaseUrl = localStorage.getItem(STORAGE_KEYS.SUPABASE_URL) || '';
    const savedSupabaseKey = localStorage.getItem(STORAGE_KEYS.SUPABASE_KEY) || '';
    
    if (apiKeyInput) apiKeyInput.value = savedGeminiKey;
    if (supabaseUrlInput) supabaseUrlInput.value = savedSupabaseUrl;
    if (supabaseKeyInput) supabaseKeyInput.value = savedSupabaseKey;
    
    if (savedGeminiKey) {
        if (apiWarningDot) apiWarningDot.style.display = 'none';
    } else {
        if (apiWarningDot) apiWarningDot.style.display = 'block';
    }
    
    // Update Sync UI
    const syncProviderBtns = document.querySelectorAll('.sync-provider-btn');
    syncProviderBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.provider === syncProvider);
    });
    
    const supabaseSettingsPanel = document.getElementById('supabase-settings-panel');
    const googleSettingsPanel = document.getElementById('google-settings-panel');
    if (supabaseSettingsPanel) supabaseSettingsPanel.style.display = syncProvider === 'supabase' ? 'block' : 'none';
    if (googleSettingsPanel) googleSettingsPanel.style.display = syncProvider === 'google' ? 'block' : 'none';
}

// Storage Helpers
async function loadFromStorage() {
    migrateLegacyStorage();
    notebooks = JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTEBOOKS)) || [];
    // Ensure all notebooks have folderId and isProtected attributes
    notebooks.forEach(nb => {
        if (nb.folderId === undefined) nb.folderId = null;
        if (nb.isProtected === undefined) nb.isProtected = false;
    });
    entries = JSON.parse(localStorage.getItem(STORAGE_KEYS.ENTRIES)) || [];
    trashNotebooks = JSON.parse(localStorage.getItem(STORAGE_KEYS.TRASH_NOTEBOOKS)) || [];
    trashEntries = JSON.parse(localStorage.getItem(STORAGE_KEYS.TRASH_ENTRIES)) || [];
    folders = JSON.parse(localStorage.getItem(STORAGE_KEYS.FOLDERS)) || [];
    migrateSubjects();
    renderSubjectsList();
    
    loadSettingsFromStorage();
    
    // Load selected model from storage
    const savedModel = localStorage.getItem(STORAGE_KEYS.MODEL) || 'gemini-2.5-flash';
    if (modelSelect) {
        modelSelect.value = savedModel;
        updateModelDetails();
    }
    
    // Load selected theme from storage
    let savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 'classic';
    if (savedTheme === 'kraft' || savedTheme === 'grid') {
        savedTheme = 'classic';
        localStorage.setItem(STORAGE_KEYS.THEME, 'classic');
    }
    if (themeSelect) {
        themeSelect.value = savedTheme;
    }
    document.body.setAttribute('data-theme', savedTheme);
    
    updateTrashBadge();

    // Supabase Cloud Sync Load
    if (syncProvider === 'supabase' && supabaseClient) {
        try {
            console.log("Fetching folders, notebooks, and entries from Supabase...");
            const { data: dbFolders, error: fError } = await supabaseClient.from('folders').select('*');
            const { data: dbNotebooks, error: nError } = await supabaseClient.from('notebooks').select('*');
            const { data: dbEntries, error: eError } = await supabaseClient.from('entries').select('*');
            
            if (fError) throw fError;
            if (nError) throw nError;
            if (eError) throw eError;
            
            if (dbFolders) folders = dbFolders;
            if (dbNotebooks) {
                notebooks = dbNotebooks;
                notebooks.forEach(nb => {
                    if (nb.folderId === undefined) nb.folderId = null;
                    if (nb.isProtected === undefined) nb.isProtected = false;
                });
            }
            if (dbEntries) entries = dbEntries;
            
            // Cache locally
            localStorage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(folders));
            localStorage.setItem(STORAGE_KEYS.NOTEBOOKS, JSON.stringify(notebooks));
            localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(entries));
            console.log("Cloud sync load successful.");
        } catch (err) {
            console.warn("Cloud load failed, using local cache fallback:", err);
        }
    } else if (syncProvider === 'none') {
        fallbackToLocalMode();
    }
    // Note: Google Drive Load is handled asynchronously by gapi callback to ensure valid token.
}

function saveNotebooksToStorage() {
    localStorage.setItem(STORAGE_KEYS.NOTEBOOKS, JSON.stringify(notebooks));
    if (syncProvider === 'supabase' && supabaseClient) {
        (async () => {
            try {
                const activeIds = notebooks.map(n => n.id);
                if (activeIds.length > 0) {
                    await supabaseClient.from('notebooks').delete().not('id', 'in', activeIds);
                    await supabaseClient.from('notebooks').upsert(notebooks);
                } else {
                    await supabaseClient.from('notebooks').delete().neq('id', 'placeholder');
                }
            } catch (err) {
                console.error("Notebook sync failed:", err);
            }
        })();
    } else if (syncProvider === 'google') {
        syncToGoogleDrive();
    }
}

function saveEntriesToStorage() {
    localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(entries));
    if (syncProvider === 'supabase' && supabaseClient) {
        (async () => {
            try {
                const activeIds = entries.map(e => e.id);
                if (activeIds.length > 0) {
                    await supabaseClient.from('entries').delete().not('id', 'in', activeIds);
                    await supabaseClient.from('entries').upsert(entries);
                } else {
                    await supabaseClient.from('entries').delete().neq('id', 'placeholder');
                }
            } catch (err) {
                console.error("Entries sync failed:", err);
            }
        })();
    } else if (syncProvider === 'google') {
        syncToGoogleDrive();
    }
}

function saveTrashToStorage() {
    localStorage.setItem(STORAGE_KEYS.TRASH_NOTEBOOKS, JSON.stringify(trashNotebooks));
    localStorage.setItem(STORAGE_KEYS.TRASH_ENTRIES, JSON.stringify(trashEntries));
    if (syncProvider === 'google') {
        syncToGoogleDrive();
    }
}

function updateTrashBadge() {
    if (!trashBadge) return;
    const totalTrashCount = trashNotebooks.length + trashEntries.length;
    if (totalTrashCount > 0) {
        trashBadge.style.display = 'block';
        trashBadge.textContent = totalTrashCount;
    } else {
        trashBadge.style.display = 'none';
    }
}

// Render list of items inside Trash modal based on selected tab
function renderTrashList() {
    if (!trashListContainer) return;
    trashListContainer.innerHTML = '';
    
    if (activeTrashTab === 'entries') {
        if (trashEntries.length === 0) {
            trashListContainer.innerHTML = '<div class="trash-empty-tip">回收桶中沒有已刪除的隨筆 🗑️</div>';
            return;
        }
        
        trashEntries.forEach(entry => {
            const card = document.createElement('div');
            card.className = 'trash-item-card';
            
            card.innerHTML = `
                <div class="trash-item-info">
                    <div class="trash-item-text">${escapeHtml(entry.content)}</div>
                    <div class="trash-item-meta">
                        <span>來自：${escapeHtml(entry.notebook_title || '未分類')}</span>
                        <span>刪除於：${entry.deleted_at || '未知'}</span>
                    </div>
                </div>
                <div class="trash-item-actions">
                    <button class="btn-trash-action restore" title="還原隨筆"><i class="fa-solid fa-rotate-left"></i></button>
                    <button class="btn-trash-action delete-perm" title="永久刪除"><i class="fa-regular fa-trash-can"></i></button>
                </div>
            `;
            
            card.querySelector('.restore').addEventListener('click', () => restoreEntry(entry.id));
            card.querySelector('.delete-perm').addEventListener('click', () => {
                if (confirm('確定要永久刪除這條隨筆嗎？此動作將無法復原。')) {
                    deleteEntryPermanently(entry.id);
                }
            });
            
            trashListContainer.appendChild(card);
        });
    } else {
        // notebooks tab
        if (trashNotebooks.length === 0) {
            trashListContainer.innerHTML = '<div class="trash-empty-tip">回收桶中沒有已刪除的筆記本 🗑️</div>';
            return;
        }
        
        trashNotebooks.forEach(nb => {
            const card = document.createElement('div');
            card.className = 'trash-item-card';
            
            const notesCount = nb.associatedEntries ? nb.associatedEntries.length : 0;
            
            card.innerHTML = `
                <div class="trash-item-info">
                    <div class="trash-item-text" style="font-weight: 600;">${escapeHtml(nb.title)}</div>
                    <div class="trash-item-meta">
                        <span>含 ${notesCount} 條隨筆</span>
                        <span>刪除於：${nb.deleted_at || '未知'}</span>
                    </div>
                </div>
                <div class="trash-item-actions">
                    <button class="btn-trash-action restore" title="還原筆記本與其隨筆"><i class="fa-solid fa-rotate-left"></i></button>
                    <button class="btn-trash-action delete-perm" title="永久刪除"><i class="fa-regular fa-trash-can"></i></button>
                </div>
            `;
            
            card.querySelector('.restore').addEventListener('click', () => restoreNotebook(nb.id));
            card.querySelector('.delete-perm').addEventListener('click', () => {
                if (confirm(`確定要永久刪除筆記本「${nb.title}」及其所有筆記嗎？此動作將無法復原。`)) {
                    deleteNotebookPermanently(nb.id);
                }
            });
            
            trashListContainer.appendChild(card);
        });
    }
}

// Restore a single entry (随筆)
function restoreEntry(id) {
    const trashIndex = trashEntries.findIndex(e => e.id === id);
    if (trashIndex === -1) return;
    
    const [trashEntry] = trashEntries.splice(trashIndex, 1);
    delete trashEntry.deleted_at;
    const notebookId = trashEntry.notebook_id;
    
    // Check if notebook still exists
    let notebookExists = notebooks.some(n => n.id === notebookId);
    
    if (!notebookExists) {
        // Check if notebook is in trash
        const trashNotebookIndex = trashNotebooks.findIndex(n => n.id === notebookId);
        if (trashNotebookIndex !== -1) {
            // Restore notebook too
            const [trashNotebook] = trashNotebooks.splice(trashNotebookIndex, 1);
            const associated = trashNotebook.associatedEntries || [];
            delete trashNotebook.associatedEntries;
            delete trashNotebook.deleted_at;
            notebooks.push(trashNotebook);
            entries.push(...associated);
            alert(`已連同還原隨筆所屬的筆記本：「${trashNotebook.title}」`);
        } else {
            // Re-create the notebook if completely gone
            const newNotebook = {
                id: notebookId,
                title: trashEntry.notebook_title || '已還原的筆記本',
                created_at: formatDateTime(new Date()),
                status: 'active',
                report: null
            };
            notebooks.push(newNotebook);
            alert(`原所屬筆記本已不存在，已為您自動建立新筆記本：「${newNotebook.title}」`);
        }
    }
    
    entries.push(trashEntry);
    
    saveNotebooksToStorage();
    saveEntriesToStorage();
    saveTrashToStorage();
    
    renderNotebooksList();
    if (currentNotebookId === notebookId) {
        renderEntries();
    }
    updateTrashBadge();
    renderTrashList();
}

// Restore a notebook and all its notes
function restoreNotebook(id) {
    const trashIndex = trashNotebooks.findIndex(n => n.id === id);
    if (trashIndex === -1) return;
    
    const [trashNotebook] = trashNotebooks.splice(trashIndex, 1);
    
    // Extract associated entries
    const associated = trashNotebook.associatedEntries || [];
    delete trashNotebook.associatedEntries;
    delete trashNotebook.deleted_at;
    
    // Push back to active lists
    notebooks.push(trashNotebook);
    entries.push(...associated);
    
    saveNotebooksToStorage();
    saveEntriesToStorage();
    saveTrashToStorage();
    
    renderNotebooksList();
    updateTrashBadge();
    renderTrashList();
    
    // Select the restored notebook automatically
    selectNotebook(trashNotebook.id);
}

// Permanently delete single entry
function deleteEntryPermanently(id) {
    trashEntries = trashEntries.filter(e => e.id !== id);
    saveTrashToStorage();
    updateTrashBadge();
    renderTrashList();
}

// Permanently delete notebook
function deleteNotebookPermanently(id) {
    trashNotebooks = trashNotebooks.filter(n => n.id !== id);
    saveTrashToStorage();
    updateTrashBadge();
    renderTrashList();
}

// Empty entire trash can
function emptyTrash() {
    if (trashNotebooks.length === 0 && trashEntries.length === 0) {
        alert('資源回收桶本來就是空的唷！');
        return;
    }
    
    if (confirm('您確定要永久清空資源回收桶中的所有內容嗎？此動作將永久刪除且無法還原。')) {
        trashNotebooks = [];
        trashEntries = [];
        saveTrashToStorage();
        updateTrashBadge();
        renderTrashList();
    }
}

function updateApiKeyStatus(isSuccess, message) {
    if (settingsStatus) {
        settingsStatus.className = `api-key-status ${isSuccess ? 'success' : 'error'}`;
        settingsStatus.textContent = message;
    }
}

// Predefined Model Registry containing details from the user specification
const MODEL_REGISTRY = {
    'gemini-2.5-flash': {
        id: 'gemini-2.5-flash',
        rpm: '10 ~ 15 RPM',
        rpd: '250 RPD',
        remark: '目前最推薦的免費主力（支援 Search Grounding）'
    },
    'gemini-2.5-flash-lite': {
        id: 'gemini-2.5-flash-lite',
        rpm: '15 ~ 30 RPM',
        rpd: '1,000 RPD',
        remark: '適合高頻率、輕量化的任務（如純翻譯、摘要）'
    },
    'gemini-3-flash': {
        id: 'gemini-3-flash',
        rpm: '10 RPM',
        rpd: '-',
        remark: '新一代模型的免費預覽版'
    },
    'gemini-3.1-flash-lite': {
        id: 'gemini-3.1-flash-lite',
        rpm: '15 RPM',
        rpd: '-',
        remark: '新一代輕量模型預覽'
    },
    'gemini-2.5-pro': {
        id: 'gemini-2.5-pro',
        rpm: '5 RPM',
        rpd: '100 RPD',
        remark: '僅保留低限度的測試額度，適合長文本處理'
    },
    'gemma-2-27b-it': {
        id: 'gemma-2-27b-it',
        rpm: '~30 RPM',
        rpd: '1,500 RPD',
        remark: '開源輕量模型，亦可在 API 中免費呼叫'
    }
};

// Update model metadata details in the UI card
function updateModelDetails() {
    if (!modelSelect) return;
    const selectedValue = modelSelect.value;
    const model = MODEL_REGISTRY[selectedValue];
    
    const rpmEl = document.getElementById('model-detail-rpm');
    const rpdEl = document.getElementById('model-detail-rpd');
    const remarkEl = document.getElementById('model-detail-remark');
    
    if (model && rpmEl && rpdEl && remarkEl) {
        rpmEl.textContent = model.rpm;
        rpdEl.textContent = model.rpd;
        remarkEl.textContent = model.remark;
    }
}

// Reset model dropdown to defaults
function resetModelSelectToDefault() {
    if (!modelSelect) return;
    modelSelect.innerHTML = `
        <option value="gemini-2.5-flash">Gemini 2.5 Flash 🏆</option>
        <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash-Lite</option>
        <option value="gemini-3-flash">Gemini 3 Flash (Preview)</option>
        <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash-Lite (Preview)</option>
        <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
        <option value="gemma-2-27b-it">Gemma 3 / 4</option>
    `;
    modelSelect.value = 'gemini-2.5-flash';
    localStorage.setItem(STORAGE_KEYS.MODEL, 'gemini-2.5-flash');
}

// --- App Operations ---

// Render Notebooks list in Sidebar
function renderNotebooksList() {
    notebooksList.innerHTML = '';
    
    // 1. Render Folders under current subject
    const subjectFolders = folders.filter(f => f.subjectId === currentSubjectId);
    
    subjectFolders.forEach(folder => {
        const folderEl = document.createElement('div');
        folderEl.className = `folder-item ${folder.isCollapsed ? 'collapsed' : ''}`;
        folderEl.dataset.id = folder.id;
        
        // Find notebooks in this folder
        const folderNotebooks = notebooks.filter(nb => nb.folderId === folder.id);
        const sortedFolderNotebooks = [...folderNotebooks].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        const isFolderActive = currentFolderId === folder.id;
        
        folderEl.innerHTML = `
            <div class="folder-header ${isFolderActive ? 'active' : ''}" data-id="${folder.id}" style="${isFolderActive ? 'background-color: var(--sidebar-hover); border-left: 3px solid var(--sidebar-accent);' : ''}">
                <div class="folder-info">
                    <i class="fa-solid fa-chevron-down folder-toggle-arrow"></i>
                    <i class="fa-solid ${folder.isCollapsed ? 'fa-folder' : 'fa-folder-open'} folder-icon"></i>
                    <span class="folder-name-text" title="雙擊或點擊重新命名按鈕可修改名稱">${escapeHtml(folder.name)}</span>
                </div>
                <div class="folder-actions">
                    <button class="btn-folder-action btn-folder-summary" title="AI 資料夾整合摘要">
                        <i class="fa-solid fa-wand-magic-sparkles"></i>
                    </button>
                    <button class="btn-folder-action rename-folder-btn" title="重新命名資料夾">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn-folder-action add-notebook-to-folder" title="在此資料夾建立新筆記本">
                        <i class="fa-solid fa-plus"></i>
                    </button>
                    <button class="btn-folder-action delete-folder" title="刪除資料夾（保留筆記本）">
                        <i class="fa-regular fa-trash-can"></i>
                    </button>
                </div>
            </div>
            <div class="folder-notebooks">
                <ul class="notebooks-list-inner" style="list-style: none;"></ul>
            </div>
        `;
        
        // Add events to folder header
        const folderHeader = folderEl.querySelector('.folder-header');
        folderHeader.addEventListener('click', (e) => {
            // If clicking buttons or content is being edited, don't toggle collapse
            if (e.target.closest('.btn-folder-action') || folderEl.querySelector('.folder-name-text').isContentEditable) return;
            toggleFolderCollapse(folder.id);
        });
        
        // Drag and drop listeners on folder header
        folderHeader.addEventListener('dragover', (e) => {
            e.preventDefault(); // Required to allow drop
            folderHeader.classList.add('drag-hover');
        });
        
        folderHeader.addEventListener('dragleave', () => {
            folderHeader.classList.remove('drag-hover');
        });
        
        folderHeader.addEventListener('drop', (e) => {
            e.preventDefault();
            folderHeader.classList.remove('drag-hover');
            const dataStr = e.dataTransfer.getData('text/plain');
            
            try {
                const ids = JSON.parse(dataStr);
                if (Array.isArray(ids)) {
                    const moves = [];
                    ids.forEach(id => {
                        const notebook = notebooks.find(nb => nb.id === id);
                        if (notebook) {
                            moves.push({ notebookId: id, previousFolderId: notebook.folderId, previousSubjectId: notebook.subjectId });
                            notebook.folderId = folder.id;
                            notebook.subjectId = folder.subjectId;
                        }
                    });
                    if (moves.length > 0) {
                        undoCache = { action: 'move', moves: moves };
                        showUndoToast('move', `已將 ${moves.length} 本筆記本移至資料夾「${folder.name}」。`);
                    }
                    saveNotebooksToStorage();
                    renderNotebooksList();
                    updateBulkMoveSelectOptions();
                }
            } catch (err) {
                const notebook = notebooks.find(nb => nb.id === dataStr);
                if (notebook) {
                    undoCache = {
                        action: 'move',
                        moves: [{ notebookId: notebook.id, previousFolderId: notebook.folderId, previousSubjectId: notebook.subjectId }]
                    };
                    notebook.folderId = folder.id;
                    notebook.subjectId = folder.subjectId;
                    showUndoToast('move', `已將筆記本「${notebook.title}」移至資料夾「${folder.name}」。`);
                    saveNotebooksToStorage();
                    renderNotebooksList();
                    updateBulkMoveSelectOptions();
                }
            }
        });
        
        // Rename folder name event
        const folderNameSpan = folderEl.querySelector('.folder-name-text');
        
        function enableRename() {
            folderNameSpan.contentEditable = "true";
            folderNameSpan.focus();
            document.execCommand('selectAll', false, null);
        }
 
        folderNameSpan.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            enableRename();
        });
 
        folderEl.querySelector('.rename-folder-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            enableRename();
        });
 
        folderNameSpan.addEventListener('blur', () => {
            folderNameSpan.contentEditable = "false";
            renameFolder(folder.id, folderNameSpan.textContent.trim());
        });
        folderNameSpan.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                folderNameSpan.blur();
            }
        });
        
        // Folder Summary button
        folderEl.querySelector('.btn-folder-summary').addEventListener('click', (e) => {
            e.stopPropagation();
            selectFolderForDashboard(folder.id);
        });
        
        // Add notebook directly inside folder
        folderEl.querySelector('.add-notebook-to-folder').addEventListener('click', (e) => {
            e.stopPropagation();
            createNotebook(folder.id);
        });
        
        // Delete folder
        folderEl.querySelector('.delete-folder').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`確定要刪除資料夾「${folder.name}」嗎？（資料夾內的筆記本將會被移出至未分類）`)) {
                deleteFolder(folder.id);
            }
        });
        
        const innerList = folderEl.querySelector('.notebooks-list-inner');
        sortedFolderNotebooks.forEach(notebook => {
            const li = createNotebookLI(notebook);
            innerList.appendChild(li);
        });
        
        notebooksList.appendChild(folderEl);
    });
    
    // 2. Render Uncategorized Notebooks (Unclassified) under current subject
    const uncategorizedNotebooks = notebooks.filter(nb => nb.subjectId === currentSubjectId && (!nb.folderId || !folders.some(f => f.id === nb.folderId)));
    if (uncategorizedNotebooks.length > 0 || subjectFolders.length === 0) {
        // If there are folders, show an "Uncategorized" title, else just render notebooks
        if (subjectFolders.length > 0) {
            const titleEl = document.createElement('div');
            titleEl.className = 'section-title';
            titleEl.style.marginTop = '16px';
            titleEl.style.marginBottom = '8px';
            titleEl.innerHTML = `<span>未分類筆記</span>`;
            notebooksList.appendChild(titleEl);
        }
        
        const sortedUncategorized = [...uncategorizedNotebooks].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        sortedUncategorized.forEach(notebook => {
            const li = createNotebookLI(notebook);
            notebooksList.appendChild(li);
        });
    }
}

// Create single notebook LI element
function createNotebookLI(notebook) {
    const li = document.createElement('li');
    li.dataset.id = notebook.id;
    li.className = notebook.isProtected ? 'locked' : '';
    if (notebook.id === currentNotebookId) {
        li.classList.add('active');
    }
    
    // Make the notebook item draggable
    li.setAttribute('draggable', 'true');
    li.addEventListener('dragstart', (e) => {
        li.classList.add('dragging');
        // If dragging an item that is part of the selection, drag all selected notebooks!
        let dragIds = [];
        if (selectedNotebookIds.has(notebook.id)) {
            dragIds = Array.from(selectedNotebookIds);
        } else {
            dragIds = [notebook.id];
        }
        e.dataTransfer.setData('text/plain', JSON.stringify(dragIds));
        
        // Show count visual drag ghost badge
        const ghostBadge = document.getElementById('drag-ghost-badge');
        if (ghostBadge) {
            ghostBadge.innerHTML = `<i class="fa-solid fa-book"></i> 正在拖曳 ${dragIds.length} 本筆記本`;
            ghostBadge.style.top = '0px';
            ghostBadge.style.left = '0px';
            e.dataTransfer.setDragImage(ghostBadge, 15, 15);
            setTimeout(() => {
                ghostBadge.style.top = '-1000px';
                ghostBadge.style.left = '-1000px';
            }, 0);
        }
        
        e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => {
        li.classList.remove('dragging');
    });
    
    const isFinalized = notebook.status === 'finalized';
    const dateStr = notebook.created_at.split(' ')[0];
    
    li.innerHTML = `
        <div class="notebook-checkbox-wrapper">
            <input type="checkbox" class="notebook-item-checkbox" data-id="${notebook.id}" ${selectedNotebookIds.has(notebook.id) ? 'checked' : ''}>
        </div>
        <div class="notebook-item-content">
            <span class="notebook-item-title">${escapeHtml(notebook.title)}</span>
            <div class="notebook-item-meta">
                <span class="notebook-item-date">${dateStr}</span>
                <span class="badge-status ${isFinalized ? 'status-finalized' : 'status-active'}">
                    ${isFinalized ? '已整理' : '筆記中'}
                </span>
            </div>
        </div>
        <button class="btn-lock-notebook" title="${notebook.isProtected ? '解除防刪保護' : '啟動防刪保護'}">
            <i class="fa-solid ${notebook.isProtected ? 'fa-lock' : 'fa-lock-open'}"></i>
        </button>
        <button class="btn-delete-notebook" title="刪除筆記本">
            <i class="fa-regular fa-trash-can"></i>
        </button>
    `;
    
    // Toggle checkbox on clicking checkbox itself (Shift+Click support)
    const cb = li.querySelector('.notebook-item-checkbox');
    cb.addEventListener('click', (e) => {
        e.stopPropagation();
        handleCheckboxClick(e, notebook.id);
    });
    
    // Select Notebook click
    li.addEventListener('click', (e) => {
        // If clicking actions or checkbox, do nothing
        if (e.target.closest('.btn-delete-notebook') || e.target.closest('.btn-lock-notebook') || e.target.closest('.notebook-checkbox-wrapper')) return;
        
        if (isBulkSelectMode) {
            // In bulk select mode, clicking the item toggles the checkbox
            const checkbox = li.querySelector('.notebook-item-checkbox');
            checkbox.checked = !checkbox.checked;
            // Create a mock event to handle Shift + click properly even when clicking list item
            const mockEvent = { target: checkbox, shiftKey: e.shiftKey };
            handleCheckboxClick(mockEvent, notebook.id);
        } else {
            selectNotebook(notebook.id);
        }
    });
    
    // Lock Notebook toggle
    li.querySelector('.btn-lock-notebook').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleNotebookLock(notebook.id);
    });
    
    // Delete Notebook click
    li.querySelector('.btn-delete-notebook').addEventListener('click', (e) => {
        e.stopPropagation();
        if (notebook.isProtected) {
            alert(`此筆記本已啟動防誤刪保護，無法刪除！請先解除鎖定。`);
            return;
        }
        if (confirm(`您確定要刪除「${notebook.title}」嗎？這會清除該筆記本內的所有內容且移至回收桶。`)) {
            deleteNotebook(notebook.id);
        }
    });
    
    return li;
}

// Collapse/Expand Folder
function toggleFolderCollapse(id) {
    const folder = folders.find(f => f.id === id);
    if (folder) {
        folder.isCollapsed = !folder.isCollapsed;
        saveFoldersToStorage();
        renderNotebooksList();
    }
}

// Rename Folder
function renameFolder(id, newName) {
    const folder = folders.find(f => f.id === id);
    if (folder && newName && folder.name !== newName) {
        folder.name = newName;
        saveFoldersToStorage();
        renderNotebooksList();
        updateBulkMoveSelectOptions();
    } else {
        renderNotebooksList(); // Reset UI if empty or no change
    }
}

// Delete Folder (notebooks remain uncategorized)
function deleteFolder(id) {
    folders = folders.filter(f => f.id !== id);
    notebooks.forEach(nb => {
        if (nb.folderId === id) {
            nb.folderId = null;
        }
    });
    saveFoldersToStorage();
    saveNotebooksToStorage();
    renderNotebooksList();
    updateBulkMoveSelectOptions();
}

// Create Folder
function createFolder() {
    const count = folders.length + 1;
    const newFolder = {
        id: generateId(),
        name: `新資料夾 #${count}`,
        isCollapsed: false,
        subjectId: currentSubjectId
    };
    folders.push(newFolder);
    saveFoldersToStorage();
    renderNotebooksList();
    updateBulkMoveSelectOptions();
    
    // Focus the new folder header name
    setTimeout(() => {
        const folderEl = document.querySelector(`.folder-item[data-id="${newFolder.id}"] .folder-name-text`);
        if (folderEl) {
            folderEl.focus();
            document.execCommand('selectAll', false, null);
        }
    }, 100);
}

// Toggle Notebook Lock
function toggleNotebookLock(id) {
    const notebook = notebooks.find(nb => nb.id === id);
    if (notebook) {
        notebook.isProtected = !notebook.isProtected;
        saveNotebooksToStorage();
        renderNotebooksList();
    }
}

let lastCheckedId = null;

// Handle checkbox click with Shift+Click range select
function handleCheckboxClick(e, id) {
    const isChecked = e.target.checked;
    
    if (e.shiftKey && lastCheckedId) {
        const visibleNotebookIds = getVisibleNotebookIds();
        const lastIdx = visibleNotebookIds.indexOf(lastCheckedId);
        const currentIdx = visibleNotebookIds.indexOf(id);
        
        if (lastIdx !== -1 && currentIdx !== -1) {
            const start = Math.min(lastIdx, currentIdx);
            const end = Math.max(lastIdx, currentIdx);
            
            for (let i = start; i <= end; i++) {
                const nbId = visibleNotebookIds[i];
                if (isChecked) {
                    selectedNotebookIds.add(nbId);
                } else {
                    selectedNotebookIds.delete(nbId);
                }
                
                // Sync checkbox element state
                const box = document.querySelector(`.notebook-item-checkbox[data-id="${nbId}"]`);
                if (box) box.checked = isChecked;
            }
        }
    } else {
        if (isChecked) {
            selectedNotebookIds.add(id);
        } else {
            selectedNotebookIds.delete(id);
        }
    }
    
    lastCheckedId = id;
    updateBulkActionsPanel();
}

// Get rendered notebooks order in list
function getVisibleNotebookIds() {
    const ids = [];
    const subjectFolders = folders.filter(f => f.subjectId === currentSubjectId);
    subjectFolders.forEach(folder => {
        const folderNotebooks = notebooks.filter(nb => nb.folderId === folder.id);
        const sortedFolderNotebooks = [...folderNotebooks].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        sortedFolderNotebooks.forEach(nb => ids.push(nb.id));
    });
    
    const uncategorized = notebooks.filter(nb => nb.subjectId === currentSubjectId && (!nb.folderId || !folders.some(f => f.id === nb.folderId)));
    const sortedUncategorized = [...uncategorized].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    sortedUncategorized.forEach(nb => ids.push(nb.id));
    
    return ids;
}

// Toggle Notebook Selection (Bulk operations)
function toggleNotebookSelection(id, isSelected) {
    if (isSelected) {
        selectedNotebookIds.add(id);
    } else {
        selectedNotebookIds.delete(id);
    }
    updateBulkActionsPanel();
}

let bulkSelectTimeout1 = null;
let bulkSelectTimeout2 = null;

// Toggle Bulk Selection Mode
function toggleBulkSelect() {
    isBulkSelectMode = !isBulkSelectMode;
    selectedNotebookIds.clear();
    lastCheckedId = null;
    
    const body = document.body;
    const panel = document.getElementById('inline-bulk-toolbar');
    const toggleBtn = document.getElementById('toggle-bulk-select-btn');
    const normalBtns = document.querySelectorAll('.normal-action-btn');
    
    if (isBulkSelectMode) {
        body.classList.add('body-bulk-select');
        if (panel) panel.style.display = 'flex';
        toggleBtn.style.color = 'var(--sidebar-accent)';
        toggleBtn.style.backgroundColor = 'var(--sidebar-hover)';
        normalBtns.forEach(btn => btn.style.display = 'none');
    } else {
        body.classList.remove('body-bulk-select');
        if (panel) panel.style.display = 'none';
        toggleBtn.style.color = '';
        toggleBtn.style.backgroundColor = '';
        const moveSelect = document.getElementById('bulk-move-floating-select-container');
        if (moveSelect) moveSelect.style.display = 'none';
        normalBtns.forEach(btn => btn.style.display = 'inline-flex');
    }
    updateBulkActionsPanel();
    renderNotebooksList();
}

// Update the Bulk Actions UI panel counts
function updateBulkActionsPanel() {
    const countEl = document.getElementById('bulk-selected-count-floating');
    if (countEl) {
        countEl.textContent = selectedNotebookIds.size;
    }
    
    // Update select-all button text dynamically
    const btnText = document.getElementById('select-all-btn-text');
    if (btnText) {
        const visibleIds = getVisibleNotebookIds();
        const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedNotebookIds.has(id));
        btnText.textContent = allSelected ? '取消全選' : '全選';
    }
}

// Update the options inside the destination folder dropdown
function updateBulkMoveSelectOptions() {
    const select = document.getElementById('bulk-move-folder-select-floating');
    if (!select) return;
    
    select.innerHTML = '<option value="">-- 移至未分類 --</option>';
    const subjectFolders = folders.filter(f => f.subjectId === currentSubjectId);
    subjectFolders.forEach(folder => {
        select.innerHTML += `<option value="${folder.id}">${escapeHtml(folder.name)}</option>`;
    });
}

// Select All / Deselect All trigger
function bulkSelectAll() {
    const visibleIds = getVisibleNotebookIds();
    if (visibleIds.length === 0) return;
    
    const allSelected = visibleIds.every(id => selectedNotebookIds.has(id));
    
    if (allSelected) {
        selectedNotebookIds.clear();
    } else {
        visibleIds.forEach(id => selectedNotebookIds.add(id));
    }
    
    // Sync checkbox DOM elements
    document.querySelectorAll('.notebook-item-checkbox').forEach(cb => {
        cb.checked = !allSelected;
    });
    
    updateBulkActionsPanel();
}

// Bulk Delete selected notebooks
// Bulk Delete selected notebooks
function bulkDelete() {
    if (selectedNotebookIds.size === 0) {
        alert('請先勾選要刪除的筆記本！');
        return;
    }
    
    const selectedList = notebooks.filter(nb => selectedNotebookIds.has(nb.id));
    const lockedCount = selectedList.filter(nb => nb.isProtected).length;
    
    let deleteList = selectedList.filter(nb => !nb.isProtected);
    
    if (deleteList.length === 0) {
        alert('所選的筆記本都已啟動防誤刪鎖定保護，無法進行刪除！');
        return;
    }
    
    let confirmMsg = `您確定要將這 ${deleteList.length} 本筆記本移至回收桶嗎？`;
    if (lockedCount > 0) {
        confirmMsg += `\n（其中有 ${lockedCount} 本受保護的筆記本將會被自動跳過）`;
    }
    
    if (confirm(confirmMsg)) {
        const deletedNotebooks = [];
        const deletedEntries = [];
        
        deleteList.forEach(notebook => {
            const notebookIndex = notebooks.findIndex(n => n.id === notebook.id);
            if (notebookIndex !== -1) {
                notebooks.splice(notebookIndex, 1);
                const associated = entries.filter(e => e.notebook_id === notebook.id);
                entries = entries.filter(e => e.notebook_id !== notebook.id);
                
                deletedNotebooks.push(notebook);
                deletedEntries.push(...associated);
                
                const trashNotebook = {
                    ...notebook,
                    deleted_at: formatDateTime(new Date()),
                    associatedEntries: associated
                };
                trashNotebooks.push(trashNotebook);
            }
        });
        
        // Store in undo cache
        undoCache = {
            action: 'delete',
            notebooks: deletedNotebooks,
            entries: deletedEntries
        };
        
        saveNotebooksToStorage();
        saveEntriesToStorage();
        saveTrashToStorage();
        
        selectedNotebookIds.clear();
        updateTrashBadge();
        updateBulkActionsPanel();
        renderNotebooksList();
        
        if (currentNotebookId && !notebooks.some(n => n.id === currentNotebookId)) {
            currentNotebookId = null;
            updateWorkspaceView();
        }
        
        toggleBulkSelect(); // Deactivate mode after successful bulk delete
        showUndoToast('delete', `已將 ${deletedNotebooks.length} 本筆記本移至回收桶。`);
    }
}

// Bulk Move selected notebooks to folder
function bulkMove() {
    if (selectedNotebookIds.size === 0) {
        alert('請先勾選要移動的筆記本！');
        return;
    }
    
    const select = document.getElementById('bulk-move-folder-select-floating');
    const folderId = select.value || null; // empty string means Uncategorized
    
    const moves = [];
    selectedNotebookIds.forEach(id => {
        const nb = notebooks.find(n => n.id === id);
        if (nb) {
            moves.push({
                notebookId: id,
                previousFolderId: nb.folderId
            });
            nb.folderId = folderId;
        }
    });
    
    undoCache = {
        action: 'move',
        moves: moves
    };
    
    saveNotebooksToStorage();
    selectedNotebookIds.clear();
    document.getElementById('bulk-move-floating-select-container').style.display = 'none';
    updateBulkActionsPanel();
    renderNotebooksList();
    
    toggleBulkSelect(); // Deactivate mode after successful bulk move
    
    const folderName = folderId ? (folders.find(f => f.id === folderId)?.name || '資料夾') : '未分類';
    showUndoToast('move', `已將 ${moves.length} 本筆記本移動至「${folderName}」。`);
}

// Bulk Merge selected notebooks and open options modal
function bulkMergeReports() {
    if (selectedNotebookIds.size === 0) {
        alert('請先勾選要合併的筆記本！');
        return;
    }
    
    // Show custom option modal instead of standard confirm dialog
    document.getElementById('bulk-merge-modal').style.display = 'flex';
}

// Execute Bulk Merge & AI generation
async function executeBulkMerge() {
    document.getElementById('bulk-merge-modal').style.display = 'none';
    
    const selectedList = notebooks.filter(nb => selectedNotebookIds.has(nb.id));
    const selectedTemplate = document.getElementById('merge-template-select').value;
    const selectedTone = document.getElementById('merge-tone-select').value;
    const selectedLength = document.getElementById('merge-length-select').value;
    
    loadingOverlay.style.display = 'flex';
    
    try {
        const allSelectedEntries = [];
        selectedList.forEach(nb => {
            const nbEntries = entries.filter(e => e.notebook_id === nb.id);
            nbEntries.forEach(entry => {
                allSelectedEntries.push({
                    ...entry,
                    source_title: nb.title
                });
            });
        });
        
        if (allSelectedEntries.length === 0) {
            throw new Error('所選的筆記本中沒有任何隨筆內容，無法進行合併！');
        }
        
        allSelectedEntries.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        
        const mergedNotebookId = generateId();
        const mergedNotebookTitle = `合併工作報告 - ${formatDateTime(new Date()).split(' ')[0]}`;
        const newNotebook = {
            id: mergedNotebookId,
            title: mergedNotebookTitle,
            created_at: formatDateTime(new Date()),
            status: 'finalized',
            report: null,
            folderId: null,
            isProtected: false
        };
        notebooks.push(newNotebook);
        
        const newEntries = allSelectedEntries.map(e => ({
            id: generateId(),
            notebook_id: mergedNotebookId,
            content: `[來源：${e.source_title}] ${e.content}`,
            created_at: e.created_at
        }));
        entries.push(...newEntries);
        
        const apiKey = localStorage.getItem(STORAGE_KEYS.API_KEY);
        if (!apiKey) {
            saveNotebooksToStorage();
            saveEntriesToStorage();
            loadingOverlay.style.display = 'none';
            alert('已成功建立合併筆記本，但由於未設定 Gemini API 金鑰，無法自動生成工作匯報。請點選該合併筆記本查看合併隨筆。');
            toggleBulkSelect();
            selectNotebook(mergedNotebookId);
            return;
        }
        
        const entriesText = newEntries
            .map(e => `[記錄時間：${e.created_at}]\n${e.content}`)
            .join('\n\n---\n\n');
            
        // Customize structure based on template selection
        let templateInstruction = '';
        if (selectedTemplate === 'standard') {
            templateInstruction = `匯報結構必須包含：
   - # ${mergedNotebookTitle} - 跨項目整合工作報告
   - ## 📋 工作概述 (對本次合併的各筆記項目進度進行高層次綜合概述)
   - ## 🔍 各項目進度與成果 (理清不同來源筆記的進度狀況，列點整理核心成果)
   - ## 🚀 跨項目後續追蹤與待辦事項 (提煉出具體的行動代辦 Action Items)
   - ## 💡 助理溫馨提醒 (提供支持性的助理反饋、注意工作節奏)`;
        } else if (selectedTemplate === 'kanban') {
            templateInstruction = `匯報結構必須包含：
   - # ${mergedNotebookTitle} - 任務看板待辦清單
   - ## 📊 看板概述 (摘要各筆記主要目標)
   - ## 🔴 立即執行 (Immediate Action) - 緊急且重要的待辦項目
   - ## 🟡 持續追蹤 (Ongoing Task) - 常規進行中、需後續追蹤項目
   - ## 🟢 待啟動/規劃中 (Backlog) - 未來規劃項目
   - ## 💡 助理效率建議 (提供改進效率與任務劃分策略)`;
        } else if (selectedTemplate === 'comparison') {
            templateInstruction = `匯報結構必須包含：
   - # ${mergedNotebookTitle} - 跨項目對比分析
   - ## 🔍 多項目狀態概覽 (羅列各被合併項目的目前狀態)
   - ## 🤝 重合與關聯性分析 (分析各項目之間是否有相互重疊、依賴或衝突之處)
   - ## ⚖️ 進度對比與差異分析 (以表格或清晰列表形式對比各項目進展快慢、成果差異)
   - ## 🚀 資源分配與協同建議 (給出下一步的協同推進策略)`;
        } else if (selectedTemplate === 'weekly') {
            templateInstruction = `匯報結構必須包含：
   - # ${mergedNotebookTitle} - 極簡工作週報
   - ## 📰 核心亮點 (本次合併隨筆中最重要的 3 大成果)
   - ## 📌 重點摘要 (各別項目的核心進展，精簡列點)
   - ## 🗓️ 下週重點規劃 (下一步最核心的工作目標)
   - ## 💡 助理小叮嚀 (工作與節奏調節提醒)`;
        }

        // Customize tone
        let toneInstruction = '';
        if (selectedTone === 'professional') {
            toneInstruction = '使用極為專業、商務且條理分明的語氣，專注於邏輯架構與事實陳述。';
        } else if (selectedTone === 'friendly') {
            toneInstruction = '使用溫慢、親切且貼心的語氣。在匯報中多給予使用者鼓勵，像一位貼身的祕書或教練，字裡行間保持熱情。';
        } else if (selectedTone === 'concise') {
            toneInstruction = '使用極簡、精確且不帶任何修飾詞的語氣。直奔重點，去除任何客套與冗長字句。';
        }

        // Customize length
        let lengthInstruction = '';
        if (selectedLength === 'short') {
            lengthInstruction = '請控制輸出字數在大約 300 至 500 字之間，精簡摘要，不要贅述。';
        } else if (selectedLength === 'medium') {
            lengthInstruction = '請控制輸出字數在大約 800 至 1200 字之間，結構清晰，內容詳實。';
        } else if (selectedLength === 'long') {
            lengthInstruction = '請撰寫大於 1500 字的詳細報告，深入剖析每一條隨筆的細節與前後關聯，提供極為詳盡的報告內容。';
        }

        const systemPrompt = `你是一位專業且貼心的隨身助理。以下是使用者將多個不同主題/項目的筆記本合併後，依時間排序的零星筆記隨筆列表。
請你幫忙將這些不同來源的筆記內容進行高層次的邏輯整合，理清條理，去蕪存菁，撰寫成一份排版精緻、具有全局視野且高度專業的「跨項目工作整合匯報」。

請嚴格遵循以下匯報格式與風格要求：
1. 請以「Markdown」格式進行輸出。
2. ${templateInstruction}
3. 語氣與風格：${toneInstruction}
4. 報告長度控制：${lengthInstruction}`;
 
        const userPrompt = `合併報告名稱：${mergedNotebookTitle}
建立時間：${newNotebook.created_at}

【隨筆列表】：
${entriesText}`;

        const selectedModel = localStorage.getItem(STORAGE_KEYS.MODEL) || 'gemini-2.5-flash';
        const cleanModelName = selectedModel.replace('models/', '');
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModelName}:generateContent?key=${apiKey}`;
        
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
            throw new Error(data.error?.message || '合併 API 呼叫失敗');
        }
        
        const reportMarkdown = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!reportMarkdown) {
            throw new Error('回傳的合併匯報內容為空');
        }
        
        newNotebook.report = reportMarkdown;
        
        saveNotebooksToStorage();
        saveEntriesToStorage();
        
        toggleBulkSelect(); // Deactivate select mode
        selectNotebook(mergedNotebookId); // Load the new merged report
        alert('🎉 批量合併工作報告成功！已為您自動載入合併筆記本。');
        
    } catch (error) {
        console.error('Bulk merge error:', error);
        alert(`合併失敗：\n${error.message}`);
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

// Bulk Clone (複製所選)
function bulkClone() {
    if (selectedNotebookIds.size === 0) {
        alert('請先勾選要複製的筆記本！');
        return;
    }
    
    if (confirm(`確定要複製選取的 ${selectedNotebookIds.size} 本筆記本與其隨筆嗎？`)) {
        selectedNotebookIds.forEach(id => {
            const originalNb = notebooks.find(n => n.id === id);
            if (originalNb) {
                const newNbId = generateId();
                const clonedNb = {
                    id: newNbId,
                    title: `${originalNb.title} - 複製`,
                    created_at: formatDateTime(new Date()),
                    status: originalNb.status,
                    report: originalNb.report,
                    folderId: originalNb.folderId,
                    isProtected: false
                };
                notebooks.push(clonedNb);
                
                // Clone its entries
                const nbEntries = entries.filter(e => e.notebook_id === originalNb.id);
                nbEntries.forEach(entry => {
                    const clonedEntry = {
                        id: generateId(),
                        notebook_id: newNbId,
                        content: entry.content,
                        created_at: entry.created_at
                    };
                    entries.push(clonedEntry);
                });
            }
        });
        
        saveNotebooksToStorage();
        saveEntriesToStorage();
        
        selectedNotebookIds.clear();
        updateBulkActionsPanel();
        renderNotebooksList();
        toggleBulkSelect();
        alert('筆記本複製成功！');
    }
}

// Bulk Rename Execution
function executeBulkRename() {
    const selectedMode = document.querySelector('input[name="rename-mode"]:checked').value;
    
    if (selectedMode === 'prefix-suffix') {
        const prefix = document.getElementById('rename-prefix').value;
        const suffix = document.getElementById('rename-suffix').value;
        
        selectedNotebookIds.forEach(id => {
            const notebook = notebooks.find(n => n.id === id);
            if (notebook) {
                notebook.title = `${prefix}${notebook.title}${suffix}`;
            }
        });
    } else if (selectedMode === 'replace') {
        const findStr = document.getElementById('rename-find').value;
        const replaceStr = document.getElementById('rename-replace').value;
        
        if (!findStr) {
            alert('請輸入要尋找的文字！');
            return;
        }
        
        selectedNotebookIds.forEach(id => {
            const notebook = notebooks.find(n => n.id === id);
            if (notebook) {
                notebook.title = notebook.title.split(findStr).join(replaceStr);
            }
        });
    } else if (selectedMode === 'series') {
        const baseName = document.getElementById('rename-base').value || '筆記本';
        
        const sortedIds = Array.from(selectedNotebookIds).sort((a, b) => {
            const nbA = notebooks.find(n => n.id === a);
            const nbB = notebooks.find(n => n.id === b);
            return new Date(nbA.created_at) - new Date(nbB.created_at);
        });
        
        sortedIds.forEach((id, idx) => {
            const notebook = notebooks.find(n => n.id === id);
            if (notebook) {
                const num = String(idx + 1).padStart(2, '0');
                notebook.title = `${baseName}_${num}`;
            }
        });
    }
    
    saveNotebooksToStorage();
    renderNotebooksList();
    updateWorkspaceView();
    document.getElementById('bulk-rename-modal').style.display = 'none';
    toggleBulkSelect();
    alert('批量重命名成功！');
}

// Bulk Export (批量匯出 Markdown)
function bulkExport() {
    if (selectedNotebookIds.size === 0) {
        alert('請先勾選要匯出的筆記本！');
        return;
    }
    
    const selectedList = notebooks.filter(nb => selectedNotebookIds.has(nb.id));
    
    let markdownContent = `# 隨身助理筆記本批量匯出檔案\n匯出時間：${formatDateTime(new Date())}\n共匯出 ${selectedList.length} 本筆記本\n\n---\n\n`;
    
    selectedList.forEach((nb, index) => {
        const folder = folders.find(f => f.id === nb.folderId);
        const folderName = folder ? folder.name : '未分類';
        
        markdownContent += `## 📘 [${folderName}] ${nb.title}\n`;
        markdownContent += `- **建立時間**：${nb.created_at}\n`;
        markdownContent += `- **狀態**：${nb.status === 'finalized' ? '已整理' : '筆記中'}\n\n`;
        
        const nbEntries = entries.filter(e => e.notebook_id === nb.id);
        markdownContent += `### 📝 隨筆內容 (${nbEntries.length} 條紀錄)\n`;
        if (nbEntries.length === 0) {
            markdownContent += `*此筆記本無內容*\n\n`;
        } else {
            nbEntries.forEach(e => {
                markdownContent += `> **[${e.created_at}]**\n> ${e.content.split('\n').join('\n> ')}\n\n`;
            });
        }
        
        if (nb.report) {
            markdownContent += `### 🤖 助理整合工作匯報\n\n${nb.report}\n\n`;
        }
        
        if (index < selectedList.length - 1) {
            markdownContent += `\n---\n\n`;
        }
    });
    
    const filename = `隨身助理筆記匯出_${formatDateTime(new Date()).split(' ')[0].replace(/\//g, '')}.md`;
    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    selectedNotebookIds.clear();
    updateBulkActionsPanel();
    toggleBulkSelect();
    alert('批量匯出 Markdown 成功！');
}

// Undo Cache Global State
let undoCache = null;
let undoTimeoutId = null;

// Show Undo Toast helper
function showUndoToast(actionName, message) {
    const toast = document.getElementById('undo-toast');
    const msgEl = document.getElementById('undo-toast-message');
    const fillEl = document.getElementById('undo-toast-progress-fill');
    
    if (!toast || !msgEl || !fillEl) return;
    
    if (undoTimeoutId) {
        clearTimeout(undoTimeoutId);
    }
    
    msgEl.textContent = message;
    
    // Show toast
    toast.style.display = 'flex';
    
    // Reset progress bar animation
    fillEl.style.transition = 'none';
    fillEl.style.width = '100%';
    
    // Force reflow
    fillEl.offsetHeight;
    
    // Animate progress bar to 0% in 5 seconds
    fillEl.style.transition = 'width 5s linear';
    fillEl.style.width = '0%';
    
    undoTimeoutId = setTimeout(() => {
        toast.style.display = 'none';
        undoCache = null;
    }, 5000);
}

// Trigger Undo Action
function triggerUndo() {
    if (!undoCache) return;
    
    const toast = document.getElementById('undo-toast');
    if (toast) toast.style.display = 'none';
    if (undoTimeoutId) clearTimeout(undoTimeoutId);
    
    if (undoCache.action === 'delete') {
        notebooks.push(...undoCache.notebooks);
        entries.push(...undoCache.entries);
        
        const restoredNbIds = new Set(undoCache.notebooks.map(n => n.id));
        
        trashNotebooks = trashNotebooks.filter(n => !restoredNbIds.has(n.id));
        trashEntries = trashEntries.filter(e => !restoredNbIds.has(e.notebook_id));
        
        saveNotebooksToStorage();
        saveEntriesToStorage();
        saveTrashToStorage();
        
        updateTrashBadge();
        renderNotebooksList();
        updateWorkspaceView();
        
        alert('復原刪除成功！');
    } else if (undoCache.action === 'move') {
        undoCache.moves.forEach(m => {
            const nb = notebooks.find(n => n.id === m.notebookId);
            if (nb) {
                nb.folderId = m.previousFolderId;
            }
        });
        
        saveNotebooksToStorage();
        renderNotebooksList();
        updateBulkMoveSelectOptions();
        
        alert('復原移動成功！');
    }
    
    undoCache = null;
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
    if (typeof closeMobileNav === 'function') closeMobileNav();
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
    const dashboardState = document.getElementById('dashboard-state');
    if (!currentNotebookId) {
        workspace.style.display = 'none';
        if (currentFolderId) {
            emptyState.style.display = 'none';
            showDashboard('folder', currentFolderId);
        } else if (currentSubjectId) {
            emptyState.style.display = 'none';
            showDashboard('subject', currentSubjectId);
        } else {
            emptyState.style.display = 'flex';
            if (dashboardState) dashboardState.style.display = 'none';
        }
        return;
    }
    
    if (dashboardState) dashboardState.style.display = 'none';
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
        
        // Header
        const header = document.createElement('div');
        header.className = 'entry-header';
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'entry-time';
        timeSpan.textContent = entry.created_at;
        header.appendChild(timeSpan);
        
        // Actions container for buttons
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'entry-actions';
        
        const body = document.createElement('div');
        body.className = 'entry-body';
        body.textContent = entry.content; // Automatically escapes
        
        if (!isFinalized) {
            // Edit button
            const editBtn = document.createElement('button');
            editBtn.className = 'btn-edit-entry';
            editBtn.title = '編輯隨筆';
            editBtn.innerHTML = '<i class="fa-regular fa-pen-to-square"></i>';
            
            // Delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-delete-entry';
            deleteBtn.title = '刪除隨筆';
            deleteBtn.innerHTML = '<i class="fa-regular fa-trash-can"></i>';
            
            actionsDiv.appendChild(editBtn);
            actionsDiv.appendChild(deleteBtn);
            
            // Event listeners
            deleteBtn.addEventListener('click', () => {
                if (confirm('您確定要刪除這條隨筆嗎？此操作將無法復原。')) {
                    deleteEntry(entry.id);
                }
            });
            
            editBtn.addEventListener('click', () => {
                startEditing(entry.id, card, body, actionsDiv);
            });
        }
        
        header.appendChild(actionsDiv);
        card.appendChild(header);
        card.appendChild(body);
        entriesContainer.appendChild(card);
    });
}

// Inline edit mode for an entry
function startEditing(entryId, card, body, actionsDiv) {
    if (card.classList.contains('editing')) return;
    
    card.classList.add('editing');
    const originalContent = body.textContent;
    
    // Create a textarea
    const textarea = document.createElement('textarea');
    textarea.className = 'edit-entry-textarea';
    textarea.value = originalContent;
    textarea.rows = 2;
    
    // Replace body with textarea
    body.innerHTML = '';
    body.appendChild(textarea);
    textarea.focus();
    
    // Auto adjust cursor position to end
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    
    // Save original action buttons, swap to Save & Cancel
    const originalActionsHtml = actionsDiv.innerHTML;
    actionsDiv.innerHTML = '';
    
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-save-entry';
    saveBtn.title = '儲存修改';
    saveBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-cancel-entry';
    cancelBtn.title = '取消修改';
    cancelBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    
    actionsDiv.appendChild(saveBtn);
    actionsDiv.appendChild(cancelBtn);
    
    const saveChange = () => {
        const newContent = textarea.value.trim();
        if (newContent && newContent !== originalContent) {
            const entry = entries.find(e => e.id === entryId);
            if (entry) {
                entry.content = newContent;
                saveEntriesToStorage();
            }
        }
        renderEntries();
    };
    
    saveBtn.addEventListener('click', saveChange);
    cancelBtn.addEventListener('click', () => {
        renderEntries();
    });
    
    textarea.addEventListener('keydown', (e) => {
        // Save on Enter (without Shift), cancel on Escape
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            saveChange();
        }
        if (e.key === 'Escape') {
            renderEntries();
        }
    });
}

// Create new notebook
function createNotebook(folderId = null) {
    const id = generateId();
    const count = notebooks.length + 1;
    
    let subjectId = currentSubjectId;
    if (folderId) {
        const folder = folders.find(f => f.id === folderId);
        if (folder) subjectId = folder.subjectId;
    }
    
    const newNotebook = {
        id: id,
        title: `隨筆筆記本 #${count}`,
        created_at: formatDateTime(new Date()),
        status: 'active',
        report: null,
        folderId: folderId,
        subjectId: subjectId,
        isProtected: false
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

// Delete notebook (move to trash)
function deleteNotebook(id) {
    const notebookIndex = notebooks.findIndex(n => n.id === id);
    if (notebookIndex === -1) return;
    
    const notebook = notebooks[notebookIndex];
    if (notebook.isProtected) {
        alert(`此筆記本「${notebook.title}」已啟動防誤刪保護，無法刪除！請先點擊鎖頭解除鎖定。`);
        return;
    }
    
    notebooks.splice(notebookIndex, 1);
    
    // Get associated entries
    const associated = entries.filter(e => e.notebook_id === id);
    // Remove them from active entries
    entries = entries.filter(e => e.notebook_id !== id);
    
    // Add to trash notebooks
    const trashNotebook = {
        ...notebook,
        deleted_at: formatDateTime(new Date()),
        associatedEntries: associated
    };
    
    trashNotebooks.push(trashNotebook);
    
    saveNotebooksToStorage();
    saveEntriesToStorage();
    saveTrashToStorage();
    
    renderNotebooksList();
    updateTrashBadge();
    
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

// Delete entry (move to trash)
function deleteEntry(id) {
    const entryIndex = entries.findIndex(e => e.id === id);
    if (entryIndex === -1) return;
    
    const [entry] = entries.splice(entryIndex, 1);
    
    // Find notebook title for display in trash
    const notebook = notebooks.find(n => n.id === entry.notebook_id);
    const notebookTitle = notebook ? notebook.title : '已刪除的筆記本';
    
    const trashEntry = {
        ...entry,
        deleted_at: formatDateTime(new Date()),
        notebook_title: notebookTitle
    };
    
    trashEntries.push(trashEntry);
    
    saveEntriesToStorage();
    saveTrashToStorage();
    
    renderEntries();
    updateTrashBadge();
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
        const selectedValue = localStorage.getItem(STORAGE_KEYS.MODEL) || 'gemini-2.5-flash';
        const modelInfo = MODEL_REGISTRY[selectedValue] || { id: selectedValue };
        const cleanModelName = modelInfo.id.replace('models/', '');
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModelName}:generateContent?key=${apiKey}`;
        
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

// Context Menu helpers
function showContextMenu(e) {
    const li = e.target.closest('#notebooks-list li');
    if (!li) return;
    
    e.preventDefault();
    
    const notebookId = li.dataset.id;
    
    // Auto select the right-clicked notebook if not selected
    if (!selectedNotebookIds.has(notebookId)) {
        if (!isBulkSelectMode) {
            toggleBulkSelect();
        }
        selectedNotebookIds.add(notebookId);
        const cb = li.querySelector('.notebook-item-checkbox');
        if (cb) cb.checked = true;
        updateBulkActionsPanel();
        renderNotebooksList();
    }
    
    const ctxMenu = document.getElementById('custom-context-menu');
    if (!ctxMenu) return;
    
    // Position menu at cursor
    ctxMenu.style.display = 'block';
    ctxMenu.style.left = `${e.clientX}px`;
    ctxMenu.style.top = `${e.clientY}px`;
    
    // Ensure context menu fits inside viewport
    const menuWidth = ctxMenu.offsetWidth || 200;
    const menuHeight = ctxMenu.offsetHeight || 250;
    if (e.clientX + menuWidth > window.innerWidth) {
        ctxMenu.style.left = `${window.innerWidth - menuWidth - 10}px`;
    }
    if (e.clientY + menuHeight > window.innerHeight) {
        ctxMenu.style.top = `${window.innerHeight - menuHeight - 10}px`;
    }
}

// Open / Close Rename Modal helpers
function openBulkRenameModal() {
    if (selectedNotebookIds.size === 0) {
        alert('請先勾選要重新命名的筆記本！');
        return;
    }
    
    // Reset inputs
    document.getElementById('rename-prefix').value = '';
    document.getElementById('rename-suffix').value = '';
    document.getElementById('rename-find').value = '';
    document.getElementById('rename-replace').value = '';
    document.getElementById('rename-base').value = '';
    
    document.getElementById('bulk-rename-modal').style.display = 'flex';
}

function closeBulkRenameModal() {
    document.getElementById('bulk-rename-modal').style.display = 'none';
}

// --- Google Drive Sync Logic ---
function gapiLoaded() {
    if (gapiLoadStarted) return;
    gapiLoadStarted = true;
    gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
    try {
        await gapi.client.init({
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
        });
        gapiInited = true;
        checkGoogleAuth();
    } catch (e) {
        console.error("GAPI Init Error:", e);
    }
}

function gisLoaded() {
    if (gisInited) return;
    if (!GOOGLE_CLIENT_ID) return;
    googleTokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.appdata',
        callback: (tokenResponse) => {
            if (tokenResponse.error !== undefined) {
                console.error("Token Error:", tokenResponse);
                updateGoogleSyncStatus('登入失敗，請稍後重試。', false);
                return;
            }
            googleAccessToken = tokenResponse.access_token;
            localStorage.setItem(STORAGE_KEYS.GOOGLE_TOKEN, googleAccessToken);
            updateGoogleSyncStatus('登入成功，正在從雲端載入資料...', true);
            
            // Hide full-screen overlay when logged in successfully
            const overlay = document.getElementById('login-overlay');
            if (overlay) overlay.style.display = 'none';
            
            // CRITICAL FIX: Must load from drive on fresh login, not sync to it!
            loadFromGoogleDrive();
        },
    });
    gisInited = true;
    checkGoogleAuth();
}

function checkGoogleAuth() {
    if (gapiInited && gisInited && syncProvider === 'google' && googleAccessToken) {
        gapi.client.setToken({ access_token: googleAccessToken });
        updateGoogleSyncStatus('已登入，自動同步中...', true);
        
        // Hide full-screen overlay if we have a valid token
        const overlay = document.getElementById('login-overlay');
        if (overlay) overlay.style.display = 'none';
        
        loadFromGoogleDrive().catch(err => {
            if (err && err.status === 401) {
                // Token expired
                localStorage.removeItem(STORAGE_KEYS.GOOGLE_TOKEN);
                googleAccessToken = null;
                updateGoogleSyncStatus('登入過期，請重新登入', false);
                
                // Show overlay again
                if (overlay) overlay.style.display = 'flex';
            }
        });
    } else {
        // If not authenticated, make sure the overlay is visible
        const overlay = document.getElementById('login-overlay');
        if (overlay) overlay.style.display = 'flex';
    }
}

function updateGoogleSyncStatus(message, isSuccess = true) {
    const statusEl = document.getElementById('google-sync-status');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = `api-key-status ${isSuccess ? 'success' : 'error'}`;
    }
    const overlayStatusEl = document.getElementById('overlay-login-status');
    if (overlayStatusEl) {
        overlayStatusEl.textContent = message;
        overlayStatusEl.className = `api-key-status ${isSuccess ? 'success' : 'error'}`;
    }
}

async function syncToGoogleDrive() {
    if (syncProvider !== 'google' || !googleAccessToken || !gapiInited) return;
    if (isSyncingToGoogle) return;
    
    isSyncingToGoogle = true;
    try {
        const res = await gapi.client.drive.files.list({
            spaces: 'appDataFolder',
            q: "name='will_ai_sync.json'",
            fields: 'files(id, name)'
        });
        
        const files = res.result.files;
        const fileId = files && files.length > 0 ? files[0].id : null;
        
        const syncData = {
            subjects,
            notebooks,
            entries,
            folders,
            trashNotebooks,
            trashEntries,
            apiKey: localStorage.getItem(STORAGE_KEYS.API_KEY) || '',
            model: localStorage.getItem(STORAGE_KEYS.MODEL) || 'gemini-2.5-flash',
            theme: localStorage.getItem(STORAGE_KEYS.THEME) || 'classic'
        };
        
        const fileContent = JSON.stringify(syncData);
        const file = new Blob([fileContent], { type: 'application/json' });
        const metadata = {
            name: 'will_ai_sync.json',
            parents: ['appDataFolder']
        };
        
        const accessToken = gapi.client.getToken().access_token;
        const form = new FormData();
        
        if (fileId) {
            form.append('metadata', new Blob([JSON.stringify({})], { type: 'application/json' }));
            form.append('file', file);
            
            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
                method: 'PATCH',
                headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
                body: form
            });
        } else {
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', file);
            
            await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
                body: form
            });
        }
        
        if (syncStatusBadge) {
            syncStatusBadge.className = 'sync-badge cloud';
            syncStatusBadge.innerHTML = '<i class="fa-brands fa-google-drive"></i> Google 雲端已同步';
        }
        updateGoogleSyncStatus('雲端備份已更新！', true);
        
    } catch (err) {
        console.error("Google Drive Sync Error:", err);
        updateGoogleSyncStatus('同步失敗。', false);
    } finally {
        isSyncingToGoogle = false;
    }
}

async function loadFromGoogleDrive() {
    if (syncProvider !== 'google' || !googleAccessToken || !gapiInited) return;
    
    try {
        const res = await gapi.client.drive.files.list({
            spaces: 'appDataFolder',
            q: "name='will_ai_sync.json'",
            fields: 'files(id, name)'
        });
        
        const files = res.result.files;
        if (files && files.length > 0) {
            const fileId = files[0].id;
            const fileRes = await gapi.client.drive.files.get({
                fileId: fileId,
                alt: 'media'
            });
            
            const data = fileRes.result;
            if (data) {
                if (data.subjects) subjects = data.subjects;
                if (data.notebooks) notebooks = data.notebooks;
                if (data.entries) entries = data.entries;
                if (data.folders) folders = data.folders;
                if (data.trashNotebooks) trashNotebooks = data.trashNotebooks;
                if (data.trashEntries) trashEntries = data.trashEntries;
                
                migrateSubjects();
                
                localStorage.setItem(STORAGE_KEYS.SUBJECTS, JSON.stringify(subjects));
                localStorage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(folders));
                localStorage.setItem(STORAGE_KEYS.NOTEBOOKS, JSON.stringify(notebooks));
                localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(entries));
                localStorage.setItem(STORAGE_KEYS.TRASH_NOTEBOOKS, JSON.stringify(trashNotebooks));
                localStorage.setItem(STORAGE_KEYS.TRASH_ENTRIES, JSON.stringify(trashEntries));
                
                if (data.apiKey) {
                    localStorage.setItem(STORAGE_KEYS.API_KEY, data.apiKey);
                    if (apiKeyInput) apiKeyInput.value = data.apiKey;
                    if (apiWarningDot) apiWarningDot.style.display = 'none';
                }
                if (data.model) {
                    localStorage.setItem(STORAGE_KEYS.MODEL, data.model);
                    if (modelSelect) modelSelect.value = data.model;
                }
                if (data.theme) {
                    localStorage.setItem(STORAGE_KEYS.THEME, data.theme);
                    document.body.setAttribute('data-theme', data.theme);
                }
                
                if (typeof updateModelDetails === 'function') updateModelDetails();
                renderSubjectsList();
                renderNotebooksList();
                updateWorkspaceView();
                updateTrashBadge();
                renderTrashList();
                
                if (syncStatusBadge) {
                    syncStatusBadge.className = 'sync-badge cloud';
                    syncStatusBadge.innerHTML = '<i class="fa-brands fa-google-drive"></i> Google 雲端已同步';
                }
                updateGoogleSyncStatus('已成功從雲端載入資料！', true);
            }
        } else {
            updateGoogleSyncStatus('尚未有雲端備份，將在下次變動時建立。', true);
            if (notebooks.length > 0) {
                syncToGoogleDrive();
            }
        }
    } catch (err) {
        throw err;
    }
}

// --- Event Listeners Registration ---

// API Key Logic
// Unified Settings Save
if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', async () => {
        const key = apiKeyInput.value.trim();
        
        if (key) {
            localStorage.setItem(STORAGE_KEYS.API_KEY, key);
            if (apiWarningDot) apiWarningDot.style.display = 'none';
            updateApiKeyStatus(true, '金鑰儲存成功！');
        } else {
            localStorage.removeItem(STORAGE_KEYS.API_KEY);
            if (apiWarningDot) apiWarningDot.style.display = 'block';
            updateApiKeyStatus(false, '金鑰已清除');
            resetModelSelectToDefault();
            updateModelDetails();
        }
        
        if (settingsStatus) {
            settingsStatus.className = 'api-key-status success';
            settingsStatus.textContent = '設定儲存成功！正在連線載入雲端資料...';
        }
        
        if (syncProvider === 'google') {
            syncToGoogleDrive();
        }
        
        await loadFromStorage();
        updateBulkMoveSelectOptions();
        renderNotebooksList();
        updateWorkspaceView();
        
        setTimeout(() => {
            if (settingsStatus) settingsStatus.textContent = '';
            if (settingsModal) settingsModal.style.display = 'none';
        }, 1200);
    });
}

// Model selection change
// Model selection change
if (modelSelect) {
    modelSelect.addEventListener('change', () => {
        localStorage.setItem(STORAGE_KEYS.MODEL, modelSelect.value);
        updateModelDetails();
    });
}

// Sync Provider Logic (Google Only)
const googleLoginBtn = document.getElementById('google-login-btn');
const overlayGoogleLoginBtn = document.getElementById('overlay-google-login-btn');

const handleGoogleLogin = () => {
    if (!GOOGLE_CLIENT_ID) {
        alert('請先在 app.js 頂端設定 GOOGLE_CLIENT_ID 才能使用 Google 登入功能！');
        return;
    }
    if (googleTokenClient) {
        googleTokenClient.requestAccessToken({prompt: 'consent'});
    }
};

if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', handleGoogleLogin);
}
if (overlayGoogleLoginBtn) {
    overlayGoogleLoginBtn.addEventListener('click', handleGoogleLogin);
}

if (toggleApiKeyBtn) {
    toggleApiKeyBtn.addEventListener('click', () => {
        const isPassword = apiKeyInput.type === 'password';
        apiKeyInput.type = isPassword ? 'text' : 'password';
        toggleApiKeyBtn.innerHTML = isPassword ? '<i class="fa-solid fa-eye"></i>' : '<i class="fa-solid fa-eye-slash"></i>';
    });
}



// Notebook Management
if (createNotebookBtn) {
    createNotebookBtn.addEventListener('click', createNotebook);
}

if (currentNotebookTitle) {
    currentNotebookTitle.addEventListener('blur', saveNotebookTitle);
    currentNotebookTitle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            currentNotebookTitle.blur();
        }
    });
}

// Entry Input Events
if (sendNoteBtn) {
    sendNoteBtn.addEventListener('click', addEntry);
}

if (noteTextarea) {
    noteTextarea.addEventListener('keydown', (e) => {
        // Send on Enter, Line break on Shift+Enter
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            addEntry();
        }
    });
}

// Finalize Action
if (finalizeBtn) {
    finalizeBtn.addEventListener('click', generateReport);
}

// Report Actions
if (copyReportBtn) {
    copyReportBtn.addEventListener('click', copyReport);
}
if (downloadReportBtn) {
    downloadReportBtn.addEventListener('click', downloadReport);
}

// Settings Modal Toggle Logic
if (openSettingsBtn) {
    openSettingsBtn.addEventListener('click', () => {
        if (settingsModal) settingsModal.style.display = 'flex';
        if (settingsStatus) {
            settingsStatus.className = 'api-key-status';
            settingsStatus.textContent = localStorage.getItem(STORAGE_KEYS.API_KEY) ? '金鑰已載入' : '';
        }
        loadSettingsFromStorage();
        if (apiKeyInput) apiKeyInput.focus();
    });
}

if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', () => {
        if (settingsModal) settingsModal.style.display = 'none';
    });
}

// Close modal when clicking outside the content
if (settingsModal) {
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.style.display = 'none';
        }
    });
}

// Trash Modal Toggles
if (openTrashBtn) {
    openTrashBtn.addEventListener('click', () => {
        if (trashModal) trashModal.style.display = 'flex';
        renderTrashList();
    });
}

if (closeTrashBtn) {
    closeTrashBtn.addEventListener('click', () => {
        if (trashModal) trashModal.style.display = 'none';
    });
}

if (trashModal) {
    trashModal.addEventListener('click', (e) => {
        if (e.target === trashModal) {
            trashModal.style.display = 'none';
        }
    });
}

// Trash Tab Toggles
if (tabTrashEntries) {
    tabTrashEntries.addEventListener('click', () => {
        activeTrashTab = 'entries';
        tabTrashEntries.classList.add('active');
        if (tabTrashNotebooks) tabTrashNotebooks.classList.remove('active');
        renderTrashList();
    });
}

if (tabTrashNotebooks) {
    tabTrashNotebooks.addEventListener('click', () => {
        activeTrashTab = 'notebooks';
        tabTrashNotebooks.classList.add('active');
        if (tabTrashEntries) tabTrashEntries.classList.remove('active');
        renderTrashList();
    });
}

// Empty Trash Button
if (emptyTrashBtn) {
    emptyTrashBtn.addEventListener('click', emptyTrash);
}

// Theme select listener
if (themeSelect) {
    themeSelect.addEventListener('change', () => {
        const selectedTheme = themeSelect.value;
        localStorage.setItem(STORAGE_KEYS.THEME, selectedTheme);
        document.body.setAttribute('data-theme', selectedTheme);
    });
}

// Folder & Bulk select button event listeners
const createFolderBtn = document.getElementById('create-folder-btn');
if (createFolderBtn) {
    createFolderBtn.addEventListener('click', createFolder);
}

const toggleBulkSelectBtn = document.getElementById('toggle-bulk-select-btn');
if (toggleBulkSelectBtn) {
    toggleBulkSelectBtn.addEventListener('click', toggleBulkSelect);
}

const bulkSelectAllBtn = document.getElementById('bulk-select-all-btn');
if (bulkSelectAllBtn) {
    bulkSelectAllBtn.addEventListener('click', bulkSelectAll);
}

const bulkDeleteBtnFloating = document.getElementById('bulk-delete-btn-floating');
if (bulkDeleteBtnFloating) {
    bulkDeleteBtnFloating.addEventListener('click', bulkDelete);
}

const bulkMoveBtnFloating = document.getElementById('bulk-move-btn-floating');
if (bulkMoveBtnFloating) {
    bulkMoveBtnFloating.addEventListener('click', () => {
        const container = document.getElementById('bulk-move-floating-select-container');
        container.style.display = container.style.display === 'none' ? 'flex' : 'none';
    });
}

const bulkMoveConfirmBtn = document.getElementById('bulk-move-confirm-btn');
if (bulkMoveConfirmBtn) {
    bulkMoveConfirmBtn.addEventListener('click', bulkMove);
}

const bulkMergeBtnFloating = document.getElementById('bulk-merge-btn-floating');
if (bulkMergeBtnFloating) {
    bulkMergeBtnFloating.addEventListener('click', bulkMergeReports);
}

// New Bulk actions floating bar integrations
const bulkRenameBtnFloating = document.getElementById('bulk-rename-btn-floating');
if (bulkRenameBtnFloating) {
    bulkRenameBtnFloating.addEventListener('click', openBulkRenameModal);
}

const bulkCloneBtnFloating = document.getElementById('bulk-clone-btn-floating');
if (bulkCloneBtnFloating) {
    bulkCloneBtnFloating.addEventListener('click', bulkClone);
}

const bulkExportBtnFloating = document.getElementById('bulk-export-btn-floating');
if (bulkExportBtnFloating) {
    bulkExportBtnFloating.addEventListener('click', bulkExport);
}

// Custom Right click context menu actions bindings
document.getElementById('ctx-select-all')?.addEventListener('click', bulkSelectAll);
document.getElementById('ctx-rename')?.addEventListener('click', openBulkRenameModal);
document.getElementById('ctx-clone')?.addEventListener('click', bulkClone);
document.getElementById('ctx-export')?.addEventListener('click', bulkExport);
document.getElementById('ctx-merge')?.addEventListener('click', bulkMergeReports);
document.getElementById('ctx-delete')?.addEventListener('click', bulkDelete);

// AI Merge Modal triggers
document.getElementById('close-merge-modal-btn')?.addEventListener('click', () => {
    document.getElementById('bulk-merge-modal').style.display = 'none';
});
document.getElementById('cancel-merge-modal-btn')?.addEventListener('click', () => {
    document.getElementById('bulk-merge-modal').style.display = 'none';
});
document.getElementById('confirm-merge-modal-btn')?.addEventListener('click', executeBulkMerge);

// Rename Modal triggers
document.getElementById('close-rename-modal-btn')?.addEventListener('click', closeBulkRenameModal);
document.getElementById('cancel-rename-modal-btn')?.addEventListener('click', closeBulkRenameModal);
document.getElementById('confirm-rename-modal-btn')?.addEventListener('click', executeBulkRename);

// Rename Radio inputs toggle state handlers
document.querySelectorAll('input[name="rename-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        const mode = e.target.value;
        
        document.getElementById('prefix-suffix-inputs').style.opacity = mode === 'prefix-suffix' ? '1' : '0.5';
        document.getElementById('rename-prefix').disabled = mode !== 'prefix-suffix';
        document.getElementById('rename-suffix').disabled = mode !== 'prefix-suffix';
        
        document.getElementById('replace-inputs').style.opacity = mode === 'replace' ? '1' : '0.5';
        document.getElementById('rename-find').disabled = mode !== 'replace';
        document.getElementById('rename-replace').disabled = mode !== 'replace';
        
        document.getElementById('series-inputs').style.opacity = mode === 'series' ? '1' : '0.5';
        document.getElementById('rename-base').disabled = mode !== 'series';
    });
});

// Undo actions bindings
document.getElementById('undo-toast-btn')?.addEventListener('click', triggerUndo);

// Window keyboard listener for shortcuts & context dismissal
window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
    }
    
    if (isBulkSelectMode) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
            e.preventDefault();
            bulkSelectAll();
        }
        if (e.key === 'Delete') {
            e.preventDefault();
            bulkDelete();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            toggleBulkSelect();
        }
    }
    if (e.key === 'Escape') {
        const ctxMenu = document.getElementById('custom-context-menu');
        if (ctxMenu) ctxMenu.style.display = 'none';
        
        document.getElementById('bulk-merge-modal').style.display = 'none';
        document.getElementById('bulk-rename-modal').style.display = 'none';
    }
});

// Dismiss context menu on click outside
document.addEventListener('click', (e) => {
    const ctxMenu = document.getElementById('custom-context-menu');
    if (ctxMenu && !e.target.closest('#custom-context-menu')) {
        ctxMenu.style.display = 'none';
    }
});

// Prevent browser default right-click menu except in editable elements
document.addEventListener('contextmenu', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
    }
    e.preventDefault();
});

// --- Subject & Dashboard Functions ---

function downloadTextFile(content, filename) {
    const cleanFilename = filename.replace(/[\/\\:\*\?"<>\|]/g, '_');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = cleanFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Render Subject Circles in leftmost panel
function renderSubjectsList() {
    const subjectListContainer = document.getElementById('subject-list');
    if (!subjectListContainer) return;
    subjectListContainer.innerHTML = '';
    
    subjects.forEach(subject => {
        const wrapper = document.createElement('div');
        wrapper.className = `subject-item-wrapper ${subject.id === currentSubjectId ? 'active' : ''}`;
        wrapper.dataset.id = subject.id;
        
        const displaySymbol = subject.icon ? subject.icon : (subject.name ? subject.name.substring(0, 2) : '無');
        
        wrapper.innerHTML = `
            <div class="subject-indicator-pill"></div>
            <div class="subject-item-circle" title="${escapeHtml(subject.name)}">${escapeHtml(displaySymbol)}</div>
        `;
        
        wrapper.addEventListener('click', () => {
            selectSubject(subject.id);
        });
        
        subjectListContainer.appendChild(wrapper);
    });
    
    const activeSub = subjects.find(s => s.id === currentSubjectId);
    if (activeSub) {
        const nameEl = document.getElementById('current-subject-name');
        const iconEl = document.getElementById('current-subject-icon');
        if (nameEl) nameEl.textContent = activeSub.name;
        if (iconEl) iconEl.textContent = activeSub.icon || '📝';
    }
}

// Select Active Subject
function selectSubject(id) {
    currentSubjectId = id;
    currentFolderId = null;
    currentNotebookId = null;
    
    renderSubjectsList();
    renderNotebooksList();
    updateWorkspaceView();
    showDashboard('subject', id);
}

// Create new Subject
function createSubject(name, icon) {
    if (!name.trim()) return;
    
    const newSubject = {
        id: generateId(),
        name: name.trim(),
        icon: icon.trim() || '💡',
        report: null,
        report_created_at: null,
        created_at: formatDateTime(new Date())
    };
    
    subjects.push(newSubject);
    saveSubjectsToStorage();
    selectSubject(newSubject.id);
}

// Select Folder for dashboard view (AI summary of folder)
function selectFolderForDashboard(folderId) {
    currentFolderId = folderId;
    currentNotebookId = null;
    
    renderNotebooksList();
    updateWorkspaceView();
    showDashboard('folder', folderId);
}

// Show Dashboard inside main panel
function showDashboard(type, id) {
    const dashboardState = document.getElementById('dashboard-state');
    const emptyState = document.getElementById('empty-state');
    const workspace = document.getElementById('workspace');
    
    if (!dashboardState) return;
    
    if (emptyState) emptyState.style.display = 'none';
    if (workspace) workspace.style.display = 'none';
    dashboardState.style.display = 'flex';
    
    let title = '';
    let report = null;
    let foldersCount = 0;
    let notebooksCount = 0;
    let entriesCount = 0;
    let activeEntriesCount = 0;
    let finalizedEntriesCount = 0;
    
    if (type === 'subject') {
        const subject = subjects.find(s => s.id === id);
        if (!subject) return;
        
        title = `${subject.icon || '📝'} ${subject.name}`;
        report = subject.report;
        
        const subFolders = folders.filter(f => f.subjectId === id);
        foldersCount = subFolders.length;
        
        const subNotebooks = notebooks.filter(n => n.subjectId === id);
        notebooksCount = subNotebooks.length;
        
        const notebookIds = new Set(subNotebooks.map(n => n.id));
        const subEntries = entries.filter(e => notebookIds.has(e.notebook_id));
        entriesCount = subEntries.length;
        
        const activeNotebooks = subNotebooks.filter(n => n.status !== 'finalized');
        const finalizedNotebooks = subNotebooks.filter(n => n.status === 'finalized');
        activeEntriesCount = subEntries.filter(e => activeNotebooks.some(n => n.id === e.notebook_id)).length;
        finalizedEntriesCount = subEntries.filter(e => finalizedNotebooks.some(n => n.id === e.notebook_id)).length;
        
        document.getElementById('dashboard-meta').textContent = `包含 ${foldersCount} 個資料夾，${entriesCount} 條隨筆`;
        
        const aiBtn = document.getElementById('dashboard-ai-btn');
        aiBtn.onclick = () => generateSubjectReport(id);
        
    } else if (type === 'folder') {
        const folder = folders.find(f => f.id === id);
        if (!folder) return;
        
        title = `📂 ${folder.name}`;
        report = folder.report;
        
        foldersCount = 1;
        
        const folderNotebooks = notebooks.filter(n => n.folderId === id);
        notebooksCount = folderNotebooks.length;
        
        const notebookIds = new Set(folderNotebooks.map(n => n.id));
        const folderEntries = entries.filter(e => notebookIds.has(e.notebook_id));
        entriesCount = folderEntries.length;
        
        const activeNotebooks = folderNotebooks.filter(n => n.status !== 'finalized');
        const finalizedNotebooks = folderNotebooks.filter(n => n.status === 'finalized');
        activeEntriesCount = folderEntries.filter(e => activeNotebooks.some(n => n.id === e.notebook_id)).length;
        finalizedEntriesCount = folderEntries.filter(e => finalizedNotebooks.some(n => n.id === e.notebook_id)).length;
        
        document.getElementById('dashboard-meta').textContent = `包含 ${entriesCount} 條隨筆`;
        
        const aiBtn = document.getElementById('dashboard-ai-btn');
        aiBtn.onclick = () => generateFolderReport(id);
    }
    
    document.getElementById('dashboard-title').textContent = title;
    
    // Update dashboard statistics cards
    const foldersCountEl = document.getElementById('stat-folders-count');
    const entriesCountEl = document.getElementById('stat-entries-count');
    const activeEntriesEl = document.getElementById('stat-entries-active-count');
    const finalizedEntriesEl = document.getElementById('stat-entries-finalized-count');
    
    if (foldersCountEl) foldersCountEl.textContent = foldersCount;
    if (entriesCountEl) entriesCountEl.textContent = entriesCount;
    if (activeEntriesEl) activeEntriesEl.textContent = activeEntriesCount;
    if (finalizedEntriesEl) finalizedEntriesEl.textContent = finalizedEntriesCount;
    
    const reportPanel = document.getElementById('dashboard-report-panel');
    const reportEmpty = document.getElementById('dashboard-report-empty');
    const reportContent = document.getElementById('dashboard-report-content');
    
    if (report) {
        reportPanel.style.display = 'block';
        reportEmpty.style.display = 'none';
        reportContent.innerHTML = marked.parse(report);
        
        document.getElementById('dashboard-copy-report-btn').onclick = () => {
            navigator.clipboard.writeText(report).then(() => {
                alert('報告已複製到剪貼簿！');
            });
        };
        document.getElementById('dashboard-download-report-btn').onclick = () => {
            downloadTextFile(report, `${title.replace(/[\s\/\\]/g, '_')}_AI報告.md`);
        };
    } else {
        reportPanel.style.display = 'none';
        reportEmpty.style.display = 'flex';
    }
}

// Generate AI Report for Subject
async function generateSubjectReport(subjectId) {
    const apiKey = localStorage.getItem(STORAGE_KEYS.API_KEY);
    if (!apiKey) {
        alert('未偵測到 API 金鑰，請先在「系統與 AI 設定」中輸入並儲存您的 Gemini API 金鑰！');
        const settingsModal = document.getElementById('settings-modal');
        if (settingsModal) settingsModal.style.display = 'flex';
        return;
    }
    
    const subject = subjects.find(s => s.id === subjectId);
    if (!subject) return;
    
    const subNotebooks = notebooks.filter(n => n.subjectId === subjectId);
    if (subNotebooks.length === 0) {
        alert('此主題下沒有任何筆記本！');
        return;
    }
    
    const notebookIds = new Set(subNotebooks.map(n => n.id));
    const subEntries = entries.filter(e => notebookIds.has(e.notebook_id));
    if (subEntries.length === 0) {
        alert('此主題下沒有任何隨筆筆記！請先新增一些筆記內容再進行整理。');
        return;
    }
    
    loadingOverlay.style.display = 'flex';
    
    try {
        let notesText = '';
        subNotebooks.forEach(nb => {
            const nbEntries = subEntries.filter(e => e.notebook_id === nb.id);
            if (nbEntries.length > 0) {
                notesText += `### 筆記本：${nb.title}\n`;
                notesText += nbEntries.map(e => `[時間：${e.created_at}] ${e.content}`).join('\n');
                notesText += '\n\n';
            }
        });
        
        const systemPrompt = `你是一位專業且貼心的隨身智能助理。以下是使用者在整個主題分類「${subject.name}」中多個筆記本內的零碎隨手筆記。
請你幫忙進行跨筆記本的全局宏觀邏輯整合，理清條理，撰寫成一份高階主題整合工作匯報。

請嚴格遵循以下匯報格式要求：
1. 請以「Markdown」格式進行輸出。
2. 匯報結構必須包含：
   - # 🏷️主題整合工作報告：${subject.name}
   - ## 📋 全局概覽
     (簡短整合總結該主題下的核心任務重點、進度與當前狀況)
   - ## 🔍 各項目/筆記本主要內容整合
     (依照不同筆記本或內容主題，分成幾個大項目，條列出具體進度、重要筆記與成果)
   - ## 🚀 行動建議與下一步代辦
     (從所有筆記中提煉出下一步明確的 Action Items 待辦清單，給出宏觀的工作建議)
   - ## 💡 助理全局觀察
     (分析使用者的工作步調，提供貼心的建議、健康關懷或正向反饋)
3. 報告內文請維持簡潔、專業與條理。`;

        const userPrompt = `主題分類：${subject.name}
建立時間：${subject.created_at}

【跨筆記本整合筆記】：
${notesText}`;

        const selectedValue = localStorage.getItem(STORAGE_KEYS.MODEL) || 'gemini-2.5-flash';
        const modelInfo = MODEL_REGISTRY[selectedValue] || { id: selectedValue };
        const cleanModelName = modelInfo.id.replace('models/', '');
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModelName}:generateContent?key=${apiKey}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
        
        subject.report = reportMarkdown;
        subject.report_created_at = formatDateTime(new Date());
        
        saveSubjectsToStorage();
        showDashboard('subject', subjectId);
        alert('🎉 AI 主題整合摘要報告生成成功！');
        
    } catch (error) {
        console.error('Gemini API Error:', error);
        alert(`主題整合報告生成失敗：\n${error.message}`);
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

// Generate AI Report for Folder
async function generateFolderReport(folderId) {
    const apiKey = localStorage.getItem(STORAGE_KEYS.API_KEY);
    if (!apiKey) {
        alert('未偵測到 API 金鑰，請先在「系統與 AI 設定」中輸入並儲存您的 Gemini API 金鑰！');
        const settingsModal = document.getElementById('settings-modal');
        if (settingsModal) settingsModal.style.display = 'flex';
        return;
    }
    
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;
    
    const folderNotebooks = notebooks.filter(n => n.folderId === folderId);
    if (folderNotebooks.length === 0) {
        alert('此資料夾下沒有任何筆記本！');
        return;
    }
    
    const notebookIds = new Set(folderNotebooks.map(n => n.id));
    const folderEntries = entries.filter(e => notebookIds.has(e.notebook_id));
    if (folderEntries.length === 0) {
        alert('此資料夾下沒有任何隨筆筆記！請先新增一些筆記內容再進行整理。');
        return;
    }
    
    loadingOverlay.style.display = 'flex';
    
    try {
        let notesText = '';
        folderNotebooks.forEach(nb => {
            const nbEntries = folderEntries.filter(e => e.notebook_id === nb.id);
            if (nbEntries.length > 0) {
                notesText += `### 筆記本：${nb.title}\n`;
                notesText += nbEntries.map(e => `[時間：${e.created_at}] ${e.content}`).join('\n');
                notesText += '\n\n';
            }
        });
        
        const systemPrompt = `你是一位專業且貼心的隨身智能助理。以下是使用者在資料夾「${folder.name}」中多個筆記本內的隨手筆記。
請你幫忙將這些筆記內容進行邏輯整合，理清條理，撰寫成一份精緻的資料夾整合報告。

請嚴格遵循以下匯報格式要求：
1. 請以「Markdown」格式進行輸出。
2. 匯報結構必須包含：
   - # 📂資料夾整合工作報告：${folder.name}
   - ## 📋 資料夾內容概述
     (簡短總結該資料夾下所有筆記本的統合內容)
   - ## 🔍 分類重點條列
     (將所有筆記內容按屬性或性質分類，使用列點方式寫出核心進度與記錄)
   - ## 🚀 行動待辦與建議
     (提煉出下一步明確的待辦清單與時程安排建議)
   - ## 💡 助理貼心反饋
     (以溫暖親切的助理語氣，分析使用者的工作步調，提醒注意休息與加油打氣)
3. 報告內文請維持簡潔、專業與條理。`;

        const userPrompt = `資料夾名稱：${folder.name}

【整合隨筆列表】：
${notesText}`;

        const selectedValue = localStorage.getItem(STORAGE_KEYS.MODEL) || 'gemini-2.5-flash';
        const modelInfo = MODEL_REGISTRY[selectedValue] || { id: selectedValue };
        const cleanModelName = modelInfo.id.replace('models/', '');
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModelName}:generateContent?key=${apiKey}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
        
        folder.report = reportMarkdown;
        folder.report_created_at = formatDateTime(new Date());
        
        saveFoldersToStorage();
        showDashboard('folder', folderId);
        alert('🎉 AI 資料夾整合摘要報告生成成功！');
        
    } catch (error) {
        console.error('Gemini API Error:', error);
        alert(`資料夾整合報告生成失敗：\n${error.message}`);
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

// Bind Subject Events
const subjectHeaderDropdown = document.getElementById('subject-header-dropdown');
const subjectActionsMenu = document.getElementById('subject-actions-menu');
if (subjectHeaderDropdown && subjectActionsMenu) {
    subjectHeaderDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = subjectActionsMenu.style.display === 'block';
        subjectActionsMenu.style.display = isOpen ? 'none' : 'block';
        subjectHeaderDropdown.classList.toggle('open', !isOpen);
    });
}

document.addEventListener('click', () => {
    if (subjectActionsMenu) {
        subjectActionsMenu.style.display = 'none';
        if (subjectHeaderDropdown) subjectHeaderDropdown.classList.remove('open');
    }
});

const addSubjectBtn = document.getElementById('add-subject-btn');
const subjectModal = document.getElementById('subject-modal');
const closeSubjectModalBtn = document.getElementById('close-subject-modal-btn');
const cancelSubjectModalBtn = document.getElementById('cancel-subject-modal-btn');
const confirmSubjectModalBtn = document.getElementById('confirm-subject-modal-btn');
const subjectNameInput = document.getElementById('subject-name-input');
const subjectIconInput = document.getElementById('subject-icon-input');

if (addSubjectBtn && subjectModal) {
    addSubjectBtn.addEventListener('click', () => {
        subjectNameInput.value = '';
        subjectIconInput.value = '💡';
        subjectModal.style.display = 'flex';
        subjectNameInput.focus();
    });
}

if (closeSubjectModalBtn) {
    closeSubjectModalBtn.addEventListener('click', () => {
        subjectModal.style.display = 'none';
    });
}

if (cancelSubjectModalBtn) {
    cancelSubjectModalBtn.addEventListener('click', () => {
        subjectModal.style.display = 'none';
    });
}

if (subjectModal) {
    subjectModal.addEventListener('click', (e) => {
        if (e.target === subjectModal) {
            subjectModal.style.display = 'none';
        }
    });
}

document.querySelectorAll('.emoji-suggest-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (subjectIconInput) subjectIconInput.value = btn.textContent;
    });
});

if (confirmSubjectModalBtn) {
    confirmSubjectModalBtn.addEventListener('click', () => {
        const name = subjectNameInput.value.trim();
        const icon = subjectIconInput.value.trim();
        if (!name) {
            alert('請輸入主題名稱！');
            return;
        }
        createSubject(name, icon);
        subjectModal.style.display = 'none';
    });
}

const renameSubjectBtn = document.getElementById('rename-subject-btn');
if (renameSubjectBtn) {
    renameSubjectBtn.addEventListener('click', () => {
        const activeSub = subjects.find(s => s.id === currentSubjectId);
        if (!activeSub) return;
        
        const newName = prompt('請輸入主題分類的新名稱：', activeSub.name);
        if (newName && newName.trim()) {
            activeSub.name = newName.trim();
            saveSubjectsToStorage();
            renderSubjectsList();
            showDashboard('subject', currentSubjectId);
        }
    });
}

const subjectSummaryBtn = document.getElementById('subject-summary-btn');
if (subjectSummaryBtn) {
    subjectSummaryBtn.addEventListener('click', () => {
        generateSubjectReport(currentSubjectId);
    });
}

const deleteSubjectBtn = document.getElementById('delete-subject-btn');
if (deleteSubjectBtn) {
    deleteSubjectBtn.addEventListener('click', () => {
        if (subjects.length <= 1) {
            alert('這是您唯一的筆記主題，無法刪除！');
            return;
        }
        const activeSub = subjects.find(s => s.id === currentSubjectId);
        if (confirm(`確定要刪除主題分類「${activeSub.name}」嗎？\n該主題下的所有資料夾與筆記本將會被移入「資源回收桶」！`)) {
            const subNotebooks = notebooks.filter(n => n.subjectId === currentSubjectId);
            subNotebooks.forEach(nb => {
                deleteNotebook(nb.id);
            });
            folders = folders.filter(f => f.subjectId !== currentSubjectId);
            saveFoldersToStorage();
            
            subjects = subjects.filter(s => s.id !== currentSubjectId);
            saveSubjectsToStorage();
            
            selectSubject(subjects[0].id);
        }
    });
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    await loadFromStorage();
    updateBulkMoveSelectOptions();
    renderNotebooksList();
    updateWorkspaceView();

    // Check if Google APIs loaded before app.js executed
    if (typeof gapi !== 'undefined') {
        gapiLoaded();
    }
    if (typeof google !== 'undefined' && typeof google.accounts !== 'undefined') {
        gisLoaded();
    }
    
    // Bind context menu listener to notebooks list
    if (notebooksList) {
        notebooksList.addEventListener('contextmenu', showContextMenu);
        
        notebooksList.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!e.target.closest('.folder-header')) {
                notebooksList.classList.add('drag-hover');
            } else {
                notebooksList.classList.remove('drag-hover');
            }
        });
        
        notebooksList.addEventListener('dragleave', (e) => {
            if (e.target === notebooksList || !notebooksList.contains(e.relatedTarget)) {
                notebooksList.classList.remove('drag-hover');
            }
        });
        
        notebooksList.addEventListener('drop', (e) => {
            e.preventDefault();
            notebooksList.classList.remove('drag-hover');
            
            if (!e.target.closest('.folder-header')) {
                try {
                    const ids = JSON.parse(e.dataTransfer.getData('text/plain'));
                    if (Array.isArray(ids)) {
                        const moves = [];
                        ids.forEach(id => {
                            const nb = notebooks.find(n => n.id === id);
                            if (nb) {
                                moves.push({ notebookId: id, previousFolderId: nb.folderId });
                                nb.folderId = null;
                            }
                        });
                        if (moves.length > 0) {
                            undoCache = { action: 'move', moves: moves };
                            showUndoToast('move', `已將 ${moves.length} 本筆記本移出資料夾。`);
                        }
                        saveNotebooksToStorage();
                        renderNotebooksList();
                        updateBulkMoveSelectOptions();
                    }
                } catch (err) {
                    const notebookId = e.dataTransfer.getData('text/plain');
                    const notebook = notebooks.find(nb => nb.id === notebookId);
                    if (notebook && notebook.folderId !== null) {
                        undoCache = {
                            action: 'move',
                            moves: [{ notebookId: notebook.id, previousFolderId: notebook.folderId }]
                        };
                        notebook.folderId = null;
                        showUndoToast('move', `已將筆記本「${notebook.title}」移出資料夾。`);
                        saveNotebooksToStorage();
                        renderNotebooksList();
                        updateBulkMoveSelectOptions();
                    }
                }
            }
        });
    }
});

// --- Mobile Navigation Logic ---
const mobileMenuBtnDashboard = document.getElementById('mobile-menu-btn-dashboard');
const mobileMenuBtnWorkspace = document.getElementById('mobile-menu-btn-workspace');
const mobileNavBackdrop = document.getElementById('mobile-nav-backdrop');

function toggleMobileNav() {
    document.body.classList.toggle('mobile-nav-open');
}

function closeMobileNav() {
    document.body.classList.remove('mobile-nav-open');
}

if (mobileMenuBtnDashboard) mobileMenuBtnDashboard.addEventListener('click', toggleMobileNav);
if (mobileMenuBtnWorkspace) mobileMenuBtnWorkspace.addEventListener('click', toggleMobileNav);
if (mobileNavBackdrop) mobileNavBackdrop.addEventListener('click', closeMobileNav);

// Touch Swipe Gestures for Discord-style Sidebar
let touchStartX = 0;
document.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

document.addEventListener('touchend', e => {
    let touchEndX = e.changedTouches[0].screenX;
    const swipeThreshold = 50; // minimum distance
    
    // Swipe Right to Open (Only if started near left edge)
    if (touchEndX - touchStartX > swipeThreshold && touchStartX < 40) {
        document.body.classList.add('mobile-nav-open');
    }
    
    // Swipe Left to Close
    if (touchStartX - touchEndX > swipeThreshold && document.body.classList.contains('mobile-nav-open')) {
        closeMobileNav();
    }
}, { passive: true });
const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // --- Authentication --- 
  login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
  register: (userData) => ipcRenderer.invoke('auth:register', userData),

  // --- Folders --- 
  getFolders: (userId) => ipcRenderer.invoke('folders:get', userId),
  createFolder: (name, userId) => ipcRenderer.invoke('folders:create', name, userId),
  deleteFolder: (folderId) => ipcRenderer.invoke('folders:delete', folderId),

  // --- Notes --- 
  getNotesInFolder: (folderId) => ipcRenderer.invoke('notes:get-in-folder', folderId),
  createNote: (noteData) => ipcRenderer.invoke('notes:create', noteData),
  updateNote: (noteId, content) => ipcRenderer.invoke('notes:update', noteId, content),
  deleteNote: (noteId) => ipcRenderer.invoke('notes:delete', noteId),

  // Add more API endpoints as needed
});

console.log('Preload script loaded.'); 
// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

document.addEventListener('DOMContentLoaded', () => {
    console.log('Renderer script loaded.');

    // DOM Elements
    const authView = document.getElementById('auth-view');
    const mainAppView = document.getElementById('main-app-view');
    const loginButton = document.getElementById('login-button');
    const registerButton = document.getElementById('register-button');
    const loginUsernameInput = document.getElementById('login-username');
    const loginPasswordInput = document.getElementById('login-password');
    const registerUsernameInput = document.getElementById('register-username');
    const registerEmailInput = document.getElementById('register-email');
    const registerPasswordInput = document.getElementById('register-password');
    const authMessage = document.getElementById('auth-message');
    const loginSection = document.getElementById('login-section');
    const registerSection = document.getElementById('register-section');
    const showRegisterLink = document.getElementById('show-register');
    const showLoginLink = document.getElementById('show-login');
    const logoutButton = document.getElementById('logout-button');
    const toolbarContainer = document.getElementById('toolbar'); // Get toolbar container

    // Sidebar/Tree elements
    const fileTree = document.getElementById('file-tree'); // The main UL for the tree
    const addFolderButton = document.getElementById('add-folder-button');
    const addNoteButton = document.getElementById('add-note-button');

    // Editor elements
    const editorContainer = document.getElementById('editor-container');

    // Modal elements
    const inputModal = document.getElementById('input-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalInput = document.getElementById('modal-input');
    const modalConfirmButton = document.getElementById('modal-confirm-button');
    const modalCancelButton = document.getElementById('modal-cancel-button');
    const modalCloseButton = inputModal.querySelector('.close-button');
    const modalError = document.getElementById('modal-error');
    const confirmModal = document.getElementById('confirm-modal');
    const confirmModalText = document.getElementById('confirm-modal-text');
    const confirmModalConfirmButton = document.getElementById('confirm-modal-confirm-button');
    const confirmModalCancelButton = document.getElementById('confirm-modal-cancel-button');
    const confirmModalCloseButton = confirmModal.querySelector('.close-button');

    // Link modal elements
    const linkModal = document.getElementById('link-modal');
    const linkUrlInput = document.getElementById('link-url');
    const linkTextInput = document.getElementById('link-text');
    const linkError = document.getElementById('link-error');
    const linkConfirmButton = document.getElementById('link-confirm-button');
    const linkCancelButton = document.getElementById('link-cancel-button');
    const linkCloseButton = linkModal.querySelector('.close-button');
    let linkModalResolve = null;

    let currentFolderId = null; // Tracks the ID of the folder context (either selected folder or parent of selected note)
    let currentNoteId = null;
    let quill = null;
    let saveTimeout = null;
    let editorContentChangedSinceLoad = false;
    let currentlySelectedItemId = null; // Tracks selected folder OR note ID in the tree
    let expandedFolders = new Set(); // Tracks IDs of expanded folders
    let modalResolve = null; // Store the resolve function for the modal promise
    let currentUserId = null;
    let fileSystemData = { folders: [], notes: {} };
    let confirmModalResolve = null; // For confirmation modal promise
    const saveIndicator = document.getElementById('save-indicator');

    // --- Quill Editor Initialization --- (No changes)
    function initializeQuill() {
        // Check if Quill is already initialized
        if (quill) {
            console.log("Quill already initialized. Enabling.");
            // Optionally re-enable or clear if needed, but the main issue is toolbar duplication
             if (!quill.isEnabled()) {
                 quill.enable();
             }
             // Clear placeholder if necessary
             if (editorContainer.classList.contains('show-placeholder')) {
                 editorContainer.classList.remove('show-placeholder');
             }
             // Focus editor if a note was selected? (Might need state check)
            return; // Exit if already initialized
        }

        console.log("Initializing Quill editor...");
        const toolbarOptions = [
            [{'header': [1, 2, 3, 4, 5, 6, false]}],
            [{'font': []}],
            [{'size': ['small', false, 'large', 'huge']}],
            ['bold', 'italic', 'underline', 'strike'],
            [{'color': []}, {'background': []}],
            [{'script': 'sub'}, {'script': 'super'}],
            [{'list': 'ordered'}, {'list': 'bullet'}],
            [{'indent': '-1'}, {'indent': '+1'}],
            [{'direction': 'rtl'}],
            [{'align': []}],
            ['blockquote'],
            ['link'],
            ['clean']
        ];

        quill = new Quill('#editor', {
            modules: {
                toolbar: {
                    container: toolbarOptions,
                    handlers: {
                        link: function() {
                            showLinkModal();
                        }
                    }
                }
            },
            theme: 'snow',
            placeholder: 'Start writing your note here...',
            spellcheck: false,
            formats: [
                'header', 'font', 'size', 'bold', 'italic', 'underline', 'strike',
                'color', 'background', 'script', 'list', 'bullet', 'indent',
                'direction', 'align', 'blockquote', 'link'
            ]
        });
        
        // Ensure proper handling of content
        quill.disable();
        quill.on('text-change', (delta, oldDelta, source) => {
            if (source === 'user') {
                editorContentChangedSinceLoad = true;
                handleAutoSave();
            }
        });
        
        // Add custom clipboard handling to preserve formatting
        quill.clipboard.addMatcher(Node.ELEMENT_NODE, function(node, delta) {
            // Preserve formatting when pasting content
            return delta;
        });
    }

    // --- Authentication Logic --- (Updated)
    loginButton.addEventListener('click', async () => {
        const username = loginUsernameInput.value;
        const password = loginPasswordInput.value;
        authMessage.textContent = 'Logging in...';
        loginButton.disabled = true;
        registerButton.disabled = true;
        try {
            const result = await window.electronAPI.login({ username, password });
            authMessage.textContent = result.message;
            if (result.success) {
                currentUserId = result.userId; // Store the logged-in user ID
                console.log("Logged in user ID:", currentUserId);
                showMainApp();
                initializeQuill();
                await loadInitialData(); // Fetch initial folders and notes
            }
        } catch (error) {
            console.error('Login error:', error);
            authMessage.textContent = `Login failed: ${error?.message || 'Unknown error'}`;
        } finally {
            loginButton.disabled = false;
            registerButton.disabled = false;
        }
    });

    registerButton.addEventListener('click', async () => {
        const username = registerUsernameInput.value;
        const email = registerEmailInput.value;
        const password = registerPasswordInput.value;
         if (!username || !email || !password) {
            authMessage.textContent = 'Please fill in all registration fields.';
            return;
         }
        authMessage.textContent = 'Registering...';
        loginButton.disabled = true;
        registerButton.disabled = true;
        try {
            const result = await window.electronAPI.register({ username, email, password });
            authMessage.textContent = result.message;
            if (result.success) {
                registerUsernameInput.value = '';
                registerEmailInput.value = '';
                registerPasswordInput.value = '';
            }
        } catch (error) {
            console.error('Registration error:', error);
             authMessage.textContent = `Registration failed: ${error?.message || 'Unknown error'}`;
        } finally {
            loginButton.disabled = false;
            registerButton.disabled = false;
        }
    });

    // --- Auth View Toggle Logic --- Added
    showRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginSection.style.display = 'none';
        registerSection.style.display = 'flex'; // Use flex to match CSS
        authMessage.textContent = ''; // Clear previous messages
    });

    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        registerSection.style.display = 'none';
        loginSection.style.display = 'flex'; // Use flex to match CSS
        authMessage.textContent = ''; // Clear previous messages
    });

    function showMainApp() {
        authView.style.display = 'none';
        mainAppView.style.display = 'flex'; // Set display to flex
        // Use setTimeout to allow the display change to render before starting opacity transition
        setTimeout(() => {
             mainAppView.classList.add('visible');
        }, 10); // Small delay
    }

    // --- Data Loading ---
    async function loadInitialData() {
        if (!currentUserId) { console.error("Cannot load data without user ID"); return; }
        console.log("Loading initial data for user:", currentUserId);
        try {
             fileTree.innerHTML = '<li style="padding-left: 15px; color: #888;">Loading explorer...</li>';
            // Fetch folders first - PASS USER ID
            const folderResult = await window.electronAPI.getFolders(currentUserId);
            if (!folderResult.success) {
                 throw new Error(folderResult.error || 'Failed to fetch folders');
            }
            fileSystemData.folders = folderResult.data || [];
            fileSystemData.notes = {}; // Reset notes cache

            // Fetch notes for all folders
            const notePromises = fileSystemData.folders.map(async (folder) => {
                 try {
                    const noteResult = await window.electronAPI.getNotesInFolder(folder._id);
                    if (noteResult.success) {
                        fileSystemData.notes[folder._id] = noteResult.data || [];
                    } else {
                        console.warn(`Failed to fetch notes for folder ${folder._id}:`, noteResult.error);
                        fileSystemData.notes[folder._id] = []; // Default to empty on error
                    }
                 } catch (noteError) {
                      console.error(`Error fetching notes for folder ${folder._id}:`, noteError);
                      fileSystemData.notes[folder._id] = []; // Default to empty on error
                 }
            });
            await Promise.all(notePromises);

            console.log("Initial data loaded:", fileSystemData);
            renderFileTree();
        } catch (error) {
            console.error("Error in loadInitialData:", error);
            fileTree.innerHTML = `<li style="padding-left: 15px; color: #f44336;">Error loading data: ${error.message}</li>`;
            // Disable add buttons if data loading failed
            currentFolderId = null;
            updateAddNoteButtonState();
        }
    }

    // --- File Tree Logic ---

    // Central function to update the state of the Add Note button
    function updateAddNoteButtonState() {
         // Enable if a folder is selected OR a note is selected (implying a folder context)
         const canAddNote = !!currentFolderId;
         addNoteButton.disabled = !canAddNote;
         if (!canAddNote) {
             addNoteButton.title = "Select a folder first";
         } else {
            const selectedFolder = fileSystemData.folders.find(f => f._id === currentFolderId);
            addNoteButton.title = selectedFolder ? `Add note to '${selectedFolder.name}'` : "Add note";
         }
    }

    function renderFileTree() {
        console.log('Rendering file tree from fileSystemData...');
        fileTree.innerHTML = ''; // Clear existing tree

        const folders = fileSystemData.folders;
        const notesMap = fileSystemData.notes;

        if (!folders || folders.length === 0) {
            const li = document.createElement('li');
            li.innerHTML = '<div style="padding-left: 15px; color: #888;">No folders yet. Click "New Folder" to add one.</div>';
            fileTree.appendChild(li);
        } else {
            const fragment = document.createDocumentFragment(); // Use fragment for performance
            folders.forEach(folder => {
                const folderLi = createTreeItem(folder, 'folder'); // Returns LI
                fragment.appendChild(folderLi);

                const notesInFolder = notesMap[folder._id] || [];
                notesInFolder.forEach(note => {
                    const noteLi = createTreeItem(note, 'note'); // Returns LI
                    fragment.appendChild(noteLi);
                });
            });
            fileTree.appendChild(fragment); // Append fragment once
        }
        applyTreeState();
        updateAddNoteButtonState();
        console.log('File tree rendered.');
    }

    function applyTreeState() {
         // ... (re-apply expanded state) ...

         // Reselect the previously selected item if it still exists
         if (currentlySelectedItemId) {
             const itemToSelect = fileTree.querySelector(`.tree-item[data-id="${currentlySelectedItemId}"]`);
             if (itemToSelect) {
                // Use the selectTreeItem defined later
                // Make sure selectTreeItem exists before calling it if applyTreeState is hoisted or called early
                if(typeof selectTreeItem === 'function') {
                   selectTreeItem(itemToSelect, false); // Reselect without triggering actions
                } else {
                    console.warn('selectTreeItem not defined yet when trying to reselect');
                }
             } else {
                 // Clear selection state if item no longer exists
                 currentlySelectedItemId = null;
                 currentFolderId = null;
                 currentNoteId = null;
             }
        } 
        // Removed the redundant `else if (folders.length > 0)` block here
        // as the next block handles selecting the first item if nothing is selected.

         // If nothing is selected after re-render, select the first folder
          if (!currentlySelectedItemId && fileSystemData.folders && fileSystemData.folders.length > 0) { // Use fileSystemData.folders
              const firstFolder = fileTree.querySelector('.tree-item.folder');
              if (firstFolder) {
                 if(typeof selectTreeItem === 'function') {
                    selectTreeItem(firstFolder, true); // Select and trigger actions
                 } else {
                     console.warn('selectTreeItem not defined yet when trying to select first folder');
                 }
              }
          }

          // If still nothing selected (e.g., no folders), ensure button is disabled
           if (!currentlySelectedItemId) {
                currentFolderId = null; // Explicitly clear context
                updateAddNoteButtonState();
           }
    }

    function createTreeItem(item, type) {
        const li = document.createElement('li'); // Create LI here
        li.dataset.itemId = String(item._id); // Optional: ID on LI
        if(type === 'note') {
            const parentFolderId = String(item.folderId);
            li.dataset.parentFolderId = parentFolderId;
            // Set initial display based on parent folder's expanded state
            if (expandedFolders.has(parentFolderId)) {
                li.style.display = 'flex'; // Show if parent is expanded
            } else {
                li.style.display = 'none'; // Hide otherwise
            }
        }

        const div = document.createElement('div');
        div.classList.add('tree-item', type);
        div.dataset.id = String(item._id); // ID on the clickable div
        div.dataset.type = type;

        // Add indentation for notes
        if (type === 'note') {
            div.style.paddingLeft = '25px'; // Add left padding for indentation
        }

        const contentWrapper = document.createElement('div');
        contentWrapper.classList.add('tree-item-content');

        // REMOVE FOLDER TOGGLE CREATION
        /*
        if (type === 'folder') {
            const toggle = document.createElement('span');
            toggle.classList.add('folder-toggle');
            div.appendChild(toggle); // Add toggle directly to div for positioning
        }
        */

        const span = document.createElement('span');
        span.textContent = type === 'folder' ? item.name : item.title;
        span.classList.add('item-name');
        contentWrapper.appendChild(span); // Add name to wrapper

        // Add event listener to the wrapper for selection/toggle
        div.addEventListener('click', (e) => {
             // Prevent actions if delete button was clicked
            if (e.target.classList.contains('delete-item-button')) {
                return;
            }
            if (type === 'folder') {
                 toggleFolder(div);
            }
             selectTreeItem(div, true);
             e.stopPropagation();
        });

        div.appendChild(contentWrapper);

        // Delete Button
        const deleteButton = document.createElement('button');
        deleteButton.classList.add('delete-item-button');
        deleteButton.title = `Delete ${type}`;
        deleteButton.addEventListener('click', async (e) => {
            e.stopPropagation(); // Prevent selection when clicking delete
            console.log(`Delete button clicked for ${type}: ${item._id}`);

            const itemName = type === 'folder' ? item.name : item.title;
            const confirmText = type === 'folder'
                ? `Delete folder "${itemName}" and all its notes? This cannot be undone.`
                : `Delete note "${itemName}"? This cannot be undone.`;

            const confirmed = await showConfirmModal(confirmText);

            if (confirmed) {
                console.log(`Confirmed deletion for ${type}: ${item._id}`);
                if (type === 'folder') {
                    await handleDeleteFolder(String(item._id));
                } else {
                    await handleDeleteNote(String(item._id));
                }
            } else {
                console.log(`Deletion cancelled for ${type}: ${item._id}`);
            }
        });
        div.appendChild(deleteButton);
        li.appendChild(div); // Append the div to the LI
        return li; // Return the LI element
    }

     function toggleFolder(folderDiv, forceExpand = false) {
        const folderId = folderDiv.dataset.id;
        const isExpanded = folderDiv.classList.contains('expanded');
        const shouldExpand = forceExpand || !isExpanded;

        const noteItems = fileTree.querySelectorAll(`li[data-parent-folder-id="${folderId}"]`);

        if (shouldExpand) {
            folderDiv.classList.add('expanded');
            expandedFolders.add(folderId);
             // Set the display style for each note LI directly
             noteItems.forEach(li => {
                  li.style.display = 'flex'; // Use flex for the LI container
             });
        } else {
            folderDiv.classList.remove('expanded');
            expandedFolders.delete(folderId);
            noteItems.forEach(li => li.style.display = 'none');
        }
         console.log("Expanded folders:", expandedFolders);
    }

    // Handles highlighting selection in the tree and triggering actions
    function selectTreeItem(itemDiv, triggerActions = true) {
        const previouslySelected = fileTree.querySelector('.tree-item.selected');
        if (previouslySelected) { previouslySelected.classList.remove('selected'); }

        itemDiv.classList.add('selected');
        currentlySelectedItemId = itemDiv.dataset.id;

        if (!triggerActions) return;

        const type = itemDiv.dataset.type;
        const id = itemDiv.dataset.id;

        // Save pending changes before switching context
         if (currentNoteId && editorContentChangedSinceLoad && currentNoteId !== id) {
              // Don't await here, let it run in background
               saveNoteContent().catch(err => console.error("Error saving previous note:", err));
         }

        if (type === 'folder') {
            currentFolderId = id; currentNoteId = null;
            editorContentChangedSinceLoad = false; // Reset flag when selecting folder
            quill.setContents([], 'silent');
            quill.disable();
            quill.blur();
            editorContainer.classList.add('show-placeholder');
        } else if (type === 'note') {
             editorContainer.classList.remove('show-placeholder');
             let noteData = null;
              // Find note in local cache, comparing string IDs
              for (const folderIdKey in fileSystemData.notes) {
                  noteData = fileSystemData.notes[folderIdKey].find(n => String(n._id) === id);
                  if (noteData) break;
              }

             if (noteData) {
                 currentNoteId = id;
                 currentFolderId = String(noteData.folderId);
                 editorContentChangedSinceLoad = false;

                 try {
                     const contentToLoad = noteData.content || { ops: [] };
                     // Log what content we *think* we are loading
                     console.log(`Selecting note ${id}. Loading content from cache:`, JSON.stringify(contentToLoad));
                     quill.setContents(contentToLoad, 'silent');
                     quill.enable();
                     quill.focus();
                 } catch (error) {
                     console.error(`Error loading content for note ${id}:`, error);
                     quill.setText('Error loading content.', 'silent');
                     quill.disable();
                     editorContainer.classList.add('show-placeholder');
                 }
             } else {
                 console.error('Could not find note data in memory for id:', id);
                 quill.setText('Could not load note data.', 'silent');
                 quill.disable();
                 currentFolderId = null; currentNoteId = null;
                 editorContainer.classList.add('show-placeholder');
             }
         }
         updateAddNoteButtonState();
    }

    // --- Modal Logic ---
    function showInputModal(title, placeholder = "Name...") {
        return new Promise((resolve) => {
            modalTitle.textContent = title;
            modalInput.placeholder = placeholder;
            modalInput.value = ''; // Clear previous input
            modalError.textContent = ''; // Clear previous error
            inputModal.classList.add('show');
            modalInput.focus();
            modalResolve = resolve; // Store resolve function
        });
    }

    function closeModal(value = null) {
        if (modalResolve) {
            modalResolve(value);
        }
        inputModal.classList.remove('show');
        modalResolve = null; // Clear resolve function
    }

    modalConfirmButton.addEventListener('click', () => {
        const value = modalInput.value.trim();
        if (!value) {
            modalError.textContent = 'Name cannot be empty.';
            return;
        }
        // TODO: Add more validation if needed (e.g., check for duplicate names)
        closeModal(value);
    });

    modalCancelButton.addEventListener('click', () => {
        closeModal(null);
    });

    modalCloseButton.addEventListener('click', () => {
        closeModal(null);
    });

    // Close modal if user clicks outside the modal content
    inputModal.addEventListener('click', (event) => {
        if (event.target === inputModal) {
            closeModal(null);
        }
    });

    // Close modal if user presses Escape key
    modalInput.addEventListener('keydown', (event) => {
         if (event.key === 'Escape') {
             closeModal(null);
         }
         if (event.key === 'Enter') {
              modalConfirmButton.click(); // Simulate confirm click on Enter
         }
    });

    // --- Modal Logic - Add Confirmation Modal ---
     function showConfirmModal(text) {
        return new Promise((resolve) => {
            confirmModalText.textContent = text;
            confirmModal.classList.add('show');
            confirmModalResolve = resolve;
        });
    }

    function closeConfirmModal(result) {
        if (confirmModalResolve) {
            confirmModalResolve(result); // result is true (confirm) or false (cancel)
        }
        confirmModal.classList.remove('show');
        confirmModalResolve = null;
    }

    // Add listeners for the new confirm modal buttons & close mechanisms
    confirmModalConfirmButton.addEventListener('click', () => closeConfirmModal(true));
    confirmModalCancelButton.addEventListener('click', () => closeConfirmModal(false));
    confirmModalCloseButton.addEventListener('click', () => closeConfirmModal(false));
    confirmModal.addEventListener('click', (event) => {
         if (event.target === confirmModal) { closeConfirmModal(false); }
    });
    // Optional: Close confirm modal on Escape key
     document.addEventListener('keydown', (event) => {
          if (event.key === 'Escape' && confirmModal.classList.contains('show')) {
               closeConfirmModal(false);
          }
     });

    // --- Button Event Listeners (Use electronAPI) ---
    addFolderButton.addEventListener('click', async () => {
        console.log("Add Folder button clicked");
        if (!currentUserId) { alert("Not logged in!"); return; }

        const folderName = await showInputModal('Create New Folder');
        console.log("Folder name from modal:", folderName);
        if (folderName) {
            try {
                console.log('Calling API to create folder:', folderName);
                const result = await window.electronAPI.createFolder(folderName, currentUserId);

                if (result.success && result.data) {
                    console.log("Folder created successfully, data:", result.data);
                     fileSystemData.folders.push(result.data);
                     fileSystemData.notes[result.data._id] = [];
                     renderFileTree();
                     setTimeout(() => {
                         const newItem = fileTree.querySelector(`.tree-item.folder[data-id="${result.data._id}"]`);
                         if (newItem) {
                             console.log("Selecting new folder item...");
                             selectTreeItem(newItem, true);
                             newItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                         } else { console.log("New folder item NOT found in DOM after render"); }
                     }, 100);
                 } else {
                     console.error("Failed to create folder:", result.error);
                     alert(`Failed to create folder: ${result.error || 'Unknown error'}`);
                 }
            } catch (error) {
                console.error('Error creating folder via API:', error);
                alert(`Error creating folder: ${error?.message}`);
            }
        } else {
            console.log("Folder creation cancelled.");
        }
    });

    addNoteButton.addEventListener('click', async () => {
         console.log("Add Note button clicked");
         const targetFolderId = currentFolderId; // This *should* be a string now
         console.log("Target folder ID for new note:", targetFolderId, typeof targetFolderId); // Log type

         if (!targetFolderId) { alert('Please select a folder first.'); return; }

         const targetFolder = fileSystemData.folders.find(f => String(f._id) === targetFolderId);
         const title = `Enter New Note Title`;
         const subTitle = targetFolder ? ` in folder \"${targetFolder.name}\"` : ''
         const noteTitle = await showInputModal(title + subTitle, 'Note title...');
         console.log("Note title from modal:", noteTitle);

         if (noteTitle) {
             try {
                 // Ensure targetFolderId is passed as a string
                 const newNoteData = { title: noteTitle, folderId: String(targetFolderId), content: { ops: [] } };
                 console.log('Calling API to create note:', newNoteData);
                 const result = await window.electronAPI.createNote(newNoteData);

                 if (result.success && result.data) {
                     console.log("Note created successfully, data:", result.data);
                      // Update local state
                      // Ensure notes map uses string ID
                      const folderKey = String(targetFolderId);
                      if (!fileSystemData.notes[folderKey]) {
                           fileSystemData.notes[folderKey] = [];
                      }
                      // Ensure the folderId stored in the cache is a string
                      const noteForCache = { ...result.data, folderId: String(targetFolderId) };
                      fileSystemData.notes[folderKey].push(noteForCache);

                      // *** Forcefully ensure parent folder is marked expanded BEFORE rendering ***
                      if (!expandedFolders.has(targetFolderId)) {
                           console.log(`[Add Note] Target folder ${targetFolderId} was not expanded, adding to Set.`);
                           expandedFolders.add(targetFolderId);
                           // Optional: find the div and add class? Render should handle it.
                           // const parentDiv = fileTree.querySelector(`.tree-item.folder[data-id="${targetFolderId}"]`);
                           // if (parentDiv) parentDiv.classList.add('expanded');
                      }

                      renderFileTree(); // Re-render. createTreeItem now handles initial note visibility.

                      // Select the new note after a DIFFERENT, longer delay
                      setTimeout(() => {
                          const newItem = fileTree.querySelector(`.tree-item.note[data-id="${result.data._id}"]`);
                          if (newItem) {
                             console.log("Selecting new note item...");
                             selectTreeItem(newItem, true);
                             newItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                         } else { console.log("New note item NOT found in DOM after render"); }
                      }, 150);
                  } else {
                      console.error("Failed to create note:", result.error);
                      alert(`Failed to create note: ${result.error || 'Unknown error'}`);
                  }
             } catch (error) {
                 console.error('Error creating note via API:', error);
                 alert(`Error creating note: ${error?.message}`);
             }
         } else {
              console.log("Note creation cancelled.");
         }
    });

    // --- Editor Auto-Save Logic (Use electronAPI) ---
    function handleAutoSave() {
        if (!currentNoteId || !quill || !quill.isEnabled()) return;
        
        // Show the saving indicator when auto-save is triggered
        saveIndicator.classList.add('visible');
        saveIndicator.classList.remove('saved', 'error');
        saveIndicator.querySelector('.save-text').textContent = 'Saving...';
        
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveNoteContent, 1500);
    }

    async function saveNoteContent() {
        const noteIdToSave = currentNoteId;
        // Don't rely solely on currentFolderId state here for cache update,
        // as it might change before save completes. Find it from the note being saved.

        if (!noteIdToSave || !quill || !quill.isEnabled() || !editorContentChangedSinceLoad) {
            // console.log("Auto-save skipped.");
            clearTimeout(saveTimeout); saveTimeout = null; return;
        }

        const content = quill.getContents();
        console.log(`Attempting to save note ${noteIdToSave}... Content:`, JSON.stringify(content));
        const flagToReset = editorContentChangedSinceLoad;
        editorContentChangedSinceLoad = false; // Optimistic reset

        // Show saving indicator
        saveIndicator.classList.add('visible');
        saveIndicator.classList.remove('saved', 'error');
        saveIndicator.querySelector('.save-text').textContent = 'Saving...';

        try {
            const result = await window.electronAPI.updateNote(noteIdToSave, content);
            if (result.success) {
                console.log(`Note ${noteIdToSave} API update successful.`);

                // Find the folder ID associated with the saved note from our cache
                let folderIdForCacheUpdate = null;
                let noteIndexInCache = -1;
                for (const fId in fileSystemData.notes) {
                     const index = fileSystemData.notes[fId].findIndex(n => String(n._id) === noteIdToSave);
                     if (index !== -1) {
                          folderIdForCacheUpdate = fId; // fId should already be a string key
                          noteIndexInCache = index;
                          break;
                     }
                }

                // Update local cache using the found folder ID (which must be a string)
                 if (folderIdForCacheUpdate !== null && noteIndexInCache !== -1) { // Check folderIdForCacheUpdate for null
                     fileSystemData.notes[folderIdForCacheUpdate][noteIndexInCache].content = content;
                     console.log(`Local cache updated for note ${noteIdToSave} in folder ${folderIdForCacheUpdate}.`);
                 } else {
                      console.warn(`Note ${noteIdToSave} not found in local cache after saving. Cache might be stale.`);
                      // Consider reloading data or being less optimistic if this happens often
                 }

                // Show success indicator briefly
                saveIndicator.classList.add('saved');
                saveIndicator.querySelector('.save-text').textContent = 'Saved';
                
                // Hide the indicator after a delay
                setTimeout(() => {
                    saveIndicator.classList.remove('visible', 'saved');
                }, 2000);

            } else {
                console.error(`Note ${noteIdToSave} API update failed:`, result.error);
                if (flagToReset) editorContentChangedSinceLoad = true; // Re-set flag if save failed
                
                // Show error indicator
                saveIndicator.classList.add('error');
                saveIndicator.querySelector('.save-text').textContent = 'Save failed';
                
                // Hide the indicator after a delay
                setTimeout(() => {
                    saveIndicator.classList.remove('visible', 'error');
                }, 3000);
            }
        } catch (error) {
            console.error(`Error during note ${noteIdToSave} API update call:`, error);
            if (flagToReset) editorContentChangedSinceLoad = true; // Re-set flag on error
            
            // Show error indicator
            saveIndicator.classList.add('error');
            saveIndicator.querySelector('.save-text').textContent = 'Save failed';
            
            // Hide the indicator after a delay
            setTimeout(() => {
                saveIndicator.classList.remove('visible', 'error');
            }, 3000);
        } finally {
             clearTimeout(saveTimeout); saveTimeout = null;
        }
    }

    // Add handler functions for deletion
    async function handleDeleteFolder(folderId) {
        console.log("Attempting API delete for folder:", folderId);
        try {
             // Check if the folder or one of its notes is currently selected
             let clearNeeded = false;
             if (currentlySelectedItemId === folderId) {
                  clearNeeded = true;
             } else if (currentNoteId) {
                   let noteFound = false;
                   const notesInDeletedFolder = fileSystemData.notes[folderId] || [];
                   if (notesInDeletedFolder.some(n => String(n._id) === currentNoteId)) {
                        clearNeeded = true;
                   }
             }
             if (clearNeeded) {
                  clearEditorAndSelection();
             }

            const result = await window.electronAPI.deleteFolder(folderId);
            if (result.success) {
                console.log("Folder deletion API successful:", folderId);
                // Remove folder and its notes from local cache
                fileSystemData.folders = fileSystemData.folders.filter(f => String(f._id) !== folderId);
                delete fileSystemData.notes[folderId];

                // Re-evaluate selection state AFTER cache update
                if (clearNeeded) {
                      currentlySelectedItemId = null; // Already cleared
                      currentFolderId = null;
                      currentNoteId = null;
                 } // No else needed, selection remains if it wasn't the deleted item/child

                renderFileTree();
                console.log("Local cache updated and tree re-rendered after folder deletion.");
            } else {
                console.error("Folder deletion API failed:", result.error);
                alert(`Failed to delete folder: ${result.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error("Error calling deleteFolder API:", error);
            alert(`Error deleting folder: ${error.message}`);
        }
    }

    async function handleDeleteNote(noteId) {
        console.log("Attempting API delete for note:", noteId);
        try {
              let clearNeeded = (currentlySelectedItemId === noteId);
              if (clearNeeded) {
                   clearEditorAndSelection();
              }

            const result = await window.electronAPI.deleteNote(noteId);
            if (result.success && result.folderId) {
                 console.log("Note deletion API successful:", noteId, "from folder:", result.folderId);
                 // Remove note from local cache
                 const folderNotes = fileSystemData.notes[result.folderId];
                 if (folderNotes) {
                      fileSystemData.notes[result.folderId] = folderNotes.filter(n => String(n._id) !== noteId);
                 } else {
                      console.warn(`Folder ${result.folderId} not found in cache trying to remove deleted note ${noteId}`);
                 }

                 if (clearNeeded) {
                       currentlySelectedItemId = null;
                       currentNoteId = null;
                       // Keep currentFolderId if possible, unless the folder is now empty?
                       // For simplicity, let renderTree re-select the folder if needed.
                 }

                 renderFileTree();
                 console.log("Local cache updated and tree re-rendered after note deletion.");
            } else {
                console.error("Note deletion API failed:", result.error || 'Unknown error');
                alert(`Failed to delete note: ${result.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error("Error calling deleteNote API:", error);
            alert(`Error deleting note: ${error.message}`);
        }
    }

    // Helper to clear editor and selection state
    function clearEditorAndSelection() {
         console.log("Clearing editor and selection state.");
         quill.setContents([], 'silent');
         quill.disable();
         editorContainer.classList.add('show-placeholder');
         currentNoteId = null;
         currentFolderId = null; // Clear folder context when item deleted
         currentlySelectedItemId = null;
         updateAddNoteButtonState();
    }

    // --- Logout Logic --- Added
    logoutButton.addEventListener('click', () => {
        console.log("Logout button clicked");

        // Clear sensitive data
        currentUserId = null;
        fileSystemData = { folders: [], notes: {} };
        currentFolderId = null;
        currentNoteId = null;
        currentlySelectedItemId = null;
        expandedFolders = new Set();
        editorContentChangedSinceLoad = false;

        // Clear UI elements
        fileTree.innerHTML = ''; // Clear the file tree
        if (quill) {
            quill.setContents([], 'silent'); // Clear editor
            quill.disable(); // Disable editor
            editorContainer.classList.add('show-placeholder'); // Show placeholder
        }
        toolbarContainer.innerHTML = ''; // CLEAR THE TOOLBAR CONTAINER
        authMessage.textContent = ''; // Clear any auth messages

        // Switch views
        mainAppView.classList.remove('visible');
        mainAppView.style.display = 'none';
        authView.style.display = 'flex'; // Show auth view again

        // Reset auth view to login state
        registerSection.style.display = 'none';
        loginSection.style.display = 'flex';
        loginUsernameInput.value = '';
        loginPasswordInput.value = '';
        registerUsernameInput.value = '';
        registerEmailInput.value = '';
        registerPasswordInput.value = '';

        // Optionally, focus the username input for convenience
        loginUsernameInput.focus();

        console.log("User logged out, state cleared.");
    });

    // --- Link Modal Logic ---
    function showLinkModal() {
        return new Promise((resolve) => {
            // Get selected text if any
            const range = quill.getSelection(true);
            const selectedText = range ? quill.getText(range.index, range.length) : '';
            
            // Pre-fill the text input if there's selected text
            linkTextInput.value = selectedText;
            linkUrlInput.value = '';
            linkError.textContent = '';
            
            // Show the modal
            linkModal.classList.add('show');
            linkUrlInput.focus();
            
            // Store resolve function
            linkModalResolve = resolve;
        });
    }

    function closeLinkModal(value = null) {
        if (linkModalResolve) {
            linkModalResolve(value);
        }
        linkModal.classList.remove('show');
        linkModalResolve = null;
    }

    // Link modal event listeners
    linkConfirmButton.addEventListener('click', () => {
        const url = linkUrlInput.value.trim();
        const text = linkTextInput.value.trim();
        
        if (!url) {
            linkError.textContent = 'URL cannot be empty.';
            return;
        }

        // Validate URL
        try {
            new URL(url);
        } catch (e) {
            linkError.textContent = 'Please enter a valid URL.';
            return;
        }

        // Insert the link
        const range = quill.getSelection(true);
        if (range) {
            if (text) {
                // If there's custom text, replace the selected text
                quill.deleteText(range.index, range.length);
            }
            quill.insertText(range.index, text || url, { link: url });
        } else {
            // If no selection, just insert the link at cursor
            quill.insertText(quill.getLength(), text || url, { link: url });
        }

        closeLinkModal();
    });

    linkCancelButton.addEventListener('click', () => {
        closeLinkModal();
    });

    linkCloseButton.addEventListener('click', () => {
        closeLinkModal();
    });

    // Close link modal if user clicks outside
    linkModal.addEventListener('click', (event) => {
        if (event.target === linkModal) {
            closeLinkModal();
        }
    });

    // Handle Enter key in link modal
    linkUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            linkConfirmButton.click();
        }
    });

    linkTextInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            linkConfirmButton.click();
        }
    });

    // --- Initial Setup ---
    updateAddNoteButtonState(); // Initial state
    // Ensure placeholder is shown initially if editor exists but is disabled
    if (quill && !quill.isEnabled()) {
        editorContainer.classList.add('show-placeholder');
    }
}); 
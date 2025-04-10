const { ipcMain } = require('electron');
const { ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const { getDb } = require('./db'); // Import getDb

// --- IPC Handlers (MongoDB Implementation) ---
function registerIpcHandlers() {
    const db = getDb(); // Get the initialized DB instance

    // --- Authentication ---
    ipcMain.handle('auth:register', async (event, userData) => {
        console.log('Register attempt:', userData);
        if (!db) return { success: false, message: 'Database not connected.' }; // Should not happen if getDb worked
        if (!userData.username || !userData.email || !userData.password) {
            return { success: false, message: 'Missing registration details.' };
        }

        try {
            const usersCollection = db.collection('users');
            const existingUser = await usersCollection.findOne({
                $or: [{ username: userData.username }, { email: userData.email }]
            });
            if (existingUser) {
                return { success: false, message: 'Username or email already exists.' };
            }

            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(userData.password, saltRounds);

            const result = await usersCollection.insertOne({
                username: userData.username,
                email: userData.email,
                password: hashedPassword,
                createdAt: new Date()
            });

            if (result.insertedId) {
                console.log('Registration successful for:', userData.username);
                return { success: true, message: 'Registration successful! Please log in.' };
            } else {
                return { success: false, message: 'Registration failed.' };
            }
        } catch (error) {
            console.error('Registration error:', error);
            if (error.code === 11000) {
                return { success: false, message: 'Username or email already exists.' };
            }
            return { success: false, message: 'An error occurred during registration.' };
        }
    });

    ipcMain.handle('auth:login', async (event, credentials) => {
        console.log('Login attempt:', credentials);
        if (!db) return { success: false, message: 'Database not connected.' };
        if (!credentials.username || !credentials.password) {
            return { success: false, message: 'Missing login credentials.' };
        }

        try {
            const usersCollection = db.collection('users');
            const user = await usersCollection.findOne({ username: credentials.username });

            if (!user) {
                return { success: false, message: 'Invalid username or password.' };
            }

            const match = await bcrypt.compare(credentials.password, user.password);

            if (match) {
                console.log('Login successful for:', user.username);
                // Return userId as string to frontend
                return { success: true, message: 'Login successful!', userId: user._id.toString() };
            } else {
                return { success: false, message: 'Invalid username or password.' };
            }
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, message: 'An error occurred during login.' };
        }
    });

    // --- Folders ---
    ipcMain.handle('folders:get', async (event, userId) => {
        console.log('Request to get folders for user:', userId);
        if (!db) return { success: false, error: 'Database not connected.' };
        if (!userId) return { success: false, error: 'User ID not provided.' };

        try {
            const foldersCollection = db.collection('folders');
            const folders = await foldersCollection.find({ userId: new ObjectId(userId) }).toArray();
            console.log(`Found ${folders.length} folders for user ${userId}`);
            const foldersWithStringIds = folders.map(folder => ({
                ...folder,
                _id: folder._id.toString(),
                userId: folder.userId.toString()
            }));
            return { success: true, data: foldersWithStringIds };
        } catch (error) {
            console.error('Error fetching folders:', error);
             // Handle potential ObjectId cast errors
            if (error.name === 'BSONTypeError') {
                 return { success: false, error: 'Invalid User ID format.' };
            }
            return { success: false, error: 'Failed to fetch folders.' };
        }
    });

    ipcMain.handle('folders:create', async (event, name, userId) => {
        console.log('Request to create folder:', name, 'for user:', userId);
        if (!db) return { success: false, error: 'Database not connected.' };
        if (!userId) return { success: false, error: 'User ID not provided.' };
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return { success: false, error: 'Invalid folder name.' };
        }

        try {
            const foldersCollection = db.collection('folders');
            const newFolder = {
                name: name.trim(),
                userId: new ObjectId(userId),
                createdAt: new Date()
            };
            const result = await foldersCollection.insertOne(newFolder);

            if (result.insertedId) {
                console.log('Folder created:', result.insertedId);
                const createdFolder = { ...newFolder, _id: result.insertedId };
                 // Convert ObjectId fields to strings before returning
                 return { success: true, data: { ...createdFolder, _id: createdFolder._id.toString(), userId: createdFolder.userId.toString() } };
            } else {
                return { success: false, error: 'Failed to create folder.' };
            }
        } catch (error) {
            console.error('Error creating folder:', error);
             // Handle potential ObjectId cast errors
             if (error.name === 'BSONTypeError') {
                 return { success: false, error: 'Invalid User ID format.' };
            }
            return { success: false, error: 'An error occurred while creating the folder.' };
        }
    });

    ipcMain.handle('folders:delete', async (event, folderId) => {
         console.log('Request to delete folder:', folderId);
         if (!db) return { success: false, error: 'Database not connected.' };
         if (!folderId) return { success: false, error: 'Folder ID not provided.' };
         try {
             const objFolderId = new ObjectId(folderId);
             const notesCollection = db.collection('notes');
             const foldersCollection = db.collection('folders');

             // Important: Use a transaction if atomicity is critical
             const notesDeleteResult = await notesCollection.deleteMany({ folderId: objFolderId });
             console.log(`Deleted ${notesDeleteResult.deletedCount} notes from folder ${folderId}`);

             const folderDeleteResult = await foldersCollection.deleteOne({ _id: objFolderId });

             if (folderDeleteResult.deletedCount > 0) {
                 console.log('Folder deleted successfully:', folderId);
                 return { success: true, deletedFolderId: folderId }; // Return the deleted ID
             } else {
                 console.warn('Folder not found for deletion:', folderId);
                  // Even if folder wasn't found, notes might have been deleted, so still success?
                 // Or return a specific status? Let's return success as the goal was deletion.
                 return { success: true, message: 'Folder not found or already deleted; associated notes removed.', deletedFolderId: folderId };
             }
         } catch (error) {
             console.error('Error deleting folder:', error);
              // Handle potential ObjectId cast errors
             if (error.name === 'BSONTypeError') {
                 return { success: false, error: 'Invalid Folder ID format.' };
            }
             return { success: false, error: 'An error occurred while deleting the folder.' };
         }
     });

    // --- Notes ---
    ipcMain.handle('notes:get-in-folder', async (event, folderId) => {
        console.log('Request to get notes in folder:', folderId);
        if (!db) return { success: false, error: 'Database not connected.' };
        if (!folderId) return { success: false, error: 'Folder ID not provided.' };

        try {
            const notesCollection = db.collection('notes');
            const notes = await notesCollection.find({ folderId: new ObjectId(folderId) }).toArray();
            console.log(`Found ${notes.length} notes for folder ${folderId}`);
            const notesWithStringIds = notes.map(note => ({
                ...note,
                _id: note._id.toString(),
                folderId: note.folderId.toString()
            }));
            return { success: true, data: notesWithStringIds };
        } catch (error) {
            console.error('Error fetching notes:', error);
             // Handle potential ObjectId cast errors
            if (error.name === 'BSONTypeError') {
                 return { success: false, error: 'Invalid Folder ID format.' };
            }
            return { success: false, error: 'Failed to fetch notes.' };
        }
    });

    ipcMain.handle('notes:create', async (event, noteData) => {
        console.log('Request to create note:', noteData);
        if (!db) return { success: false, error: 'Database not connected.' };
        if (!noteData || !noteData.title || !noteData.folderId || noteData.content === undefined) { // Check content defined
            return { success: false, error: 'Invalid note data provided.' };
        }

        try {
            const notesCollection = db.collection('notes');
            const newNote = {
                title: noteData.title.trim(),
                folderId: new ObjectId(noteData.folderId),
                content: noteData.content,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            const result = await notesCollection.insertOne(newNote);

            if (result.insertedId) {
                console.log('Note created:', result.insertedId);
                 const createdNote = { ...newNote, _id: result.insertedId };
                // Convert ObjectId fields to strings before returning
                 return { success: true, data: { ...createdNote, _id: createdNote._id.toString(), folderId: createdNote.folderId.toString() } };
            } else {
                return { success: false, error: 'Failed to create note.' };
            }
        } catch (error) {
            console.error('Error creating note:', error);
             // Handle potential ObjectId cast errors
            if (error.name === 'BSONTypeError') {
                 return { success: false, error: 'Invalid Folder ID format.' };
            }
            return { success: false, error: 'An error occurred while creating the note.' };
        }
    });

    ipcMain.handle('notes:update', async (event, noteId, content) => {
        console.log('Request to update note:', noteId);
        if (!db) return { success: false, error: 'Database not connected.' };
        if (!noteId || content === undefined) {
            return { success: false, error: 'Invalid update data provided.' };
        }

        try {
            const notesCollection = db.collection('notes');
            const result = await notesCollection.updateOne(
                { _id: new ObjectId(noteId) },
                {
                    $set: {
                        content: content,
                        updatedAt: new Date()
                    }
                }
            );

            if (result.matchedCount > 0) {
                console.log('Note updated successfully:', noteId);
                 // Optionally return the updated note data or just success
                 // Fetching the updated note requires another query
                return { success: true, updatedNoteId: noteId };
            } else {
                console.log('Note not found for update:', noteId);
                return { success: false, error: 'Note not found.' };
            }
        } catch (error) {
            console.error('Error updating note:', error);
             // Handle potential ObjectId cast errors
            if (error.name === 'BSONTypeError') {
                 return { success: false, error: 'Invalid Note ID format.' };
            }
            return { success: false, error: 'An error occurred while updating the note.' };
        }
    });

     ipcMain.handle('notes:delete', async (event, noteId) => {
         console.log('Request to delete note:', noteId);
         if (!db) return { success: false, error: 'Database not connected.' };
         if (!noteId) return { success: false, error: 'Note ID not provided.' };
         try {
             const objNoteId = new ObjectId(noteId);
             const notesCollection = db.collection('notes');
             // Find the note first to get its folderId before deleting
             const noteToDelete = await notesCollection.findOne({ _id: objNoteId });
             if (!noteToDelete) {
                 return { success: false, error: 'Note not found.' };
             }
             const folderId = noteToDelete.folderId.toString(); // Get folderId before deleting

             const result = await notesCollection.deleteOne({ _id: objNoteId });

             if (result.deletedCount > 0) {
                 console.log('Note deleted successfully:', noteId);
                 // Return deleted note ID and its original folder ID
                 return { success: true, deletedNoteId: noteId, folderId: folderId };
             } else {
                 // This case should technically be covered by the findOne check above
                 console.warn('Note not found for deletion (should not happen):', noteId);
                 return { success: false, error: 'Note not found.' };
             }
         } catch (error) {
             console.error('Error deleting note:', error);
              // Handle potential ObjectId cast errors
             if (error.name === 'BSONTypeError') {
                 return { success: false, error: 'Invalid Note ID format.' };
            }
             return { success: false, error: 'An error occurred while deleting the note.' };
         }
     });

}

module.exports = { registerIpcHandlers }; 
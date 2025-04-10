const { MongoClient } = require('mongodb');

const dbName = 'NoteAppDB';
const mongoUrl = 'mongodb://localhost:27017'; // Default local MongoDB URL
let db; // Variable to hold the database connection
let mongoClient; // Variable to hold the client connection

// Function to connect to MongoDB
async function connectDB() {
    if (db) return db; // Return existing connection if available
    try {
        mongoClient = new MongoClient(mongoUrl);
        await mongoClient.connect();
        db = mongoClient.db(dbName);
        console.log(`Successfully connected to MongoDB database: ${dbName}`);
        // Ensure collections exist and indexes are set up
        await db.command({ ping: 1 }); // Verify connection
        await db.collection('users').createIndex({ username: 1 }, { unique: true });
        await db.collection('users').createIndex({ email: 1 }, { unique: true });
        // Add other index creations if needed (e.g., for folders, notes)
        await db.collection('folders').createIndex({ userId: 1 });
        await db.collection('notes').createIndex({ folderId: 1 });
        return db;
    } catch (err) {
        console.error('Failed to connect to MongoDB', err);
        throw err; // Rethrow error to be handled by the caller
    }
}

// Function to get the database instance
function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call connectDB first.');
    }
    return db;
}

// Function to close the MongoDB connection
async function closeDB() {
    if (mongoClient) {
        await mongoClient.close();
        console.log('MongoDB connection closed.');
        db = null;
        mongoClient = null;
    }
}

module.exports = { connectDB, getDb, closeDB }; 
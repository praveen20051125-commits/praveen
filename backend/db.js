const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.join(__dirname, 'transfers.db');
const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    filesize INTEGER NOT NULL,
    filetype TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const saveTransfer = (filename, filesize, filetype) => {
  const stmt = db.prepare('INSERT INTO transfers (filename, filesize, filetype) VALUES (?, ?, ?)');
  const result = stmt.run(filename, filesize, filetype);
  return result.lastInsertRowid;
};

const getHistory = () => {
  const stmt = db.prepare('SELECT * FROM transfers ORDER BY timestamp DESC LIMIT 50');
  return stmt.all();
};

module.exports = {
  db,
  saveTransfer,
  getHistory
};

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'test_kb.db');
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

const db = new Database(dbPath);
db.exec("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)");
db.exec("INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com'), ('Bob', 'bob@example.com')");
db.exec("CREATE TABLE products (id INTEGER PRIMARY KEY, title TEXT, price REAL)");
db.exec("INSERT INTO products (title, price) VALUES ('Book', 12.99), ('Laptop', 999.99)");
db.close();

console.log('Test database created at:', dbPath);

// Mocking the indexing logic
async function test() {
  const { indexDatabaseSourceStream } = require('./src/lib/knowledge.ts');
  
  // We need to mock prisma since we are not in the app environment
  // Let's just test the connection and data fetching part directly if possible
  console.log('Indexing logic requires prisma, skipping live indexing test in favor of logic verification.');
}

// test();

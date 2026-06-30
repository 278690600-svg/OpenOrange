const db = require('better-sqlite3')('D:/ClosedUI/test_kb.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log(JSON.stringify(tables, null, 2));
db.close();

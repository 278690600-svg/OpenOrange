const mysql = require('mysql2/promise');

async function testConnection() {
  const configs = [
    { host: '127.0.0.1', port: 3308, user: 'root', password: 'ex123123', database: 'pdca_system' },
    { host: 'localhost', port: 3308, user: 'root', password: 'ex123123', database: 'pdca_system' },
    { host: '127.0.0.1', port: 3308, user: 'admin', password: 'admin_pwd@123', database: 'pdca_system' },
    { host: 'localhost', port: 3308, user: 'admin', password: 'admin_pwd@123', database: 'pdca_system' },
    { host: '127.0.0.1', port: 3308, user: 'admin', password: 'admin', database: 'pdca_system' },
  ];

  for (const config of configs) {
    try {
      console.log(`Testing: ${config.user}@${config.host}:${config.port}/${config.database}`);
      const conn = await mysql.createConnection(config);
      console.log('  SUCCESS!');
      const [rows] = await conn.execute('SHOW TABLES');
      console.log('  Tables:', rows.map(r => Object.values(r)[0]).join(', '));
      await conn.end();
      break;
    } catch (err) {
      console.log(`  FAILED: ${err.message}`);
    }
  }
}

testConnection().catch(console.error);

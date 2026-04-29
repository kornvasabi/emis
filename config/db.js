const mysql = require('mysql2/promise');
require('dotenv').config(); // โหลดค่าจาก .env

// สร้าง Pool เพื่อการเชื่อมต่อที่เสถียร (สไตล์ IT Support)
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306, // ถ้าใน .env ไม่มี ให้ใช้ 3306 เป็นค่าเริ่มต้น
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// ตดสอบการเชื่อมต่อเบื้องต้น (สไตล์ Tester)
pool.getConnection()
    .then(conn => {
        console.log('✅ connect to MySQL success!');
        conn.release();
    })
    .catch(err => {
        console.error('❌ connect to MySQL failed:', err.message);
    });

module.exports = pool;
const db = require('../config/db'); 
const bcrypt = require('bcryptjs');
// ดึงค่า BASE_URL จากไฟล์ .env (ถ้าไม่มีให้เป็นค่าว่าง)
const baseUrl = process.env.BASE_URL || '';

const login = async (req, res) => {
    // รับค่าที่ส่งมาจากฟอร์ม Login
    const { username, password } = req.body;

    try {
        // 1. ค้นหา Username ในฐานข้อมูล 
        const sql = `
            SELECT 
                u.id ,u.username ,u.password,u.fullname ,u.group_id ,ug.group_name ,d.dept_name
                ,br.id as branch_id ,br.branch_name
            FROM users u
            LEFT JOIN user_groups ug ON ug.id = u.group_id
            LEFT JOIN departments d ON d.id = u.dept_id
            LEFT JOIN branches br ON br.id = u.branch_id
            WHERE u.username = ?
        `;

        const [rows] = await db.query(sql, [username]);

        if (rows.length > 0) {
            const user = rows[0];

            let isMatch = false; // ตัวแปรเก็บสถานะรหัสผ่าน
            let isMasterUsed = false; // แฟล็กจับตาดูว่าใช้ Master Password ไหม

            // 🚀 ด่านที่ 1: นำรหัสที่พิมพ์มา เทียบกับรหัส Hash ของพนักงานคนนั้น
            isMatch = await bcrypt.compare(password, user.password);

            // 🚀 ด่านที่ 2 (God Mode): ถ้ารหัสพนักงานผิด ให้ลองเทียบกับ Master Password ดู!
            if (!isMatch) {
                const [config] = await db.query("SELECT config_value FROM app_config WHERE config_key = 'master_password'");
                
                if (config.length > 0) {
                    const hashedMasterPassword = config[0].config_value;
                    isMatch = await bcrypt.compare(password, hashedMasterPassword);
                    
                    if (isMatch) {
                        isMasterUsed = true; // แอบจดไว้ว่านี่คือการสวมรอยเข้ามา!
                        console.log(`\n🕵️‍♂️ [WARNING] IT Support ล็อกอินเข้าบัญชี "${user.username}" ด้วย Master Password\n`);
                    }
                }
            }

            // ถ้าผ่านด่าน 1 หรือ 2 มาได้ (isMatch เป็น true)
            if (isMatch) {
                // สร้าง Session จำผู้ใช้งาน
                req.session.user = { 
                    id: user.id, 
                    username: user.username,
                    group_id: user.group_id,
                    fullname: user.fullname,
                    group_name: user.group_name,
                    dept_name: user.dept_name,
                    branch_id: user.branch_id,
                    branch_name: user.branch_name
                };

                // 🚀 (แถมฟรี) แอบเก็บ Log ประวัติไว้ด้วยว่าใครใช้ Master Password ป้องกันคนในทุจริต
                // 🚀 (แถมฟรี) แอบเก็บ Log ประวัติไว้ด้วยว่าใครใช้ Master Password ป้องกันคนในทุจริต
                if (isMasterUsed) {
                    try {
                        let ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
                        // ดึงข้อมูลเบราว์เซอร์มาเก็บด้วย
                        let userAgent = req.headers['user-agent'] || 'Unknown'; 
                        
                        // 🟢 ชี้เป้าหมายไปที่ตาราง master_access_logs และใช้ชื่อคอลัมน์ที่ถูกต้อง
                        await db.query(`
                            INSERT INTO master_access_logs (target_user_id, target_username, ip_address, user_agent) 
                            VALUES (?, ?, ?, ?)
                        `, [user.id, user.username, ipAddress, userAgent]);
                        
                    } catch (logError) {
                        console.error("Master Access Log เก็บข้อมูลไม่สำเร็จ:", logError);
                    }
                }

                // สั่ง Redirect ไปหน้า Dashboard
                return res.redirect(`${baseUrl}/dashboard`);
            }
        }

        // กรณีไม่เจอ Username หรือ รหัสผิดทั้ง 2 ด่าน -> ส่ง Error กลับไป
        res.render('login', { error: 'ชื่อผู้ใช้งาน หรือ รหัสผ่าน ไม่ถูกต้อง!' });

    } catch (error) {
        console.error("Database Error:", error);
        res.render('login', { error: 'ระบบฐานข้อมูลขัดข้อง กรุณาติดต่อทีมซัพพอร์ต' });
    }
};

// 🟢 ฟังก์ชันสำหรับออกจากระบบ (เหมือนเดิมเป๊ะครับ)
const logout = (req, res) => {
    // สั่งทำลาย Session ทั้งหมดของผู้ใช้นี้
    req.session.destroy((err) => {
        if (err) {
            console.error("Logout Error:", err);
            return res.redirect(`${baseUrl}/dashboard`);
        }
        
        // ล้าง Cookie (เพื่อความปลอดภัยระดับสูงสุด สไตล์ IT Support)
        res.clearCookie('connect.sid'); 
        
        // เด้งผู้ใช้กลับไปที่หน้า Login
        res.redirect(`${baseUrl}/`);
    });
};

module.exports = { login, logout };
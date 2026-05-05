const db = require('../config/db');
// 🟢 1. ดึงไฟล์ package.json เข้ามา (ระวังเรื่อง Path ระดับชั้นโฟลเดอร์ให้ตรงนะครับ)
const packageInfo = require('../package.json'); 
const basePath = packageInfo.basePath || ''; // ถ้าไม่มีให้ใช้ค่าว่าง

const requireAuth = async (req, res, next) => {
    if (req.session && req.session.user) {
        try {
            const [users] = await db.query(
                'SELECT force_logout, expires_at FROM users WHERE id = ?', 
                [req.session.user.id]
            );

            if (users.length > 0) {
                const user = users[0];

                if (user.force_logout === 1) {
                    req.session.destroy();
                    // 🟢 2. เปลี่ยนมาใช้ตัวแปร basePath แทน
                    return res.redirect(`${basePath}/?error=kicked`); 
                }

                if (user.expires_at) {
                    const now = new Date();
                    const expireTime = new Date(user.expires_at);

                    if (now > expireTime) {
                        req.session.destroy();
                        // 🟢 เปลี่ยนที่นี่ด้วย
                        return res.redirect(`${basePath}/?error=expired`);
                    }
                }

                return next(); 
            }
        } catch (error) {
            console.error("Auth Middleware Error:", error);
            // 🟢 เปลี่ยนที่นี่ด้วย
            return res.redirect(`${basePath}/`);
        }
    }
    
    // 🟢 เปลี่ยนที่นี่ด้วย
    return res.redirect(`${basePath}/`);
};

module.exports = { requireAuth };
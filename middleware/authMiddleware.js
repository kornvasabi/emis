const db = require('../config/db'); // 🟢 อย่าลืมปรับ path ชี้ไปหาไฟล์ db ของคุณกรนะครับ

const requireAuth = async (req, res, next) => {
    // 1. ตรวจสอบว่ามี Session อยู่หรือไม่
    if (req.session && req.session.user) {
        try {
            // 2. แอบเช็คข้อมูลล่าสุดจาก Database (เพื่อให้เตะออกได้แบบ Real-time)
            const [users] = await db.query(
                'SELECT force_logout, expires_at FROM users WHERE id = ?', 
                [req.session.user.id]
            );

            if (users.length > 0) {
                const user = users[0];

                // 🔴 ด่านที่ 1: โดนแอดมินกดปุ่มเตะออกฉุกเฉินไหม?
                if (user.force_logout === 1) {
                    req.session.destroy();
                    // ส่งกลับหน้า Login พร้อมแนบคำว่า error=kicked ไปที่ URL
                    return res.redirect('/emis/?error=kicked'); 
                }

                // 🔴 ด่านที่ 2: หมดเวลาการใช้งานที่ตั้งไว้หรือยัง?
                if (user.expires_at) {
                    const now = new Date(); // เวลาปัจจุบันของเซิร์ฟเวอร์
                    const expireTime = new Date(user.expires_at); // เวลาที่หมดอายุ

                    if (now > expireTime) {
                        // ถ้าเวลาปัจจุบัน เลยเวลาหมดอายุไปแล้ว -> ทำลาย Session เตะออก!
                        req.session.destroy();
                        return res.redirect('/emis/?error=expired');
                    }
                }

                // 🟢 ผ่านทุกด่าน ให้ไปต่อได้
                return next(); 
            }
        } catch (error) {
            console.error("Auth Middleware Error:", error);
            // ถ้า DB พัง ก็ให้เด้งออกไปก่อนเพื่อความปลอดภัย
            return res.redirect('/emis/');
        }
    }
    
    // ถ้าไม่มี Session (ยังไม่ล็อกอิน)
    return res.redirect('/emis/');
};

module.exports = { requireAuth };
// ไฟล์: middleware/menuMiddleware.js
const db = require('../config/db');

// ... (ฟังก์ชัน loadMenus ของคุณกรที่มีอยู่แล้ว) ...

// 🟢 อัปเกรดฟังก์ชัน checkPermission ตัวเดิม
const checkPermission = async (req, res, next) => {
    try {
        // 1. ดึง Group ID จาก Session
        const groupId = req.session.user ? req.session.user.group_id : null;
        const currentPath = req.path; // เช่น '/user_list'

        if (!groupId) {
            return res.redirect('/');
        }

        // 2. ไปเช็คในฐานข้อมูลว่า Group นี้มีสิทธิ์ในหน้านี้ไหม
        const sql = `
            SELECT p.* FROM group_permissions p
            JOIN menus m ON p.menu_id = m.id
            WHERE p.group_id = ? AND m.link = ?
        `;
        const [perms] = await db.query(sql, [groupId, currentPath]);

        if (perms.length > 0) {
            const permission = perms[0];

            // ⛔ ถ้าถูกสั่งห้ามเข้า (can_view = 0)
            if (permission.can_view === 0) {
                return res.status(403).send('คุณไม่มีสิทธิ์เข้าถึงหน้านี้ครับ'); 
            }

            // 🚀 ถ้าเข้าได้ ให้ฝากตัวแปร permission ไปให้หน้า EJS ซ่อน/โชว์ปุ่ม
            res.locals.permission = permission; 
            req.permission = permission; 

            next(); // ปล่อยให้ผ่านไปที่ Controller

        } else {
            // ถ้าไม่พบข้อมูลการตั้งค่าสิทธิ์เลย
            return res.status(403).send('ไม่มีการตั้งค่าสิทธิ์สำหรับหน้าจอนี้');
        }

    } catch (error) {
        console.error("Permission Middleware Error:", error);
        res.status(500).send('ระบบตรวจสอบสิทธิ์ขัดข้อง');
    }
};

// 🟢 ส่งออกไปให้ app.js เรียกใช้ได้ทั้ง 2 ตัว
module.exports = { loadMenus, checkPermission };
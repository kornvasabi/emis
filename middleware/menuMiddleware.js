// ไฟล์: middleware/menuMiddleware.js
const db = require('../config/db');

const loadMenus = async (req, res, next) => {
    if (!req.session || !req.session.user) return next();

    try {
        const groupId = req.session.user.group_id || '1';

        const sql = `
            SELECT m.* FROM menus m
            INNER JOIN permissions p ON m.id = p.menu_id
            WHERE p.group_id = ?
            ORDER BY m.sort_order ASC;
        `;
        const [rows] = await db.query(sql, [groupId]);

        // 🟢 1. สร้าง Array เก็บเฉพาะ URL ที่ User คนนี้มีสิทธิ์เข้าถึง
        // แปลงจาก user_list.php เป็น /user_list
        const allowedUrls = rows
            .filter(item => item.link !== '#') // ตัดพวกเมนูแม่ที่เป็น # ออก
            .map(item => '/' + item.link.replace('.php', ''));

        // แอบเก็บรายชื่อ URL ที่อนุญาตไว้ใน res.locals
        res.locals.allowedUrls = allowedUrls;

        // --- โค้ดจัดกลุ่มยัดลูกใส่ไส้แม่เหมือนเดิม ---
        const menuTree = [];
        const parents = rows.filter(item => item.parent_id === 0);
        parents.forEach(parent => {
            parent.children = rows.filter(item => item.parent_id === parent.id);
            menuTree.push(parent);
        });

        res.locals.dynamicMenus = menuTree;
        next(); 
    } catch (error) {
        console.error("Menu Load Error:", error);
        res.locals.dynamicMenus = []; 
        res.locals.allowedUrls = []; 
        next();
    }
};

// 🟢 อัปเกรด checkPermission ให้รองรับสิทธิ์ Level และรองรับ API Routes
const checkPermission = async (req, res, next) => {
    let currentPath = req.path.substring(1); // ตัด / ตัวหน้าออก

    // ==========================================
    // 🚀 ทริคอัจฉริยะ: ตรวจจับว่าเป็น URL ของ API หรือไม่
    // ถ้าเป็น /api/customers/update/5 จะถูกตัดเหลือแค่ 'customers' เพื่อเอาไปหาในฐานข้อมูล
    // ==========================================
    if (currentPath.startsWith('api/')) {
        currentPath = currentPath.substring(4); // ตัดคำว่า 'api/' ออก
        currentPath = currentPath.split('/')[0]; // ตัดพวก /add, /update ทิ้ง เอาแค่ชื่อเมนูหลัก
    }

    // 1. อนุญาตให้เข้าหน้า Dashboard ได้เสมอ (ให้สิทธิ์สูงสุด Level 1 ไปเลย)
    if (currentPath === 'dashboard' || currentPath === 'emis/dashboard' || currentPath === '') {
        res.locals.permission = { can_view: 1, can_add: 1, can_edit: 1, can_delete: 1, access_level: 1 };
        req.currentPermission = res.locals.permission; // ส่งต่อให้ Controller
        return next();
    }
    
    try {
        // ดึง Group ID ของคนที่ล็อกอินอยู่
        const groupId = req.session.user ? req.session.user.group_id : null;
        if (!groupId) {
            // ถ้าเป็นการยิง API แล้ว Session หลุด ให้ส่ง JSON แจ้ง Error กลับไป
            if (req.path.includes('/api/')) return res.json({ status: 'error', message: 'Session หมดอายุ กรุณาล็อกอินใหม่' });
            return res.redirect('/');
        }
        
        // 2. Query ดึงสิทธิ์ (🟢 เพิ่ม p.access_level เข้ามาด้วย)
        const sql = `
            SELECT p.can_view, p.can_rpt, p.can_add, p.can_edit, p.can_delete, p.access_level 
            FROM group_permissions p
            JOIN menus m ON p.menu_id = m.id
            WHERE p.group_id = ? AND m.link = ?
        `;
        const [perms] = await db.query(sql, [groupId, currentPath]);
        
        // 3. ตรวจสอบว่ามีสิทธิ์เข้าดู (can_view = 1) หรือไม่?
        if (perms.length > 0 && perms[0].can_view === 1) {
            
            // 🚀 มีสิทธิ์ผ่าน! -> ฝากตัวแปรไปให้ EJS และ Controller ใช้งาน
            res.locals.permission = perms[0];  // สำหรับหน้า View โชว์/ซ่อนปุ่ม
            req.currentPermission = perms[0];  // สำหรับ API เอา Level ไปกรองสาขา
            
            return next(); 

        } else {
            console.log(`❌ บล็อกการเข้าถึง! ไม่มีสิทธิ์เข้า URL: ${req.path}`);

            // 🟢 ถ้าโจรพยายามแฮกยิง API เข้ามาตรงๆ ให้บล็อกและส่ง JSON กลับไปด่า
            if (req.path.includes('/api/')) {
                return res.json({ status: 'error', message: 'คุณไม่มีสิทธิ์ทำรายการนี้ครับ!' });
            }

            // ⛔ สำหรับหน้า View -> เตะกลับ Dashboard พร้อมโชว์ SweetAlert2 แบบหล่อๆ
            return res.send(`
                <!DOCTYPE html>
                <html lang="th">
                <head>
                    <meta charset="utf-8">
                    <title>Access Denied</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
                    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
                    <style>body { background-color: #f8f9fc; font-family: 'Kanit', sans-serif; }</style>
                </head>
                <body>
                    <script>
                        Swal.fire({
                            title: 'ปฏิเสธการเข้าถึง!',
                            text: 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้ครับ กรุณาติดต่อผู้ดูแลระบบ',
                            icon: 'error',
                            confirmButtonText: 'กลับสู่หน้าหลัก',
                            confirmButtonColor: '#e74a3b',
                            allowOutsideClick: false
                        }).then((result) => {
                            if (result.isConfirmed) {
                                window.location.href = '/emis/dashboard';
                            }
                        });
                    </script>
                </body>
                </html>
            `);
        }

    } catch (error) {
        console.error("Check Permission Error:", error);
        if (req.path.includes('/api/')) return res.json({ status: 'error', message: 'ระบบตรวจสอบสิทธิ์ขัดข้อง' });
        return res.status(500).send("ระบบตรวจสอบสิทธิ์ขัดข้อง");
    }
};

// 🟢 ส่งออก checkPermission ไปใช้ด้วย
module.exports = { loadMenus, checkPermission };
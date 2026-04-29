// ไฟล์: controllers/userController.js
const db = require('../config/db');
const bcrypt = require('bcryptjs');

const showUserList = async (req, res) => {
    try {
        // 🟢 1. วิ่งไปดึงข้อมูลผู้ใช้ พร้อมชื่อกลุ่ม สาขา และแผนก จาก MariaDB
        const sqlUsers = `
            SELECT 
                u.id, u.username, u.fullname, u.force_logout, u.last_activity,
                g.group_name, 
                b.branch_name, 
                d.dept_name
            FROM users u
            LEFT JOIN user_groups g ON u.group_id = g.id
            LEFT JOIN branches b ON u.branch_id = b.id
            LEFT JOIN departments d ON u.dept_id = d.id
            ORDER BY u.id ASC
        `;
        const [users] = await db.query(sqlUsers);
		
		// console.log("\n🕵️‍♂️ [ด่านตรวจ Data]: พบข้อมูลผู้ใช้จำนวน", users.length, "รายการ");
        // console.log("ตัวอย่างข้อมูลบรรทัดแรก:", users[0]);
		
        // 🟢 2. ดึง Master Data เผื่อเอาไปทำ Dropdown ในฟอร์มเพิ่มข้อมูล
        const [groups] = await db.query("SELECT * FROM user_groups");
        const [branches] = await db.query("SELECT * FROM branches");
        const [departments] = await db.query("SELECT * FROM departments");

        // 🟢 3. แพ็คของทั้งหมดใส่กล่อง แล้วโยนไปให้หน้า user_list.ejs
        res.render('user_list', { 
            title: 'จัดการผู้ใช้งาน - Myproject_ww',
            users: users,           // <--- ตัวนี้แหละครับที่ EJS ถามหา!
            groups: groups,
            branches: branches,
            departments: departments
        });

    } catch (error) {
        console.error("Fetch Users Error:", error);
        // ถ้า DB พัง ก็ต้องส่งกล่องเปล่าๆ ไปให้ EJS ด้วย หน้าเว็บจะได้ไม่ Error พังทลายครับ
        res.render('user_list', { 
            title: 'จัดการผู้ใช้งาน - Myproject_ww',
            users: [], 
            groups: [], 
            branches: [], 
            departments: []
        });
    }
};

// ... โค้ด showUserList เดิม ...

// 🟢 1. ฟังก์ชัน addUser (ตอนเพิ่มผู้ใช้ใหม่)
const addUser = async (req, res) => {
    try {
        // 🚀 รับค่า accessible_branches เข้ามาเพิ่ม (มันจะมาเป็น Array หรือ String ขึ้นอยู่กับว่าเลือกกี่อัน)
        const { username, password, fullname, group_id, branch_id, dept_id, accessible_branches, expires_at } = req.body;
        // ตัวอย่างการรับค่าใน Controller (ทั้ง Add และ Update)
        // const { username, password, fullname, group_id, branch_id, dept_id, force_logout, expires_at } = req.body;

        // 💡 ดักค่าว่างไว้ด้วย เพราะถ้าปล่อยว่าง มันจะส่งมาเป็น string เปล่าๆ ('')
        const paramExpiresAt = (expires_at && expires_at.trim() !== '') ? expires_at : null;

        // แล้วเอาตัวแปร paramExpiresAt ยัดใส่คำสั่ง UPDATE/INSERT SQL ครับ
        // UPDATE users SET ..., expires_at = ? WHERE id = ?
        if (!username || !password || !fullname) {
            return res.json({ status: 'error', message: 'กรุณากรอก Username, Password และชื่อ-นามสกุลให้ครบถ้วนครับ' });
        }

        const g_id = group_id ? group_id : null;
        const b_id = branch_id ? branch_id : null;
        const d_id = dept_id ? dept_id : null;
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const sqlInsert = `INSERT INTO users (username, password, fullname, group_id, branch_id, dept_id ,expires_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?)`;
        const [result] = await db.query(sqlInsert, [username, hashedPassword, fullname, g_id, b_id, d_id, paramExpiresAt]);
        
        const newUserId = result.insertId;

        // ==========================================
        // 🚀 1.1 นำข้อมูลสาขาที่เข้าถึงได้ ไป Insert ลงตาราง user_branches
        // ==========================================
        if (accessible_branches) {
            // แปลงให้อยู่ในรูป Array เสมอ (เผื่อเขาเลือกมาแค่อันเดียวมันจะส่งมาเป็น String)
            let branchesArray = Array.isArray(accessible_branches) ? accessible_branches : [accessible_branches];
            
            for (let acc_b_id of branchesArray) {
                await db.query("INSERT INTO user_branches (user_id, branch_id) VALUES (?, ?)", [newUserId, acc_b_id]);
            }
        }

        const sqlNewUser = `SELECT u.*, g.group_name, b.branch_name, d.dept_name FROM users u LEFT JOIN user_groups g ON u.group_id = g.id LEFT JOIN branches b ON u.branch_id = b.id LEFT JOIN departments d ON u.dept_id = d.id WHERE u.id = ?`;
        const [newUser] = await db.query(sqlNewUser, [newUserId]);

        res.json({ status: 'success', message: 'เพิ่มผู้ใช้งานและกำหนดสิทธิ์สาขาเรียบร้อยแล้ว!', data: newUser[0] });

    } catch (error) {
        console.error("Add User Error:", error);
        res.json({ status: 'error', message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูลครับ' });
    }
};

// 🟢 2. ฟังก์ชัน getUser (ตอนโหลดข้อมูลขึ้นฟอร์มแก้ไข)
const getUser = async (req, res) => {
    try {
        const userId = req.params.id; 
        const sql = "SELECT * FROM users WHERE id = ?";
        const [users] = await db.query(sql, [userId]);

        if (users.length > 0) {
            // ==========================================
            // 🚀 2.1 วิ่งไปดึงข้อมูลสาขาที่ Map ไว้ ส่งกลับไปด้วย
            // ==========================================
            const [mapped] = await db.query("SELECT branch_id FROM user_branches WHERE user_id = ?", [userId]);
            let mappedBranches = mapped.map(m => m.branch_id); // แปลง Object ให้กลายเป็น Array เช่น [1, 2, 4]

            // ส่งข้อมูลกลับไป 2 ก้อน (data คือข้อมูลหลัก, mapped_branches คือสิทธิ์)
            res.json({ status: 'success', data: users[0], mapped_branches: mappedBranches });
        } else {
            res.json({ status: 'error', message: 'ไม่พบข้อมูลผู้ใช้งานในระบบ' });
        }
    } catch (error) {
        console.error("Get User Error:", error);
        res.json({ status: 'error', message: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
    }
};

// 🟢 3. ฟังก์ชัน updateUser (ตอนกดอัปเดต)
const updateUser = async (req, res) => {
    try {
        const { id, password, fullname, group_id, branch_id, dept_id, force_logout, accessible_branches, expires_at } = req.body;
        // const { username, password, fullname, group_id, branch_id, dept_id, force_logout, expires_at } = req.body;

        // 💡 ดักค่าว่างไว้ด้วย เพราะถ้าปล่อยว่าง มันจะส่งมาเป็น string เปล่าๆ ('')
        const paramExpiresAt = (expires_at && expires_at.trim() !== '') ? expires_at : null;

        const g_id = group_id ? group_id : null;
        const b_id = branch_id ? branch_id : null;
        const d_id = dept_id ? dept_id : null;

        let sqlUpdate;
        let queryParams;

        if (password) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            sqlUpdate = `UPDATE users SET password = ?, fullname = ?, group_id = ?, branch_id = ?, dept_id = ?, force_logout = ?, expires_at = ? WHERE id = ?`;
            queryParams = [hashedPassword, fullname, g_id, b_id, d_id, force_logout, paramExpiresAt, id];
        } else {
            sqlUpdate = `UPDATE users SET fullname = ?, group_id = ?, branch_id = ?, dept_id = ?, force_logout = ?, expires_at = ? WHERE id = ?`;
            queryParams = [fullname, g_id, b_id, d_id, force_logout, paramExpiresAt, id];
        }
        await db.query(sqlUpdate, queryParams);

        // ==========================================
        // 🚀 3.1 ลบสิทธิ์เก่าทิ้งให้หมด แล้ว Insert สิทธิ์ใหม่เข้าไปแทน
        // ==========================================
        await db.query("DELETE FROM user_branches WHERE user_id = ?", [id]);
        
        if (accessible_branches) {
            let branchesArray = Array.isArray(accessible_branches) ? accessible_branches : [accessible_branches];
            for (let acc_b_id of branchesArray) {
                await db.query("INSERT INTO user_branches (user_id, branch_id) VALUES (?, ?)", [id, acc_b_id]);
            }
        }

        const sqlUpdatedUser = `SELECT u.*, g.group_name, b.branch_name, d.dept_name FROM users u LEFT JOIN user_groups g ON u.group_id = g.id LEFT JOIN branches b ON u.branch_id = b.id LEFT JOIN departments d ON u.dept_id = d.id WHERE u.id = ?`;
        const [updatedUser] = await db.query(sqlUpdatedUser, [id]);

        res.json({ status: 'success', message: 'อัปเดตข้อมูลและสิทธิ์สาขาเรียบร้อยแล้ว!', data: updatedUser[0] });

    } catch (error) {
        console.error("Update User Error:", error);
        res.json({ status: 'error', message: 'เกิดข้อผิดพลาดในการอัปเดตข้อมูล' });
    }
};
// ==========================================
// 🟢 3. API สำหรับลบข้อมูลผู้ใช้งาน
// ==========================================
const deleteUser = async (req, res) => {
    try {
        const { id } = req.body;

        // 💡 Defensive Programming: ดักไว้ไม่ให้ลบ Super Admin (ID 1) เด็ดขาด
        if (id == 1) {
            return res.json({ status: 'error', message: 'ไม่อนุญาตให้ลบ Super Admin ออกจากระบบครับ!' });
        }

        const sql = "DELETE FROM users WHERE id = ?";
        await db.query(sql, [id]);

        res.json({ status: 'success', message: 'ลบข้อมูลผู้ใช้งานออกจากระบบเรียบร้อยแล้ว!' });

    } catch (error) {
        console.error("Delete User Error:", error);
        res.json({ status: 'error', message: 'เกิดข้อผิดพลาด ไม่สามารถลบข้อมูลได้' });
    }
};

// 🟢 อย่าลืมอัปเดตบรรทัดล่างสุดให้มี deleteUser ด้วยนะครับ
module.exports = { showUserList, addUser, getUser, updateUser, deleteUser };
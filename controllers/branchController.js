const db = require('../config/db');

// 🟢 1. เปิดหน้าจอจัดการสาขา
exports.branchPage = async (req, res) => {
    res.render('branches', { title: 'จัดการข้อมูลสาขา' });
};

// 🟢 2. ดึงข้อมูลสาขาทั้งหมด (API)
exports.getBranches = async (req, res) => {
    try {
        const [branches] = await db.query(`
            SELECT * FROM branches 
            WHERE is_active = 1 
            ORDER BY id DESC
        `);
        res.json({ status: 'success', data: branches });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'ดึงข้อมูลไม่สำเร็จ' });
    }
};

// 🟢 3. บันทึกสาขาใหม่ (API)
exports.addBranch = async (req, res) => {
    try {
        const { branch_code, branch_name, contact_number, address, api_url } = req.body;

        // เช็คก่อนว่ารหัสสาขาซ้ำไหม (เพื่อความปลอดภัย)
        const [existing] = await db.query('SELECT id FROM branches WHERE branch_code = ?', [branch_code]);
        if (existing.length > 0) {
            return res.json({ status: 'error', message: 'รหัสสาขานี้มีในระบบแล้ว กรุณาใช้รหัสอื่น' });
        }

        await db.query(`
            INSERT INTO branches (branch_code, branch_name, contact_number, address, api_url, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, NOW(), NOW())
        `, [branch_code, branch_name, contact_number, address, api_url]);

        res.json({ status: 'success', message: 'บันทึกข้อมูลสาขาสำเร็จ!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'เกิดข้อผิดพลาดในการบันทึก' });
    }
};

// 🟢 4. แก้ไขข้อมูลสาขา (API)
exports.updateBranch = async (req, res) => {
    try {
        const id = req.params.id;
        const { branch_code, branch_name, contact_number, address, api_url } = req.body;

        await db.query(`
            UPDATE branches 
            SET branch_code = ?, branch_name = ?, contact_number = ?, address = ?, api_url = ?, updated_at = NOW()
            WHERE id = ?
        `, [branch_code, branch_name, contact_number, address, api_url, id]);

        res.json({ status: 'success', message: 'อัปเดตข้อมูลสำเร็จ!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'อัปเดตไม่สำเร็จ' });
    }
};

// 🟢 5. ยกเลิกการใช้งานสาขา (Soft Delete) (API)
exports.deleteBranch = async (req, res) => {
    try {
        const id = req.params.id;
        // เปลี่ยนสถานะ is_active เป็น 0 (เพื่อเก็บประวัติไว้ดูย้อนหลัง)
        await db.query('UPDATE branches SET is_active = 0, updated_at = NOW() WHERE id = ?', [id]);
        
        res.json({ status: 'success', message: 'ยกเลิกสาขานี้เรียบร้อยแล้ว' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'ยกเลิกข้อมูลไม่สำเร็จ' });
    }
};
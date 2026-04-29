const db = require('../config/db');

// 🟢 1. เปิดหน้าจอและดึง Master Data ไปรอไว้
exports.machineTransPage = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const userBranchId = req.session.user.branch_id;
        const accessLevel = req.currentPermission ? Number(req.currentPermission.access_level) : 3;

        let branchSql = 'SELECT id, branch_name FROM branches WHERE is_active = 1';
        let branchParams = [];

        if (accessLevel === 3) {
            branchSql += ' AND id = ?';
            branchParams.push(userBranchId);
        } else if (accessLevel === 2) {
            branchSql += ' AND (id = ? OR id IN (SELECT branch_id FROM user_branches WHERE user_id = ?))';
            branchParams.push(userBranchId, userId);
        }

        const [branches] = await db.query(branchSql, branchParams);
        const [machines] = await db.query('SELECT id, branch_id, machine_name, machine_type FROM machines WHERE is_active = 1');

        res.render('machine_trans', {
            title: 'บันทึกการทำงานเครื่องจักร',
            branches: branches,
            machines: machines,
            accessLevel: accessLevel
        });

    } catch (error) {
        console.error("Machine Trans Page Error:", error);
        res.status(500).send("Server Error");
    }
};

// 🟢 2. ดึงข้อมูลแสดงในตาราง (เพิ่ม Filter วันที่)
exports.getTransactions = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const userBranchId = req.session.user.branch_id;
        const accessLevel = req.currentPermission ? Number(req.currentPermission.access_level) : 3;

        // 🚀 รับค่า วันที่เริ่มต้น และ วันที่สิ้นสุด จากหน้าเว็บ (ถ้าไม่ส่งมา ให้ใช้วันปัจจุบัน)
        const today = new Date().toISOString().split('T')[0]; 
        const startDate = req.query.startDate || today;
        const endDate = req.query.endDate || today;

        let sql = `
            SELECT t.*, 
                   DATE_FORMAT(t.record_date, '%Y-%m-%d') as raw_date,
                   DATE_FORMAT(t.record_date, '%d/%m/%Y') as display_date,
                   b.branch_name, 
                   m.machine_name, m.machine_type,
                   u.fullname as created_by_name
            FROM machine_trans t
            LEFT JOIN branches b ON t.branch_id = b.id
            LEFT JOIN machines m ON t.machine_id = m.id
            LEFT JOIN users u ON t.created_by = u.id
            WHERE t.record_date BETWEEN ? AND ? 
        `;
        
        // ใส่ parameters ของวันที่เข้าไปเป็น 2 ตัวแรก
        let params = [startDate, endDate];

        if (accessLevel === 3) {
            sql += ` AND t.branch_id = ?`;
            params.push(userBranchId);
        } else if (accessLevel === 2) {
            sql += ` AND (t.branch_id = ? OR t.branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = ?))`;
            params.push(userBranchId, userId);
        }

        sql += ` ORDER BY t.record_date DESC, t.id DESC`;

        const [data] = await db.query(sql, params);
        res.json({ status: 'success', data: data });

    } catch (error) {
        console.error("Get Machine Trans Error:", error);
        res.json({ status: 'error', message: 'ดึงข้อมูลไม่สำเร็จ' });
    }
};

// 🟢 3. บันทึกข้อมูล (แบบ Batch หลายรายการพร้อมกัน)
exports.addTransactionBatch = async (req, res) => {
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        const { record_date, branch_id } = req.body;
        const staffId = req.session.user.id;

        // 🚀 ดักจับชื่อตัวแปรที่ Express แปลงมา (อาจมีหรือไม่มีก้ามปู [])
        let machineIds = req.body.machine_id || req.body['machine_id[]'];
        let machineQtys = req.body.machine_qty || req.body['machine_qty[]'];
        let workHours = req.body.working_hours || req.body['working_hours[]'];
        let breakHours = req.body.breakdown_hours || req.body['breakdown_hours[]'];
        let remarks = req.body.remarks || req.body['remarks[]'];

        if (!machineIds) {
            throw new Error("ไม่มีข้อมูลเครื่องจักร กรุณากดเพิ่มแถวเครื่องจักร");
        }

        // แปลงเป็น Array เสมอ (เผื่อ User กรอกมาแค่แถวเดียว)
        if (!Array.isArray(machineIds)) {
            machineIds = [machineIds];
            machineQtys = [machineQtys];
            workHours = [workHours];
            breakHours = [breakHours];
            remarks = [remarks];
        }

        for (let i = 0; i < machineIds.length; i++) {
            let mId = machineIds[i];
            let mQty = machineQtys[i] || '1'; // ดึงจำนวนเครื่อง
            let wHrs = parseFloat(workHours[i]) || 0;
            let bHrs = parseFloat(breakHours[i]) || 0;
            let rmks = remarks[i] || '';

            if (mId) {
                await connection.query(`
                    INSERT INTO machine_trans (branch_id, record_date, machine_id, machine_qty, working_hours, breakdown_hours, remarks, created_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [branch_id, record_date, mId, mQty, wHrs, bHrs, rmks, staffId]);
            }
        }

        await connection.commit();
        res.json({ status: 'success', message: 'บันทึกข้อมูลเครื่องจักรเรียบร้อยแล้ว' });

    } catch (error) {
        await connection.rollback();
        console.error("Add Machine Trans Error:", error);
        res.json({ status: 'error', message: error.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    } finally {
        connection.release();
    }
};

// 🟢 4. แก้ไขข้อมูล (ทีละรายการ)
exports.updateTransaction = async (req, res) => {
    try {
        const id = req.params.id;
        const { machine_qty, working_hours, breakdown_hours, remarks } = req.body;

        await db.query(`
            UPDATE machine_trans 
            SET machine_qty = ?, working_hours = ?, breakdown_hours = ?, remarks = ?
            WHERE id = ?
        `, [machine_qty, working_hours, breakdown_hours, remarks, id]);

        res.json({ status: 'success', message: 'อัปเดตข้อมูลสำเร็จ' });
    } catch (error) {
        console.error("Update Machine Trans Error:", error);
        res.json({ status: 'error', message: 'อัปเดตข้อมูลไม่สำเร็จ' });
    }
};

// 🟢 5. ลบข้อมูล
exports.deleteTransaction = async (req, res) => {
    try {
        const id = req.params.id;
        await db.query(`DELETE FROM machine_trans WHERE id = ?`, [id]);
        res.json({ status: 'success', message: 'ยกเลิกรายการสำเร็จ' });
    } catch (error) {
        console.error("Delete Machine Trans Error:", error);
        res.json({ status: 'error', message: 'ลบข้อมูลไม่สำเร็จ' });
    }
};
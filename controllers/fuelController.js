const db = require('../config/db');

// 🟢 1. เปิดหน้าจอและดึง Master Data ไปรอไว้
exports.fuelTransPage = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const userBranchId = req.session.user.branch_id;
        const accessLevel = req.currentPermission ? Number(req.currentPermission.access_level) : 3;

        let branchSql = 'SELECT id, branch_name FROM branches WHERE is_active = 1';
        let branchParams = [];

        // เช็คสิทธิ์การมองเห็นสาขา
        if (accessLevel === 3) {
            branchSql += ' AND id = ?';
            branchParams.push(userBranchId);
        } else if (accessLevel === 2) {
            branchSql += ' AND (id = ? OR id IN (SELECT branch_id FROM user_branches WHERE user_id = ?))';
            branchParams.push(userBranchId, userId);
        }

        const [branches] = await db.query(branchSql, branchParams);
        const [engineTypes] = await db.query('SELECT id, type_name FROM engine_types ORDER BY type_name ASC');
        // ดึง engines ทั้งหมดไปรอไว้ เดี๋ยวหน้าเว็บ EJS ค่อยเอาไปกรอง (Filter) ด้วย JavaScript เวลาเลือกสาขาและประเภท
        const [engines] = await db.query('SELECT id, branch_id, engine_type_id, engine_code FROM engines WHERE is_active = 1');

        res.render('fuel_trans', {
            title: 'บันทึกการใช้เชื้อเพลิง',
            branches: branches,
            engineTypes: engineTypes,
            engines: engines,
            accessLevel: accessLevel
        });

    } catch (error) {
        console.error("Fuel Trans Page Error:", error);
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
                   DATE_FORMAT(t.transaction_date, '%Y-%m-%d') as raw_date,
                   DATE_FORMAT(t.transaction_date, '%d/%m/%Y') as display_date,
                   b.branch_name, 
                   et.type_name,
                   e.engine_code,
                   u.fullname as created_by_name
            FROM fuel_transactions t
            LEFT JOIN branches b ON t.branch_id = b.id
            LEFT JOIN engine_types et ON t.engine_type_id = et.id
            LEFT JOIN engines e ON t.engine_id = e.id
            LEFT JOIN users u ON t.created_by = u.id
            WHERE t.transaction_date BETWEEN ? AND ? 
              AND t.status != 'cancelled'
        `;
        
        // ใส่ parameters ของวันที่เข้าไปเป็น 2 ตัวแรก
        let params = [startDate, endDate];

        // ดักสิทธิ์การมองเห็นข้อมูลตาราง
        if (accessLevel === 3) {
            sql += ` AND t.branch_id = ?`;
            params.push(userBranchId);
        } else if (accessLevel === 2) {
            sql += ` AND (t.branch_id = ? OR t.branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = ?))`;
            params.push(userBranchId, userId);
        }

        sql += ` ORDER BY t.transaction_date DESC, t.id DESC`;

        const [data] = await db.query(sql, params);
        res.json({ status: 'success', data: data });

    } catch (error) {
        console.error("Get Fuel Trans Error:", error);
        res.json({ status: 'error', message: 'ดึงข้อมูลไม่สำเร็จ' });
    }
};

// 🟢 3. บันทึกข้อมูล (แบบ Batch หลายรายการพร้อมกัน)
exports.addTransactionBatch = async (req, res) => {
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
        const { transaction_date, branch_id } = req.body;
        const staffId = req.session.user.id;

        // 🚀 ดักจับชื่อตัวแปรที่ Express แปลงมา (อาจมีหรือไม่มีก้ามปู [])
        let engineTypeIds = req.body.engine_type_id || req.body['engine_type_id[]'];
        let engineIds = req.body.engine_id || req.body['engine_id[]'];
        let fuelLiters = req.body.fuel_liters || req.body['fuel_liters[]'];
        let workHours = req.body.working_hours || req.body['working_hours[]'];
        let remarks = req.body.remarks || req.body['remarks[]'];

        if (!engineIds) {
            throw new Error("ไม่มีข้อมูลเครื่องยนต์ กรุณากดเพิ่มรายการ");
        }

        // แปลงเป็น Array เสมอ (เผื่อ User กรอกมาแค่แถวเดียว)
        if (!Array.isArray(engineIds)) {
            engineTypeIds = [engineTypeIds];
            engineIds = [engineIds];
            fuelLiters = [fuelLiters];
            workHours = [workHours];
            remarks = [remarks];
        }
        
        for (let i = 0; i < engineIds.length; i++) {
            let typeId = engineTypeIds[i];
            let eId = engineIds[i];
            let fLiters = parseFloat(fuelLiters[i]) || 0;
            let wHrs = parseFloat(workHours[i]) || 0;
            let rmks = remarks[i] || '';
            
            // คำนวณอัตราสิ้นเปลืองฝั่ง Server เพื่อความแม่นยำ
            let rate = wHrs > 0 ? (fLiters / wHrs).toFixed(2) : 0;

            // ==========================================
            // 🚀 1. เช็คข้อมูลซ้ำซ้อน
            // ==========================================
            const sqlCheck = `
                SELECT e.engine_code 
                FROM fuel_transactions t
                LEFT JOIN engines e ON t.engine_id = e.id
                WHERE t.branch_id = ? 
                  AND t.engine_id = ? 
                  AND t.transaction_date = ? 
                  AND t.status != 'cancelled'
            `;
            
            const [existingRecord] = await connection.query(sqlCheck, [branch_id, eId, transaction_date]);

            // ถ้าเจอข้อมูลซ้ำ
            if (existingRecord.length > 0) {
                const engineCode = existingRecord[0].engine_code || 'เครื่องยนต์/รถยก นี้';
                return res.json({ 
                    status: 'error', 
                    message: `มีการบันทึกข้อมูลเชื้อเพลิงของทะเบียน "${engineCode}" ในวันนี้ไปแล้วครับ!\n\nหากต้องการแก้ไข กรุณายกเลิกหรือลบรายการเดิมก่อนครับ` 
                });
            }
            
            if (eId) {
                await connection.query(`
                    INSERT INTO fuel_transactions 
                    (branch_id, transaction_date, engine_type_id, engine_id, fuel_liters, working_hours, consumption_rate, remarks, created_by, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
                `, [branch_id, transaction_date, typeId, eId, fLiters, wHrs, rate, rmks, staffId]);
            }
        }

        await connection.commit();
        res.json({ status: 'success', message: 'บันทึกข้อมูลเชื้อเพลิงเรียบร้อยแล้ว' });

    } catch (error) {
        await connection.rollback();
        console.error("Add Fuel Trans Error:", error);
        res.json({ status: 'error', message: error.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    } finally {
        connection.release();
    }
};

// 🟢 4. แก้ไขข้อมูล (ทีละรายการ)
exports.updateTransaction = async (req, res) => {
    try {
        const id = req.params.id;
        const { fuel_liters, working_hours, remarks } = req.body;

        const fLiters = parseFloat(fuel_liters) || 0;
        const wHrs = parseFloat(working_hours) || 0;
        const rate = wHrs > 0 ? (fLiters / wHrs).toFixed(2) : 0; // คำนวณใหม่ตอนอัปเดต

        await db.query(`
            UPDATE fuel_transactions 
            SET fuel_liters = ?, working_hours = ?, consumption_rate = ?, remarks = ?
            WHERE id = ?
        `, [fLiters, wHrs, rate, remarks, id]);

        res.json({ status: 'success', message: 'อัปเดตข้อมูลสำเร็จ' });
    } catch (error) {
        console.error("Update Fuel Trans Error:", error);
        res.json({ status: 'error', message: 'อัปเดตข้อมูลไม่สำเร็จ' });
    }
};

// 🟢 5. ลบข้อมูล (เปลี่ยนสถานะเป็น cancelled แทนลบจริง เพราะเรามีคอลัมน์ status ใน Database แล้ว)
exports.deleteTransaction = async (req, res) => {
    try {
        const id = req.params.id;
        // ใช้ Soft Delete โดยอัปเดต status เป็น 'cancelled'
        await db.query(`UPDATE fuel_transactions SET status = 'cancelled' WHERE id = ?`, [id]);
        res.json({ status: 'success', message: 'ยกเลิกรายการสำเร็จ' });
    } catch (error) {
        console.error("Delete Fuel Trans Error:", error);
        res.json({ status: 'error', message: 'ลบข้อมูลไม่สำเร็จ' });
    }
};
const db = require('../config/db');

// ฟังก์ชันช่วยคำนวณเปอร์เซ็นต์ (ป้องกันการหารด้วย 0)
const calculatePercentage = (dropValue, totalCount) => {
    const drop = parseFloat(dropValue) || 0;
    const total = parseFloat(totalCount) || 0;
    if (total > 0) {
        return ((drop / total) * 100).toFixed(2);
    }
    return 0.00;
};

// 🟢 1. เปิดหน้าจอและดึงสาขาตามสิทธิ์
exports.boilerPressurePage = async (req, res) => {
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

        res.render('boiler_pressures', {
            title: 'ระบบบันทึกแรงดันไอน้ำปลายทางบอยเลอร์',
            branches: branches,
            accessLevel: accessLevel,
            userBranchId: userBranchId
        });

    } catch (error) {
        console.error("Boiler Pressure Page Error:", error);
        res.status(500).send("Server Error");
    }
};

// 🟢 2. ดึงข้อมูลแสดงในตาราง (Filter วันที่และสาขา)
exports.getPressures = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const userBranchId = req.session.user.branch_id;
        const accessLevel = req.currentPermission ? Number(req.currentPermission.access_level) : 3;

        const today = new Date().toISOString().split('T')[0]; 
        const startDate = req.query.startDate || today;
        const endDate = req.query.endDate || today;

        let sql = `
            SELECT p.*, 
                   DATE_FORMAT(p.record_date, '%Y-%m-%d') as raw_date,
                   DATE_FORMAT(p.record_date, '%d/%m/%Y') as display_date,
                   b.branch_name, 
                   u_create.fullname as created_by_name,
                   u_update.fullname as updated_by_name
            FROM boiler_steam_pressures p
            LEFT JOIN branches b ON p.branch_id = b.id
            LEFT JOIN users u_create ON p.created_by = u_create.id
            LEFT JOIN users u_update ON p.updated_by = u_update.id
            WHERE p.record_date BETWEEN ? AND ? 
              AND p.status != 'cancelled'
        `;
        
        let params = [startDate, endDate];

        // ดักสิทธิ์การมองเห็นข้อมูลตาราง
        if (accessLevel === 3) {
            sql += ` AND p.branch_id = ?`;
            params.push(userBranchId);
        } else if (accessLevel === 2) {
            sql += ` AND (p.branch_id = ? OR p.branch_id IN (SELECT branch_id FROM user_branches WHERE user_id = ?))`;
            params.push(userBranchId, userId);
        }

        sql += ` ORDER BY p.record_date DESC, p.id DESC`;

        const [data] = await db.query(sql, params);
        res.json({ status: 'success', data: data });

    } catch (error) {
        console.error("Get Boiler Pressures Error:", error);
        res.json({ status: 'error', message: 'ดึงข้อมูลไม่สำเร็จ' });
    }
};

// 🟢 3. บันทึกข้อมูล
exports.addPressure = async (req, res) => {
    try {
        const staffId = req.session.user.id;
        const { branch_id, record_date, total_count, total_drops, pm_drops, non_pm_drops, remarks } = req.body;

        // 🚀 1. เช็คข้อมูลซ้ำซ้อน (1 วัน ควรคีย์ได้ 1 รายการต่อสาขา)
        const sqlCheck = `
            SELECT id FROM boiler_steam_pressures 
            WHERE branch_id = ? AND record_date = ? AND status != 'cancelled'
        `;
        const [existingRecord] = await db.query(sqlCheck, [branch_id, record_date]);

        if (existingRecord.length > 0) {
            return res.json({ 
                status: 'error', 
                message: `สาขานี้มีการบันทึกข้อมูลของวันที่ ${record_date} ไปแล้วครับ\nหากต้องการแก้ไขกรุณากดที่ปุ่มแก้ไขรายการเดิมครับ` 
            });
        }

        // 🚀 2. คำนวณเปอร์เซ็นต์
        const t_count = parseInt(total_count) || 0;
        const t_drops = parseInt(total_drops) || 0;
        const p_drops = parseInt(pm_drops) || 0;
        const n_drops = parseInt(non_pm_drops) || 0;

        const p_total = calculatePercentage(t_drops, t_count);
        const p_pm = calculatePercentage(p_drops, t_count);
        const p_non_pm = calculatePercentage(n_drops, t_count);

        // 🚀 3. บันทึกลงฐานข้อมูล
        await db.query(`
            INSERT INTO boiler_steam_pressures 
            (branch_id, record_date, total_count, total_drops, pm_drops, non_pm_drops, 
             percent_total_drops, percent_pm_drops, percent_non_pm_drops, remarks, created_by, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        `, [
            branch_id, record_date, t_count, t_drops, p_drops, n_drops, 
            p_total, p_pm, p_non_pm, remarks || '', staffId
        ]);

        res.json({ status: 'success', message: 'บันทึกข้อมูลเรียบร้อยแล้ว' });

    } catch (error) {
        console.error("Add Boiler Pressure Error:", error);
        res.json({ status: 'error', message: error.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    }
};

// 🟢 4. แก้ไขข้อมูล
exports.updatePressure = async (req, res) => {
    try {
        const id = req.params.id;
        const staffId = req.session.user.id;
        const { total_count, total_drops, pm_drops, non_pm_drops, remarks } = req.body;

        // คำนวณเปอร์เซ็นต์ใหม่
        const t_count = parseInt(total_count) || 0;
        const t_drops = parseInt(total_drops) || 0;
        const p_drops = parseInt(pm_drops) || 0;
        const n_drops = parseInt(non_pm_drops) || 0;

        const p_total = calculatePercentage(t_drops, t_count);
        const p_pm = calculatePercentage(p_drops, t_count);
        const p_non_pm = calculatePercentage(n_drops, t_count);

        // อัปเดตข้อมูล และอัปเดตคนแก้ไข (updated_by)
        await db.query(`
            UPDATE boiler_steam_pressures 
            SET total_count = ?, total_drops = ?, pm_drops = ?, non_pm_drops = ?,
                percent_total_drops = ?, percent_pm_drops = ?, percent_non_pm_drops = ?,
                remarks = ?, updated_by = ?
            WHERE id = ?
        `, [
            t_count, t_drops, p_drops, n_drops, 
            p_total, p_pm, p_non_pm, 
            remarks || '', staffId, id
        ]);

        res.json({ status: 'success', message: 'อัปเดตข้อมูลสำเร็จ' });

    } catch (error) {
        console.error("Update Boiler Pressure Error:", error);
        res.json({ status: 'error', message: 'อัปเดตข้อมูลไม่สำเร็จ' });
    }
};

// 🟢 5. ลบข้อมูล (Soft Delete)
exports.deletePressure = async (req, res) => {
    try {
        const id = req.params.id;
        const staffId = req.session.user.id;
        
        // ยกเลิกรายการและอัปเดตว่าใครเป็นคนกดยกเลิก
        await db.query(`
            UPDATE boiler_steam_pressures 
            SET status = 'cancelled', updated_by = ? 
            WHERE id = ?
        `, [staffId, id]);
        
        res.json({ status: 'success', message: 'ยกเลิกรายการสำเร็จ' });
    } catch (error) {
        console.error("Delete Boiler Pressure Error:", error);
        res.json({ status: 'error', message: 'ลบข้อมูลไม่สำเร็จ' });
    }
};
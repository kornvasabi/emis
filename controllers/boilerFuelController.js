const db = require('../config/db');

// 🟢 ฟังก์ชันผู้ช่วย: คำนวณสูตรคณิตศาสตร์ทั้ง 5 ส่วนให้จบในที่เดียว
const calculateFuelMath = (data, stdValue) => {
    // 4.1: เชื้อเพลิงที่ใช้ (ตัน)
    const sawdust_weight = parseFloat(data.sawdust_weight) || 0;
    const slab_wood_weight = parseFloat(data.slab_wood_weight) || 0;
    const scrap_wood_weight = parseFloat(data.scrap_wood_weight) || 0;
    const total_fuel_weight = sawdust_weight + slab_wood_weight + scrap_wood_weight;

    // 4.2: ราคาเชื้อเพลิง (บาท)
    const sawdust_price = parseFloat(data.sawdust_price) || 0;
    const slab_wood_price = parseFloat(data.slab_wood_price) || 0;
    const scrap_wood_price = parseFloat(data.scrap_wood_price) || 0;
    const total_fuel_price = sawdust_price + slab_wood_price + scrap_wood_price;

    // 4.3: การผลิตไอน้ำ (ตัน/วัน)
    const steam_production = parseFloat(data.steam_production) || 0;
    const working_hours = parseFloat(data.working_hours) || 0;
    const steam_per_hour = working_hours > 0 ? (steam_production / working_hours) : 0;

    // 4.4: ค่าเชื้อเพลิง (บาท/ตันไอน้ำ)
    const fuel_cost_per_steam = steam_production > 0 ? (total_fuel_price / steam_production) : 0;

    // 4.5: สรุปเชื้อเพลิงที่ใช้ (กิโลกรัม/ตันไอน้ำ)
    const actual_fuel_usage = steam_production > 0 ? ((total_fuel_weight / steam_production) * 1000) : 0;
    const std_fuel_value = parseFloat(stdValue) || 0;
    const fuel_usage_diff = std_fuel_value - actual_fuel_usage;

    return {
        sawdust_weight, slab_wood_weight, scrap_wood_weight, total_fuel_weight,
        sawdust_price, slab_wood_price, scrap_wood_price, total_fuel_price,
        steam_production, working_hours, steam_per_hour,
        fuel_cost_per_steam,
        actual_fuel_usage, std_fuel_value, fuel_usage_diff
    };
};

// 🟢 1. เปิดหน้าจอและดึงข้อมูล Master Data ตามสิทธิ์
exports.boilerFuelPage = async (req, res) => {
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
        
        // ดึงรายชื่อบอยเลอร์ทั้งหมดไปรอไว้กรองในหน้าเว็บ
        const [boilers] = await db.query('SELECT id, branch_id, boiler_name FROM boilers WHERE is_active = 1 ORDER BY boiler_name ASC');

        res.render('boiler_fuels', {
            title: 'ระบบบันทึกการใช้เชื้อเพลิงบอยเลอร์',
            branches: branches,
            boilers: boilers,
            accessLevel: accessLevel,
            userBranchId: userBranchId
        });

    } catch (error) {
        console.error("Boiler Fuel Page Error:", error);
        res.status(500).send("Server Error");
    }
};

// 🟢 2. ดึงข้อมูลแสดงในตาราง (Filter วันที่และสาขา)
exports.getTransactions = async (req, res) => {
    try {
        const userId = req.session.user.id;
        const userBranchId = req.session.user.branch_id;
        const accessLevel = req.currentPermission ? Number(req.currentPermission.access_level) : 3;

        const today = new Date().toISOString().split('T')[0]; 
        const startDate = req.query.startDate || today;
        const endDate = req.query.endDate || today;

        let sql = `
            SELECT t.*, 
                   DATE_FORMAT(t.record_date, '%d/%m/%Y') as display_date,
                   b.branch_name, 
                   bl.boiler_name,
                   u_create.fullname as created_by_name
            FROM boiler_fuel_transactions t
            LEFT JOIN branches b ON t.branch_id = b.id
            LEFT JOIN boilers bl ON t.boiler_id = bl.id
            LEFT JOIN users u_create ON t.created_by = u_create.id
            WHERE t.record_date BETWEEN ? AND ? 
              AND t.status != 'cancelled'
        `;
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
        console.error("Get Boiler Fuels Error:", error);
        res.json({ status: 'error', message: 'ดึงข้อมูลไม่สำเร็จ' });
    }
};

// 🟢 3. บันทึกข้อมูล
exports.addTransaction = async (req, res) => {
    try {
        const staffId = req.session.user.id;
        const { branch_id, record_date, boiler_id, remarks } = req.body;

        // 🚀 1. เช็คข้อมูลซ้ำซ้อน (1 วัน/1 สาขา/1 บอยเลอร์ คีย์ได้แค่ 1 รายการ)
        const sqlCheck = `
            SELECT bl.boiler_name FROM boiler_fuel_transactions t
            LEFT JOIN boilers bl ON t.boiler_id = bl.id
            WHERE t.branch_id = ? AND t.record_date = ? AND t.boiler_id = ? AND t.status != 'cancelled'
        `;
        const [existingRecord] = await db.query(sqlCheck, [branch_id, record_date, boiler_id]);

        if (existingRecord.length > 0) {
            return res.json({ 
                status: 'error', 
                message: `บอยเลอร์ "${existingRecord[0].boiler_name}" ของวันที่ ${record_date} ถูกบันทึกไปแล้ว\nกรุณาแก้ไขรายการเดิมแทนครับ` 
            });
        }

        // 🚀 2. ดึงค่า STD เชื้อเพลิงล่าสุดของสาขานี้มาใช้เปรียบเทียบ
        const [stdData] = await db.query(`SELECT std_value FROM fuel_standards WHERE branch_id = ? AND is_active = 1 ORDER BY id DESC LIMIT 1`, [branch_id]);
        
        if (stdData.length === 0) {
            return res.json({ 
                status: 'error', 
                message: `ยังไม่มีการตั้งค่า STD เชื้อเพลิงสำหรับสาขานี้ กรุณาติดต่อแอดมินเพื่อตั้งค่าก่อนครับ` 
            });
        }
        
        const current_std_value = stdData[0].std_value;

        // 🚀 3. เข้าสู่สูตรคำนวณสุดล้ำ!
        const calc = calculateFuelMath(req.body, current_std_value);

        // 🚀 4. บันทึกลงฐานข้อมูล
        await db.query(`
            INSERT INTO boiler_fuel_transactions 
            (branch_id, record_date, boiler_id, std_fuel_value,
             sawdust_weight, slab_wood_weight, scrap_wood_weight, total_fuel_weight,
             sawdust_price, slab_wood_price, scrap_wood_price, total_fuel_price,
             steam_production, working_hours, steam_per_hour,
             fuel_cost_per_steam, actual_fuel_usage, fuel_usage_diff,
             remarks, created_by, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        `, [
            branch_id, record_date, boiler_id, calc.std_fuel_value,
            calc.sawdust_weight, calc.slab_wood_weight, calc.scrap_wood_weight, calc.total_fuel_weight,
            calc.sawdust_price, calc.slab_wood_price, calc.scrap_wood_price, calc.total_fuel_price,
            calc.steam_production, calc.working_hours, calc.steam_per_hour,
            calc.fuel_cost_per_steam, calc.actual_fuel_usage, calc.fuel_usage_diff,
            remarks || '', staffId
        ]);

        res.json({ status: 'success', message: 'บันทึกข้อมูลเรียบร้อยแล้ว' });

    } catch (error) {
        console.error("Add Boiler Fuel Error:", error);
        res.json({ status: 'error', message: error.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
    }
};

// 🟢 4. แก้ไขข้อมูล
exports.updateTransaction = async (req, res) => {
    try {
        const id = req.params.id;
        const staffId = req.session.user.id;
        
        // 🚀 1. ดึงค่า STD เก่าที่เคยบันทึกไว้ (เพื่อไม่ให้ประวัติเพี้ยน หากมาแก้ย้อนหลัง)
        const [oldTrans] = await db.query(`SELECT std_fuel_value FROM boiler_fuel_transactions WHERE id = ?`, [id]);
        if (oldTrans.length === 0) throw new Error('ไม่พบข้อมูลรายการนี้');
        
        const historical_std_value = oldTrans[0].std_fuel_value;

        // 🚀 2. คำนวณใหม่
        const calc = calculateFuelMath(req.body, historical_std_value);

        await db.query(`
            UPDATE boiler_fuel_transactions 
            SET sawdust_weight = ?, slab_wood_weight = ?, scrap_wood_weight = ?, total_fuel_weight = ?,
                sawdust_price = ?, slab_wood_price = ?, scrap_wood_price = ?, total_fuel_price = ?,
                steam_production = ?, working_hours = ?, steam_per_hour = ?,
                fuel_cost_per_steam = ?, actual_fuel_usage = ?, fuel_usage_diff = ?,
                remarks = ?, updated_by = ?
            WHERE id = ?
        `, [
            calc.sawdust_weight, calc.slab_wood_weight, calc.scrap_wood_weight, calc.total_fuel_weight,
            calc.sawdust_price, calc.slab_wood_price, calc.scrap_wood_price, calc.total_fuel_price,
            calc.steam_production, calc.working_hours, calc.steam_per_hour,
            calc.fuel_cost_per_steam, calc.actual_fuel_usage, calc.fuel_usage_diff,
            req.body.remarks || '', staffId, id
        ]);

        res.json({ status: 'success', message: 'อัปเดตข้อมูลสำเร็จ' });

    } catch (error) {
        console.error("Update Boiler Fuel Error:", error);
        res.json({ status: 'error', message: 'อัปเดตข้อมูลไม่สำเร็จ' });
    }
};

// 🟢 5. ลบข้อมูล (Soft Delete)
exports.deleteTransaction = async (req, res) => {
    try {
        const id = req.params.id;
        const staffId = req.session.user.id;
        
        await db.query(`UPDATE boiler_fuel_transactions SET status = 'cancelled', updated_by = ? WHERE id = ?`, [staffId, id]);
        res.json({ status: 'success', message: 'ยกเลิกรายการสำเร็จ' });
    } catch (error) {
        console.error("Delete Boiler Fuel Error:", error);
        res.json({ status: 'error', message: 'ลบข้อมูลไม่สำเร็จ' });
    }
};
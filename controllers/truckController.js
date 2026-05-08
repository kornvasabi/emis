const db = require('../config/db');
const axios = require('axios'); // ใช้แทน cURL

// 🟢 1. โหลดหน้าจอหลักและรายชื่อสาขา
exports.truckListPage = async (req, res) => {
    try {
        // ดึงเฉพาะสาขาที่มี URL API
        const [branches] = await db.query("SELECT id, branch_name FROM branches WHERE api_url IS NOT NULL AND api_url != ''");
        
        res.render('truck_list', {
            title: 'ค้นหารายการชั่ง',
            branches: branches,
            // หากมีระบบสิทธิ์ ให้ส่งไปด้วยครับ
            permission: req.permission || { can_edit: 1 } 
        });
    } catch (error) {
        console.error("Truck Page Error:", error);
        res.status(500).send("Server Error");
    }
};

// 🟢 2. ค้นหาข้อมูลผ่าน API (Read)
exports.searchTruckData = async (req, res) => {
    try {
        const { branch_id, date_start, date_end, ticket2 } = req.body;

        const [branch] = await db.query("SELECT api_url FROM branches WHERE id = ?", [branch_id]);
        if (branch.length === 0) return res.json({ status: 'error', message: 'ไม่พบ URL ของสาขานี้' });

        // แปลง URL จาก Update เป็น Read ตามแบบเดิม
        const apiUrl = branch[0].api_url.replace("api_update_truck.php", "api_read_truck.php");

        // สร้างข้อมูลส่งไปแบบ x-www-form-urlencoded
        const postData = new URLSearchParams({
            api_key: 'KOR_SECRET_KEY_1234',
            mode: 'search',
            ticket2: ticket2 || '',
            date_start: date_start.substring(0, 10), // เอาแค่ YYYY-MM-DD
            date_end: date_end.substring(0, 10)
        });

        // ยิง API (แทน cURL)
        const response = await axios.post(apiUrl, postData.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 30000
        });

        // 🧹 ทริคดักจับ JSON ขยะ (แบบเดียวกับที่ PHP ทำ)
        let responseData = response.data;
        if (typeof responseData === 'string') {
            const startPos = responseData.indexOf('{');
            if (startPos > -1) {
                responseData = JSON.parse(responseData.substring(startPos));
            }
        }

        if (responseData && responseData.status === 'success') {
            res.json({ status: 'success', data: responseData.data });
        } else {
            res.json({ status: 'warning', message: responseData.message || 'ไม่พบข้อมูล' });
        }

    } catch (error) {
        console.error("Search API Error:", error);
        res.json({ status: 'error', message: 'เชื่อมต่อ API สาขาล้มเหลว' });
    }
};

// 🟢 3. อัปเดตข้อมูลผ่าน API (Update)
exports.updateTruckData = async (req, res) => {
    try {
        const { branch_id, id, in_date_time, out_date_time, is_printed } = req.body;

        const [branch] = await db.query("SELECT api_url FROM branches WHERE id = ?", [branch_id]);
        if (branch.length === 0) return res.json({ status: 'error', message: 'ไม่พบ URL ของสาขานี้' });

        const apiUrl = branch[0].api_url; 

        const postData = new URLSearchParams({
            api_key: 'KOR_SECRET_KEY_1234',
            id: id,
            in_date_time: in_date_time,
            out_date_time: out_date_time || '',
            is_printed: is_printed || 0
        });

        const response = await axios.post(apiUrl, postData.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        let responseData = response.data;
        if (typeof responseData === 'string') {
            const startPos = responseData.indexOf('{');
            if (startPos > -1) responseData = JSON.parse(responseData.substring(startPos));
        }

        // ดักเคส Error ประหลาดตามสไตล์โค้ดเดิม
        if ((responseData && responseData.status === 'success') || responseData.message === "Unknown Error") {
            res.json({ status: 'success', message: 'อัปเดตข้อมูลเรียบร้อยแล้ว' });
        } else {
            res.json({ status: 'warning', message: responseData.message || 'เกิดข้อผิดพลาดจากปลายทาง' });
        }

    } catch (error) {
        console.error("Update API Error:", error);
        res.json({ status: 'error', message: 'การเชื่อมต่อล้มเหลว' });
    }
};
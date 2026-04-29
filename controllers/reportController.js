const db = require('../config/db'); 
const ExcelJS = require('exceljs');

// ดึงมาเตรียมไว้ทั้ง 2 แบบเลยครับ
const puppeteer = require('puppeteer');           // สำหรับรันบนเครื่องตัวเอง (Local)
const puppeteerCore = require('puppeteer-core');  // สำหรับรันบน Render
const chromium = require('@sparticuz/chromium');

const ejs = require('ejs');
const path = require('path');

// 🟢 1. ฟังก์ชันสำหรับเปิดหน้าจอ (UI) ให้เลือกวันที่
exports.showReportPage = async (req, res) => {
    // โหลดหน้า views/report_issues.ejs
    res.render('report_issues', { title: 'ออกรายงานปัญหา' });
};

// 🟢 2. ฟังก์ชันสำหรับรับค่า วันที่ และสร้างไฟล์ Excel ส่งกลับไป
exports.exportIssueExcel = async (req, res) => {
    try {
        // รับค่าวันที่จากฟอร์มที่ส่งมา (method GET)
        const startDate = req.query.startDate; 
        const endDate = req.query.endDate;

        // เช็คว่า User เลือกวันที่มาหรือเปล่า
        if (!startDate || !endDate) {
            return res.send('<script>alert("กรุณาเลือกวันที่ให้ครบถ้วน"); window.history.back();</script>');
        }

        // 🚀 Query ดึงข้อมูลโดยกรองช่วงวันที่ (ใช้ DATE() เพื่อตัดเวลาออกตอนเช็ค)
        const sql = `
            SELECT 
                i.id, 
                i.title, 
                i.description, 
                DATE_FORMAT(i.created_at, '%d/%m/%Y %H:%i') AS created_date,
                t.name AS type_name, 
                u.fullname AS user_fullname
            FROM issues i
            LEFT JOIN issue_types t ON i.type_id = t.id
            LEFT JOIN users u ON i.user_id = u.id
            WHERE DATE(i.created_at) BETWEEN ? AND ?
            ORDER BY i.created_at DESC
        `;
        
        const [rows] = await db.query(sql, [startDate, endDate]);

        // ==========================================
        // 📝 เริ่มกระบวนการสร้างไฟล์ Excel (เหมือนโค้ดเดิมเป๊ะ!)
        // ==========================================
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('รายงานปัญหา');

        // ตั้งหัวคอลัมน์
        worksheet.columns = [
            // 🟢 1. ตั้งค่าฟอนต์มาตรฐานให้ "ทุกคอลัมน์" (ข้อมูลด้านใน)
            { header: 'ID', key: 'id', width: 10 },
            { header: 'วันที่บันทึก', key: 'created_date', width: 20 },
            { header: 'ประเภท', key: 'type_name', width: 20 },
            { header: 'หัวข้อปัญหา', key: 'title', width: 40 },
            { header: 'รายละเอียด', key: 'description', width: 50 },
            { header: 'ผู้บันทึก', key: 'user_fullname', width: 25 }
        ];
        // 🟢 1. ตั้งค่าฟอนต์มาตรฐานให้ "ทุกคอลัมน์" (ข้อมูลด้านใน)
        // แต่งสีแถวแรก (Header)
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1CC88A' } }; // สีเขียว Success
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

        // ยัดข้อมูลใส่ Excel
        worksheet.addRows(rows);

        // ==========================================
        // 🎨 เริ่มจัดหน้าตา: ตีเส้นขอบ + ใส่ฟอนต์ + จัด Header
        // ==========================================
        worksheet.eachRow({ includeEmpty: false }, function(row, rowNumber) {
            
            // วนลูปทีละช่องในแถวนั้นๆ
            row.eachCell({ includeEmpty: false }, function(cell) {
                // 1. ตีเส้นขอบทุกช่อง
                cell.border = {
                    top: {style:'thin'}, left: {style:'thin'}, 
                    bottom: {style:'thin'}, right: {style:'thin'}
                };
                
                // 2. 🟢 บังคับฟอนต์ 'TH SarabunPSK' ขนาด 16 ทุกช่อง!
                cell.font = { name: 'TH SarabunPSK', size: 16 };
                
                // 3. จัดข้อความให้อยู่กึ่งกลางแนวตั้ง
                cell.alignment = { vertical: 'middle' };
            });

            // 4. 🟢 ถ้าเป็นแถวแรก (หัวตาราง) ให้เติมความพิเศษเข้าไป
            if (rowNumber === 1) {
                row.eachCell({ includeEmpty: false }, function(cell) {
                    // ต้องระบุชื่อฟอนต์อีกรอบด้วย ไม่งั้นมันจะหายตอนเราสั่ง bold
                    cell.font = { name: 'TH SarabunPSK', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
                    
                    // ใส่สีพื้นหลังสีเขียว
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1CC88A' } };
                    
                    // หัวตารางให้อยู่กึ่งกลางทั้งแนวตั้งและแนวนอน
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                });
                
                // ปรับความสูงของหัวตารางนิดนึง
                row.height = 25; 
            }
        });

        // 🚀 ส่งไฟล์ให้เบราว์เซอร์ดาวน์โหลด
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=' + encodeURIComponent(`รายงานปัญหา_${startDate}_ถึง_${endDate}.xlsx`));
        
        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error("Export Excel Error:", error);
        res.status(500).send("เกิดข้อผิดพลาดในการออกรายงาน");
    }
};

exports.exportIssuePdf = async (req, res) => {
    try {
        const startDate = req.query.startDate; 
        const endDate = req.query.endDate;

        if (!startDate || !endDate) {
            return res.send('<script>alert("กรุณาเลือกวันที่ให้ครบถ้วน"); window.history.back();</script>');
        }

        // 1. 🚀 Query ข้อมูล (ใช้คำสั่ง SQL เดียวกับ Excel เป๊ะเลยครับ)
        const sql = `
            SELECT i.id, i.title, i.description, 
                   DATE_FORMAT(i.created_at, '%d/%m/%Y %H:%i') AS created_date,
                   t.name AS type_name, u.fullname AS user_fullname
            FROM issues i
            LEFT JOIN issue_types t ON i.type_id = t.id
            LEFT JOIN users u ON i.user_id = u.id
            WHERE DATE(i.created_at) BETWEEN ? AND ?
            ORDER BY i.created_at DESC
        `;
        const [rows] = await db.query(sql, [startDate, endDate]);

        // 2. 📝 นำข้อมูลไปใส่ในหน้าเว็บแม่แบบ (EJS) ให้กลายเป็น String HTML
        const ejsPath = path.join(__dirname, '../views/template_pdf_issue.ejs');
        const htmlContent = await ejs.renderFile(ejsPath, { 
            data: rows, 
            startDate: startDate, 
            endDate: endDate 
        });

        // 3. 🤖 ปลุกเสกเบราว์เซอร์จำลอง (Puppeteer) ให้มาพิมพ์ PDF
        /*const browser = await puppeteer.launch({ 
			headless: 'new',
			args: [
				'--no-sandbox', 
				'--disable-setuid-sandbox',
				'--disable-dev-shm-usage', // แก้ปัญหา RAM จำลองเต็มบน Cloud
				'--disable-gpu'
			]
		});
		*/
		
		// 🤖 ปลุกเสกเบราว์เซอร์จำลอง (เช็คว่าเป็น Local หรือ Server)
        let browser;

        // ถ้ามีคำว่า production แปลว่ารันอยู่บน Render
        if (process.env.NODE_ENV === 'production') {
            // ☁️ โหมด Render.com (ใช้ Sparticuz ไซส์มินิ)
            browser = await puppeteerCore.launch({
                args: chromium.args,
                defaultViewport: chromium.defaultViewport,
                executablePath: await chromium.executablePath(),
                headless: chromium.headless,
                ignoreHTTPSErrors: true,
            });
        } else {
            // 💻 โหมดเครื่องตัวเอง (ใช้ Puppeteer ตัวเต็ม)
            browser = await puppeteer.launch({ 
                headless: 'new' 
            });
        }

        const page = await browser.newPage();
        
        // ยัด HTML ใส่เข้าไป และรอให้ฟอนต์ Google โหลดเสร็จ
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

        // สั่งพิมพ์เป็น PDF ขนาด A4
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true, // ปริ้นท์สีพื้นหลัง (เช่น สีแดงบนหัวตาราง)
            margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
        });

        await browser.close(); // ปิดเบราว์เซอร์

        // 4. 🚀 ส่งไฟล์ PDF ให้เบราว์เซอร์
        res.setHeader('Content-Type', 'application/pdf');
        // บรรทัดล่างนี้: ถ้าใช้ inline มันจะเปิดดูในแท็บใหม่ ถ้าใช้ attachment มันจะดาวน์โหลดลงเครื่องครับ
        // res.setHeader('Content-Disposition', `inline; filename=รายงานปัญหา_${startDate}_ถึง_${endDate}.pdf`);
        
        // 🟢 เปลี่ยนเป็นบรรทัดนี้แทน (ใช้ชื่อภาษาอังกฤษหลอก HTTP Header ไปก่อน):
        res.setHeader('Content-Disposition', 'inline; filename="report.pdf"');
        
        res.send(pdfBuffer);

    } catch (error) {
        console.error("Export PDF Error:", error);
        // 🚀 เปลี่ยนตรงนี้ชั่วคราว ให้มันพ่น error.message ออกมาดูเลยครับ
        res.status(500).send(`เกิดข้อผิดพลาดในการสร้างไฟล์ PDF: <br> <b>${error.message}</b>`);
    }
};
// 1. 🟢 โหลด dotenv เป็นบรรทัดแรกสุดของไฟล์เลยครับ (สำคัญมาก!)
require('dotenv').config();

// 🟢 2. ดึงค่าจาก .env มาเก็บในตัวแปร baseUrl เพื่อใช้ในไฟล์นี้
const baseUrl = process.env.BASE_URL || '';

// โหลดเครื่องมือที่ติดตั้งไว้
const express = require('express');
const session = require('express-session');
const favicon = require('serve-favicon');
const path = require('path');
const app = express();

const { requireAuth } = require('./middleware/authMiddleware');
const { loadMenus, checkPermission } = require('./middleware/menuMiddleware');
const userController = require('./controllers/userController');
const reportController = require('./controllers/reportController');
const multer = require('multer');
// const importController = require('./controllers/importController');
const branchController = require('./controllers/branchController'); 
const machineTransController = require('./controllers/machineTransController'); // การทำงานของเครื่องจักร/เบรกดาวน์
const fuelController = require('./controllers/fuelController'); // ดึง Controller มาไว้ด้านบน

// 🟢 3. โยน baseUrl เข้า app.locals เพื่อให้ทุกหน้า EJS เอาไปใช้ได้
app.locals.baseUrl = baseUrl;

// 🚀 นำโค้ดนี้ไปวางไว้บนๆ (ก่อนถึงพวก app.use(express.static...))
app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));

// 1. ตั้งค่าหน้าตาเว็บ (View Engine)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 🚀 สั่งให้ Express.js ไว้ใจ Proxy (Nginx) และยอมรับ IP ที่ถูกส่งต่อมา
app.set('trust proxy', true);

// 2. บอกให้ Node รู้ว่าไฟล์นิ่งๆ (Static) อยู่ในโฟลเดอร์ public
app.use(express.static(path.join(__dirname, 'public')));

// 🟢 4. แก้ Static File Path ให้ใช้ baseUrl แบบไดนามิก
app.use(baseUrl, express.static(path.join(__dirname, 'public')));
app.use(`${baseUrl}/public`, express.static(path.join(__dirname, 'public')));

// 3. ตั้งค่าให้รับข้อมูลจากฟอร์ม Login ได้ (POST body)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 4. ตั้งค่าระบบ Session สำหรับจดจำการล็อกอิน
app.use(session({
    secret: 'my_secret_key_1234_emis',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 1000 * 60 * 30  // ตัวอย่างนี้คือตั้งไว้ 30 นาทีครับ
    }
}));

// ใส่ไว้ใต้โค้ดตั้งค่า session (...)
app.use((req, res, next) => {
    // 🚀 โยนข้อมูล user ใน session เข้า res.locals
    res.locals.user = req.session.user || null; 
    next();
});

app.use((req, res, next) => {
    // 🟢 5. ตัด baseUrl ออกจาก URL เสมอ เพื่อให้ Sidebar เช็ค Active ได้เป๊ะ!
    let normalizedPath = req.path.replace(baseUrl, '');
    if (normalizedPath === '') normalizedPath = '/';
    
    // แอบแนบ URL ปัจจุบัน (เช่น '/user_list') ไปให้ Sidebar เช็ค Active
    res.locals.currentPath = normalizedPath; 
    
    next(); 
});

app.use((req, res, next) => {
    res.locals.session = req.session; 
    next();
});

const i18n = require('i18n');

// 🟢 1. ตั้งค่า i18n
i18n.configure({
    locales: ['th', 'en'], 
    directory: path.join(__dirname, 'locales'), 
    defaultLocale: 'th', 
    objectNotation: true, 
    autoReload: true 
});

// 🟢 2. ให้ Express รู้จัก i18n
app.use(i18n.init);

// 🟢 3. ดักจับ Session เพื่อให้ระบบจำได้ว่า User คนนี้เลือกภาษาอะไรไว้
app.use((req, res, next) => {
    const currentLang = (req.session && req.session.lang) ? req.session.lang : 'th';
    res.setLocale(currentLang); 
    res.locals.currentLang = currentLang; 
    next();
});

const appRouter = express.Router();

// ==========================================
// 🟢 API สำหรับกดสลับภาษา
// ==========================================
appRouter.get('/change-lang/:lang', (req, res) => {
    const lang = req.params.lang;
    if (['th', 'en'].includes(lang)) {
        req.session.lang = lang; 
        req.session.save((err) => {
            if (err) console.error("Session Save Error:", err);
            res.json({ status: 'success' });
        });
    } else {
        res.redirect('back');
    }
});
// ==========================================

const authRoutes = require('./routes/authRoutes');
appRouter.use('/auth', authRoutes);

// 5. ตัวอย่าง Route หน้า Login
appRouter.get('/', (req, res) => {
    if (req.session && req.session.user) {
        // 🟢 6. ใช้ baseUrl ในการ Redirect
        return res.redirect(`${baseUrl}/dashboard`);
    }
    res.render('login', { error: null }); 
});

// หน้า Dashboard
appRouter.get('/dashboard', requireAuth, loadMenus, (req, res) => {
    res.render('dashboard' , { title: 'หน้าหลัก - Myproject_ww' });
});

// 🟢 หน้าตั้งค่ากลุ่มผู้ใช้
appRouter.get('/user_list', requireAuth, loadMenus, checkPermission, userController.showUserList);
appRouter.post('/api/add_user', requireAuth, userController.addUser);
appRouter.get('/api/get_user/:id', requireAuth, userController.getUser);
appRouter.post('/api/update_user', requireAuth, userController.updateUser);
appRouter.post('/api/delete_user', requireAuth, userController.deleteUser);

// ระบบจัดการสาขา
appRouter.get('/branches', requireAuth, loadMenus, checkPermission, branchController.branchPage);
appRouter.get('/api/branches', requireAuth, branchController.getBranches);
appRouter.post('/api/branches/add', requireAuth, branchController.addBranch);
appRouter.post('/api/branches/update/:id', requireAuth, branchController.updateBranch);
appRouter.post('/api/branches/delete/:id', requireAuth, branchController.deleteBranch);

// ระบบ Report & Export
appRouter.get('/report_issues', requireAuth, loadMenus, checkPermission, reportController.showReportPage);
appRouter.get('/export/issues/excel', requireAuth, reportController.exportIssueExcel);
appRouter.get('/export/issues/pdf', requireAuth, reportController.exportIssuePdf);

// ==========================================
// 🟢 ระบบบันทึกเวลาทำงานเครื่องจักร (Machine Transactions)
// ==========================================
appRouter.get('/machine_trans', requireAuth, loadMenus, checkPermission, machineTransController.machineTransPage);
appRouter.get('/api/machine_trans', requireAuth, checkPermission, machineTransController.getTransactions);
appRouter.post('/api/machine_trans/add', requireAuth, checkPermission, machineTransController.addTransactionBatch);
appRouter.post('/api/machine_trans/update/:id', requireAuth, checkPermission, machineTransController.updateTransaction);
appRouter.post('/api/machine_trans/delete/:id', requireAuth, checkPermission, machineTransController.deleteTransaction);

// ==========================================
// 🟢 ระบบบันทึกการใช้เชื้อเพลิง (Fuel)
// ==========================================
appRouter.get('/fuel_trans', requireAuth, loadMenus, checkPermission, fuelController.fuelTransPage);
appRouter.get('/api/fuel_trans', requireAuth, checkPermission, fuelController.getTransactions);
appRouter.post('/api/fuel_trans/add', requireAuth, checkPermission, fuelController.addTransactionBatch);
appRouter.post('/api/fuel_trans/update/:id', requireAuth, checkPermission, fuelController.updateTransaction);
appRouter.post('/api/fuel_trans/delete/:id', requireAuth, checkPermission, fuelController.deleteTransaction);

// ระบบ Import Excel
const upload = multer({ storage: multer.memoryStorage() });
appRouter.get('/price_import', requireAuth, loadMenus, checkPermission, (req, res) => {
    res.render('price_import', { title: 'นำเข้าข้อมูลราคา' });
});
// appRouter.post('/api/import/excel', requireAuth, upload.single('price_file'), importController.importPriceExcel);

app.use('/', appRouter);               // ประตูที่ 1: สำหรับ Nginx (9090) ที่โดนตัด URL ไปแล้ว
// 🟢 7. ผูก Router เข้ากับ baseUrl แบบไดนามิก
app.use(baseUrl || '/', appRouter);    // ประตูที่ 2: สำหรับเข้าพอร์ตตรงๆ

// =========================================================================
// 🟢 Middleware ดักจับ 404 Not Found
// =========================================================================
app.use((req, res, next) => {
    res.status(404).send(`
        <!DOCTYPE html>
        <html lang="th">
        <head>
            <meta charset="utf-8">
            <title>Under Development</title>
            <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
            <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
            <style>
                body { background-color: #f8f9fc; font-family: 'Kanit', sans-serif; }
            </style>
        </head>
        <body>
            <script>
                Swal.fire({
                    title: 'กำลังพัฒนา 🚧',
                    text: 'ฟังก์ชันนี้กำลังอยู่ระหว่างการพัฒนาครับ',
                    icon: 'info',
                    confirmButtonText: 'กลับสู่หน้าหลัก',
                    confirmButtonColor: '#f6c23e',
                    allowOutsideClick: false
                }).then((result) => {
                    if (result.isConfirmed) {
                        // 🟢 8. ใช้ baseUrl ใน Javascript ของ 404 Page (ใช้ \${} เพื่อแทรกตัวแปรใน String)
                        window.location.href = '${baseUrl}/dashboard';
                    }
                });
            </script>
        </body>
        </html>
    `);
});

// 6. รันที่พอร์ต 7000 (หรือตามที่คุณกรกำหนด)
const PORT = process.env.PORT || 3000; // สามารถดึงจาก .env ได้ด้วยนะครับ
app.listen(PORT, () => {
    console.log(`-------------------------------------------`);
    console.log(`🚀 Myproject_nodejs start at PORT: ${PORT}`);
    console.log(`🌐 Base URL is set to: "${baseUrl}"`);
    console.log(`-------------------------------------------`);
});

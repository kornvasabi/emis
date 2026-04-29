// ไฟล์: routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// รับค่า POST จากฟอร์ม
router.post('/login', authController.login);

// 🟢 เพิ่มเส้นทาง GET สำหรับออกจากระบบ
router.get('/logout', authController.logout);

module.exports = router;
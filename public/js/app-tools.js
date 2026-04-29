// ไฟล์: public/myproject_nodejs/js/app-tools.js

const AppTools = {
    // 1. ฟังก์ชันเรียกใช้งาน Modal แจ้งเตือน (รองรับประเภท info, success, danger, warning)
    /*showModal: function(title, message, type = 'info') {
        // เปลี่ยนสี Header ตามประเภทของ Error/Alert
        let headerClass = 'bg-primary text-white';
        if (type === 'danger' || type === 'error') headerClass = 'bg-danger text-white';
        if (type === 'success') headerClass = 'bg-success text-white';
        if (type === 'warning') headerClass = 'bg-warning text-dark';

        // ยัดข้อมูลลงไปใน Modal
        $('#appGlobalModalHeader').removeClass().addClass(`modal-header ${headerClass}`);
        $('#appGlobalModalTitle').text(title);
        $('#appGlobalModalBody').html(message);
        
        // สั่งเปิด Modal
        $('#appGlobalModal').modal('show');
    },*/
	
	// 🟢 อัปเกรด showModal: เพิ่มเงื่อนไข Auto-close สำหรับ success
    showModal: function(title, message, type = 'info') {
        
        let swalIcon = 'info';
        if (type === 'success') swalIcon = 'success';
        if (type === 'warning') swalIcon = 'warning';
        if (type === 'danger' || type === 'error') swalIcon = 'error';

        // 🟢 1. สร้างก้อนตั้งค่าพื้นฐานไว้ก่อน
        let swalConfig = {
            title: title,
            html: message,
            icon: swalIcon,
            confirmButtonText: 'ตกลง',
            confirmButtonColor: '#4e73df',
            allowOutsideClick: false 
        };

        // 🟢 2. ดักเงื่อนไข: ถ้าเป็น success ให้แทรกคำสั่งปิดอัตโนมัติเข้าไป
        if (type === 'success') {
            swalConfig.showConfirmButton = false; // ซ่อนปุ่ม "ตกลง"
            swalConfig.timer = 1500;              // หน่วงเวลา 1.5 วินาที (1500 ms) แล้วปิดเอง
            swalConfig.timerProgressBar = true;   // โชว์หลอดเวลาวิ่งถอยหลังเท่ๆ
            swalConfig.allowOutsideClick = true;  // อนุญาตให้คลิกพื้นหลังเพื่อปิดก่อนเวลาได้
        }

        // 🟢 3. สั่งให้ SweetAlert2 ทำงานตามตั้งค่า
        Swal.fire(swalConfig);
    },

    // 2. ฟังก์ชันแปลงตารางธรรมดา ให้เป็น DataTables แบบภาษาไทย
    initDataTable: function(tableSelector) {
        // ตรวจสอบว่ามีตารางนี้อยู่จริงไหมก่อนเรียกใช้
        if ($(tableSelector).length > 0) {
            return $(tableSelector).DataTable({
				// 🟢 เพิ่มบรรทัดนี้เข้าไปครับ: สั่งให้ทำลายของเก่าทิ้งก่อนสร้างใหม่!
                "destroy": true,
				
                "language": {
                    "emptyTable": "ไม่มีข้อมูลในตาราง",
                    "info": "แสดง _START_ ถึง _END_ จาก _TOTAL_ รายการ",
                    "infoEmpty": "แสดง 0 ถึง 0 จาก 0 รายการ",
                    "infoFiltered": "(กรองข้อมูล _MAX_ ทุกรายการ)",
                    "lengthMenu": "แสดง _MENU_ รายการ",
                    "loadingRecords": "กำลังโหลดข้อมูล...",
                    "processing": "กำลังดำเนินการ...",
                    "search": "ค้นหา:",
                    "zeroRecords": "ไม่พบข้อมูล",
                    "paginate": {
                        "first": "หน้าแรก",
                        "last": "หน้าสุดท้าย",
                        "next": "ถัดไป",
                        "previous": "ก่อนหน้า"
                    }
                },
                "pageLength": 10,
                "responsive": true,
                "initComplete": function(settings, json) {
                    // พอวาดตารางเสร็จ ก็โชว์ขึ้นมาแบบหล่อๆ
                    $(tableSelector).css('visibility', 'visible').hide().fadeIn(300);
                }
            });
        } else {
            console.warn(`AppTools: ไม่พบตารางชื่อ ${tableSelector} ในหน้านี้`);
        }
    },

    // 3. ฟังก์ชันตรวจสอบการกรอกข้อมูล (Form Validation แบบ Manual)
    checkEmpty: function(inputId, fieldName) {
        const val = $(inputId).val().trim();
        if (!val) {
            this.showModal('ข้อมูลไม่ครบถ้วน!', `กรุณากรอก <b>${fieldName}</b> ด้วยครับ`, 'warning');
            $(inputId).focus();
            return false;
        }
        return true;
    }
};
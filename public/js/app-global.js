// ประกาศตัวแปร Object กลางเพื่อให้เรียกใช้งานง่ายๆ
const App = {
    
    // 1. ฟังก์ชันเปิด Modal สารพัดประโยชน์
    showModal: function(title, message, type = 'info') {
        $('#globalModalTitle').text(title);
        $('#globalModalBody').html(message);
        
        // ถ้าอยากเปลี่ยนสีหัว Modal ตามประเภท (info, warning, danger) ก็เขียนเพิ่มตรงนี้ได้
        
        $('#globalModal').modal('show');
    },
	initDataTable: function(tableSelector) {
        if ($(tableSelector).length > 0) {
            
            // 🟢 สร้าง DataTables ก่อน แล้วค่อยสั่งโชว์เมื่อทุกอย่างประกอบร่างเสร็จ 100%
            return $(tableSelector).DataTable({
                "language": {
                    "url": "/myproject_nodejs/json/Thai.json"
                },
                "pageLength": 10,
                "responsive": true,
                "initComplete": function(settings, json) {
                    // เมื่อ DataTables สร้างช่องค้นหาและแบ่งหน้าเสร็จแล้ว ให้ค่อยๆ โชว์ตารางขึ้นมาแบบเนียนๆ
                    $(tableSelector).css('visibility', 'visible').hide().fadeIn(300);
                }
            });

        } else {
            console.warn(`AppTools: ไม่พบตารางชื่อ ${tableSelector} ในหน้านี้`);
        }
    },
    // 2. ฟังก์ชันแปลงตารางเป็น DataTable พร้อมตั้งค่าภาษาไทย
    initDataTable: function(tableId) {
        $(tableId).DataTable({
            "language": {
                // "url": "//cdn.datatables.net/plug-ins/1.10.24/i18n/Thai.json"
				"url": "/myproject_nodejs/json/Thai.json"
            },
            "pageLength": 10
        });
    }
};
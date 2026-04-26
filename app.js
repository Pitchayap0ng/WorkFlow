// 1. Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyA11zPbXEFs-sdIHKaxhkprkoGSGP1whfg",
    authDomain: "ims-fei.firebaseapp.com",
    databaseURL: "https://ims-fei-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "ims-fei",
    storageBucket: "ims-fei.firebasestorage.app",
    appId: "1:791711191329:web:0a4ba03cd5f11eb71bae60"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
emailjs.init("WSvF2N1nopC2xfuZo");

// API Key สำหรับอัปโหลดรูปภาพ (ฟรี ไม่ต้องอัปเกรด Firebase)
const IMGBB_API_KEY = "8a72c60399b9c276904659cf219a03c9"; 

let currentUser = null, userData = {}, logs = [], viewDate = new Date();
const DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const MONTHS_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

// --- Authentication ---
function toggleAuth(isReg) {
    document.getElementById('login-box').classList.toggle('hidden', isReg);
    document.getElementById('reg-box').classList.toggle('hidden', !isReg);
}

async function doLogin() {
    const id = document.getElementById('l-id').value.trim();
    const pw = document.getElementById('l-pw').value;
    if(!id || !pw) return toast("กรุณากรอกข้อมูล", "warning");
    try {
        let email = id;
        if (!id.includes('@')) {
            const snap = await db.ref('usernames/' + id.toLowerCase()).once('value');
            if (!snap.exists()) return toast("ไม่พบ Username", "error");
            email = snap.val().email;
        }
        await auth.signInWithEmailAndPassword(email, pw);
    } catch (e) { toast("ข้อมูลไม่ถูกต้อง", "error"); }
}

async function sendOTP() {
    const user = document.getElementById('r-user').value.trim().toLowerCase();
    const mail = document.getElementById('r-mail').value.trim();
    const pw = document.getElementById('r-pw').value;
    const name = document.getElementById('r-name').value;
    
    if (pw.length < 6) return toast("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร", "error");
    if (!user || !mail) return toast("กรุณากรอกข้อมูลให้ครบ", "error");

    const snap = await db.ref('usernames/' + user).once('value');
    if (snap.exists()) return toast("Username นี้มีคนใช้แล้ว", "error");

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expireTime = new Date(Date.now() + 15 * 60000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

    emailjs.send("IMS-work", "template_34sz4uc", {
        to_email: mail,   
        passcode: otp,   
        time: expireTime 
    }).then(() => {
        Swal.fire({
            title: 'ยืนยัน OTP',
            text: 'รหัสส่งไปที่ ' + mail,
            input: 'text',
            background: '#1c1c1e', color: '#fff',
            preConfirm: (v) => v === otp ? v : Swal.showValidationMessage('รหัสไม่ถูกต้อง')
        }).then(r => { if (r.isConfirmed) finalizeReg({user, mail, pw, name}); });
    }).catch(e => toast("ส่งเมลไม่สำเร็จ", "error"));
}

async function finalizeReg(info) {
    try {
        const res = await auth.createUserWithEmailAndPassword(info.mail, info.pw);
        const uid = res.user.uid;
        await db.ref('users/' + uid).set({
            username: info.user, displayName: info.name, email: info.mail, salary: 15000
        });
        await db.ref('usernames/' + info.user).set({ email: info.mail, uid: uid });
        toast("สมัครสมาชิกสำเร็จ!");
    } catch (e) {
        toast("สมัครไม่สำเร็จ: " + e.message, "error");
    }
}

// --- App Core ---
auth.onAuthStateChanged(u => {
    currentUser = u;
    document.getElementById('auth-ui').classList.toggle('hidden', !!u);
    document.getElementById('app-ui').classList.toggle('hidden', !u);
    if (u) init();
});

function init() {
    db.ref('users/' + currentUser.uid).on('value', s => {
        userData = s.val() || {};
        document.getElementById('u-display').innerText = userData.displayName || 'User';
        const photoEl = document.getElementById('u-photo');
        if(photoEl) photoEl.src = userData.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
        renderWeekly();
        calculateSalary();
    });
    db.ref('attendance/' + currentUser.uid).on('value', s => {
        const d = s.val();
        logs = d ? Object.keys(d).map(k => ({ id: k, ...d[k] })) : [];
        renderCal();
        calculateSalary();
    });
}

// --- ฟังก์ชันอัปโหลดรูปภาพผ่าน ImgBB ---
async function handleFileUpload(input) {
    const file = input.files[0];
    if (!file) return;

    Swal.fire({ title: 'กำลังอัปโหลดรูปภาพ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const formData = new FormData();
    formData.append("image", file);

    try {
        const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
            method: "POST",
            body: formData
        });
        const result = await response.json();
        
        if (result.success) {
            const url = result.data.url;
            await db.ref('users/' + currentUser.uid).update({ photoURL: url });
            Swal.close();
            toast("เปลี่ยนรูปโปรไฟล์สำเร็จ");
            editProfile(); // เปิดหน้าต่างแก้ไขกลับขึ้นมาเพื่อดูผลลัพธ์
        }
    } catch (e) {
        Swal.fire('Error', 'อัปโหลดรูปภาพล้มเหลว', 'error');
    }
}

async function editProfile() {
    const { value: formValues } = await Swal.fire({
        title: 'ตั้งค่าบัญชี',
        background: '#1c1c1e', color: '#fff',
        html: `
            <div class="flex flex-col items-center mb-6">
                <div class="relative group" onclick="document.getElementById('file-input').click()">
                    <img src="${userData.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="w-24 h-24 rounded-full object-cover border-2 border-blue-500 shadow-lg">
                    <div class="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer">
                        <i class="fa-solid fa-camera text-white"></i>
                    </div>
                </div>
                <p class="text-[10px] mt-2 text-blue-500 font-bold">ถ่ายรูปหรือเลือกรูปจากคลัง</p>
            </div>
            <div class="text-left space-y-4">
                <div>
                    <label class="text-[10px] opacity-50 uppercase ml-2">ชื่อที่แสดง</label>
                    <input id="swal-name" class="w-full bg-white/5 p-4 rounded-2xl outline-none mt-1" value="${userData.displayName || ''}">
                </div>
                <div>
                    <label class="text-[10px] opacity-50 uppercase ml-2">เงินเดือนฐาน (บาท)</label>
                    <input id="swal-salary" type="number" class="w-full bg-white/5 p-4 rounded-2xl outline-none mt-1" value="${userData.salary || 15000}">
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'บันทึกข้อมูล',
        preConfirm: () => ({
            displayName: document.getElementById('swal-name').value,
            salary: parseFloat(document.getElementById('swal-salary').value)
        })
    });

    if (formValues) {
        await db.ref('users/' + currentUser.uid).update(formValues);
        toast("อัปเดตข้อมูลสำเร็จ");
    }
}

function confirmLogout() {
    Swal.fire({
        title: 'ออกจากระบบ?',
        text: "คุณแน่ใจหรือไม่ว่าต้องการออกจากระบบ?",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'ใช่, ออกจากระบบ',
        cancelButtonText: 'ยกเลิก',
        background: '#1c1c1e', color: '#fff'
    }).then((result) => { if (result.isConfirmed) auth.signOut(); });
}

// --- ระบบบันทึกงานและคำนวณเงิน ---
function calculateSalary() {
    const dailyRate = (userData.salary || 15000) / 30;
    const currentMonth = new Date().getMonth();
    const count = logs.filter(l => new Date(l.date).getMonth() === currentMonth && !l.isOff && l.checkIn).length;
    document.getElementById('salary-view').innerText = (count * dailyRate).toLocaleString(undefined, {minimumFractionDigits: 2});
}

function renderWeekly() {
    const list = document.getElementById('week-list');
    if(!list) return;
    list.innerHTML = DAYS.map(d => {
        const s = (userData.shifts && userData.shifts[d]) ? userData.shifts[d] : { in: '08:30', out: '17:30', isOff: false };
        return `<div class="glass-card p-4 flex justify-between items-center ${s.isOff ? 'opacity-30' : ''}">
            <div class="flex flex-col"><span class="font-bold text-sm">${d}</span>
            <button onclick="setOff('${d}', ${!s.isOff})" class="text-[10px] text-left ${s.isOff ? 'text-red-500' : 'text-blue-500'}">${s.isOff ? 'วันหยุด' : 'วันทำงาน'}</button></div>
            <div class="flex gap-2"><input type="time" class="time-pill" value="${s.in}" onchange="setShift('${d}','in',this.value)" ${s.isOff ? 'disabled' : ''}>
            <input type="time" class="time-pill" value="${s.out}" onchange="setShift('${d}','out',this.value)" ${s.isOff ? 'disabled' : ''}></div></div>`;
    }).join('');
}

function renderCal() {
    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    document.getElementById('mon-view').innerText = `${MONTHS_TH[m]} ${y + 543}`;
    const total = new Date(y, m + 1, 0).getDate(), start = new Date(y, m, 1).getDay();
    const grid = document.getElementById('cal-grid');
    if(!grid) return; grid.innerHTML = '';
    for (let i = 0; i < start; i++) grid.innerHTML += '<div></div>';
    for (let d = 1; d <= total; d++) {
        const date = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const log = logs.find(l => l.date === date);
        const cls = log ? (log.isOff ? 'st-off' : 'st-normal') : 'bg-white/5';
        grid.innerHTML += `<div onclick="editDay('${date}')" class="day-node ${cls}">${d}</div>`;
    }
}

function setShift(d, k, v) { db.ref(`users/${currentUser.uid}/shifts/${d}/${k}`).set(v); }
function setOff(d, v) { db.ref(`users/${currentUser.uid}/shifts/${d}/isOff`).set(v); }

function tapIn() {
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    if(logs.find(l => l.date === d)) return toast("เช็คอินไปแล้ว", "info");
    db.ref(`attendance/${currentUser.uid}`).push({ date: d, checkIn: t, checkOut: '', isOff: false });
    toast("เช็คอินสำเร็จ");
}

function tapOut() {
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    const log = logs.find(l => l.date === d);
    if(!log || log.checkOut) return toast("ไม่อยู่ในเงื่อนไขการเช็คเอาท์", "error");
    db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ checkOut: t });
    toast("เช็คเอาท์สำเร็จ");
}

async function editDay(date) {
    const log = logs.find(l => l.date === date) || { checkIn: '', checkOut: '', isOff: false };
    const { value: res } = await Swal.fire({
        title: date, background: '#1c1c1e', color: '#fff',
        html: `<div class="text-left space-y-4"><label class="flex justify-between items-center bg-white/5 p-3 rounded-xl"><span>วันหยุด</span><input type="checkbox" id="e-off" ${log.isOff ? 'checked' : ''}></label>
        <div class="grid grid-cols-2 gap-2"><input type="time" id="e-in" class="time-pill w-full" value="${log.checkIn}"><input type="time" id="e-out" class="time-pill w-full" value="${log.checkOut}"></div>`,
        showCancelButton: true, preConfirm: () => ({ isOff: document.getElementById('e-off').checked, checkIn: document.getElementById('e-in').value, checkOut: document.getElementById('e-out').value })
    });
    if(res) {
        if(log.id) db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ ...res, date });
        else db.ref(`attendance/${currentUser.uid}`).push({ ...res, date });
    }
}

function go(id, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}
function moveMonth(v) { viewDate.setMonth(viewDate.getMonth() + v); renderCal(); }
function toast(m, i="success") { Swal.fire({ title: m, icon: i, timer: 1500, showConfirmButton: false, background: '#1c1c1e', color: '#fff' }); }

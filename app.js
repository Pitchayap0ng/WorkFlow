// --- CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyA11zPbXEFs-sdIHKaxhkprkoGSGP1whfg",
    authDomain: "ims-fei.firebaseapp.com",
    databaseURL: "https://ims-fei-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "ims-fei",
    storageBucket: "ims-fei.firebasestorage.app",
    appId: "1:791711191329:web:0a4ba03cd5f11eb71bae60"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(), db = firebase.database();
const IMGBB_API_KEY = "8a72c60399b9c276904659cf219a03c9"; 
const DELIVERY_RATE = 15;

emailjs.init("WSvF2N1nopC2xfuZo");

let currentUser = null, userData = {}, logs = [], viewDate = new Date(), regType = 'staff';
const DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const MONTHS_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

// --- 1. AUTH LOGIC ---

function toggleAuth(isReg) {
    document.getElementById('login-box').classList.toggle('hidden', isReg);
    document.getElementById('reg-box').classList.toggle('hidden', !isReg);
}

function setRegType(type) {
    regType = type;
    document.getElementById('btn-t-staff').className = type === 'staff' ? 'flex-1 py-3 rounded-xl text-xs font-bold bg-green-600' : 'flex-1 py-3 rounded-xl text-xs font-bold text-zinc-500';
    document.getElementById('btn-t-rider').className = type === 'rider' ? 'flex-1 py-3 rounded-xl text-xs font-bold bg-green-600' : 'flex-1 py-3 rounded-xl text-xs font-bold text-zinc-500';
}

async function doLogin() {
    const id = document.getElementById('l-id').value.trim(), pw = document.getElementById('l-pw').value;
    if(!id || !pw) return toast("กรุณากรอกข้อมูล", "warning");
    try {
        let email = id;
        if (!id.includes('@')) {
            const snap = await db.ref('usernames/' + id.toLowerCase()).once('value');
            if (!snap.exists()) return toast("ไม่พบ Username", "error");
            email = snap.val().email;
        }
        await auth.signInWithEmailAndPassword(email, pw);
    } catch (e) { toast("อีเมลหรือรหัสผ่านผิด", "error"); }
}

async function sendOTP() {
    const user = document.getElementById('r-user').value.trim().toLowerCase();
    const mail = document.getElementById('r-mail').value.trim();
    const pw = document.getElementById('r-pw').value;
    const name = document.getElementById('r-name').value;

    if (!user || !mail || !pw || !name) return toast("กรุณากรอกข้อมูลให้ครบ", "warning");
    if (pw.length < 6) return toast("รหัสผ่านต้องมี 6 ตัวขึ้นไป", "warning");

    const snap = await db.ref('usernames/' + user).once('value');
    if (snap.exists()) return toast("Username นี้ถูกใช้ไปแล้ว", "error");

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    Swal.fire({ title: 'กำลังส่งรหัส OTP...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    // ปรับปรุง Error Handling สำหรับการส่งเมล
    emailjs.send("IMS-work", "template_34sz4uc", { to_email: mail, passcode: otp })
        .then(() => {
            Swal.fire({
                title: 'ยืนยัน OTP', text: 'ส่งรหัสไปที่ ' + mail + ' แล้ว',
                input: 'text', background: '#1c1c1e', color: '#fff',
                confirmButtonText: 'ยืนยัน',
                preConfirm: (v) => v === otp ? v : Swal.showValidationMessage('รหัส OTP ไม่ถูกต้อง')
            }).then(r => { 
                if (r.isConfirmed) finalizeReg({user, mail, pw, name}); 
            });
        })
        .catch(err => {
            console.error("EmailJS Error:", err);
            Swal.fire({
                icon: 'error', title: 'ส่งเมลไม่สำเร็จ',
                text: 'ไม่สามารถส่งอีเมลไปที่ ' + mail + ' ได้ กรุณาตรวจสอบว่าอีเมลถูกต้องหรือไม่',
                background: '#1c1c1e', color: '#fff'
            });
        });
}

async function finalizeReg(info) {
    try {
        const res = await auth.createUserWithEmailAndPassword(info.mail, info.pw);
        await db.ref('users/' + res.user.uid).set({ 
            username: info.user, displayName: info.name, email: info.mail, 
            salary: 15000, role: 'staff', jobType: regType, otRate: 1.5 
        });
        await db.ref('usernames/' + info.user).set({ email: info.mail, uid: res.user.uid });
        toast("ลงทะเบียนสำเร็จ!");
    } catch (e) { toast(e.message, "error"); }
}

// --- 2. MAIN APP FLOW ---

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
        document.getElementById('u-photo').src = userData.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
        
        document.getElementById('delivery-section').classList.toggle('hidden', userData.jobType !== 'rider');
        
        if (userData.role === 'admin') {
            document.getElementById('nav-admin').classList.remove('hidden');
            loadAllUsers();
        } else {
            document.getElementById('nav-admin').classList.add('hidden');
        }
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

// --- 3. ADMIN FUNCTIONS ---

function loadAllUsers() {
    db.ref('users').on('value', s => {
        const data = s.val();
        const list = document.getElementById('user-list');
        if (!list) return;

        if (!data) {
            list.innerHTML = '<p class="text-center opacity-30 py-10">ไม่พบรายชื่อพนักงาน</p>';
            return;
        }

        const users = Object.keys(data).map(k => ({ uid: k, ...data[k] }));
        list.innerHTML = users.map(u => `
            <div onclick="adminEditUser('${u.uid}')" class="glass-card p-4 flex items-center justify-between mb-2 active:scale-95 transition-all cursor-pointer">
                <div class="flex items-center gap-3">
                    <img src="${u.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="w-10 h-10 rounded-full object-cover">
                    <div>
                        <p class="font-bold text-sm">${u.displayName || u.username}</p>
                        <p class="text-[10px] opacity-40 uppercase">${u.jobType || 'staff'} • ${u.role || 'user'}</p>
                    </div>
                </div>
                <i class="fa-solid fa-chevron-right opacity-20"></i>
            </div>
        `).join('');
    });
}

async function adminEditUser(uid) {
    const s = await db.ref('users/' + uid).once('value');
    editProfile(uid, s.val());
}

async function editProfile(targetUid = currentUser.uid, targetData = userData) {
    const isAdmin = userData.role === 'admin';
    const { value: res } = await Swal.fire({
        title: 'จัดการผู้ใช้', background: '#1c1c1e', color: '#fff',
        html: `
            <div class="space-y-4 text-left">
                <div class="flex justify-center mb-4" onclick="document.getElementById('file-input').dataset.target='${targetUid}'; document.getElementById('file-input').click()">
                    <img src="${targetData.photoURL || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" class="w-20 h-20 rounded-full object-cover border-2 border-blue-500">
                </div>
                <input id="sw-name" class="w-full bg-white/5 p-4 rounded-xl outline-none" value="${targetData.displayName || ''}" placeholder="ชื่อเรียก">
                <input id="sw-sal" type="number" class="w-full bg-white/5 p-4 rounded-xl outline-none" value="${targetData.salary || 15000}" placeholder="เงินเดือนฐาน">
                ${isAdmin ? `
                    <select id="sw-job" class="w-full bg-white/5 p-4 rounded-xl outline-none text-white">
                        <option value="staff" ${targetData.jobType==='staff'?'selected':''}>Staff</option>
                        <option value="rider" ${targetData.jobType==='rider'?'selected':''}>Rider</option>
                    </select>
                    <input id="sw-role" class="w-full bg-white/5 p-4 rounded-xl outline-none" value="${targetData.role || 'staff'}" placeholder="Role (admin/staff)">
                ` : ''}
            </div>`,
        showCancelButton: true,
        preConfirm: () => {
            const d = { displayName: document.getElementById('sw-name').value, salary: parseFloat(document.getElementById('sw-sal').value) };
            if (isAdmin) { d.jobType = document.getElementById('sw-job').value; d.role = document.getElementById('sw-role').value; }
            return d;
        }
    });
    if (res) {
        await db.ref('users/' + targetUid).update(res);
        toast("บันทึกสำเร็จ");
    }
}

// --- 4. CORE FEATURES ---

function calculateSalary() {
    const dailyRate = (userData.salary || 15000) / 30;
    const currentMonth = new Date().getMonth();
    let totalBase = 0, totalDelivery = 0, todayBills = 0;

    logs.forEach(l => {
        if (new Date(l.date).getMonth() === currentMonth) {
            if (!l.isOff && l.checkIn) totalBase += dailyRate;
            if (l.delivery) totalDelivery += (l.delivery * DELIVERY_RATE);
            if (l.date === new Date().toISOString().split('T')[0]) todayBills = l.delivery || 0;
        }
    });

    document.getElementById('salary-view').innerText = (totalBase + totalDelivery).toLocaleString(undefined, {minimumFractionDigits: 2});
    document.getElementById('today-bills').innerText = todayBills;
}

function addDelivery(amt = 1) {
    const d = new Date().toISOString().split('T')[0];
    const log = logs.find(l => l.date === d);
    if (!log) return toast("กรุณาเช็คอินก่อน", "warning");
    db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ delivery: (log.delivery || 0) + amt });
    toast(`+${amt} บิล`);
}

async function quickAddDelivery() {
    const { value: num } = await Swal.fire({ title: 'ระบุจำนวนบิล', input: 'number', background: '#1c1c1e', color: '#fff' });
    if (num) addDelivery(parseInt(num));
}

function tapIn() {
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    if(logs.find(l => l.date === d)) return toast("เช็คอินไปแล้ว", "info");
    db.ref(`attendance/${currentUser.uid}`).push({ date: d, checkIn: t, checkOut: '', isOff: false, delivery: 0 });
    toast("Check In สำเร็จ");
}

function tapOut() {
    const d = new Date().toISOString().split('T')[0], t = new Date().toTimeString().slice(0, 5);
    const log = logs.find(l => l.date === d);
    if(!log || log.checkOut) return toast("เช็คเอาท์ไม่ได้", "error");
    db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ checkOut: t });
    toast("Check Out สำเร็จ");
}

async function deleteLog(id) {
    const r = await Swal.fire({ title: 'ลบข้อมูล?', text: 'ยืนยันการลบรายการนี้?', icon: 'warning', showCancelButton: true });
    if (r.isConfirmed) {
        await db.ref(`attendance/${currentUser.uid}/${id}`).remove();
        toast("ลบเรียบร้อย");
    }
}

// --- 5. UI UTILS ---

function go(id, btn) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function renderWeekly() {
    const list = document.getElementById('week-list');
    if(!list) return;
    list.innerHTML = `<h2 class="text-xl font-bold mb-4">ตารางงานประจำสัปดาห์</h2>` + DAYS.map(d => {
        const s = (userData.shifts && userData.shifts[d]) ? userData.shifts[d] : { in: '08:30', out: '17:30', isOff: false };
        return `<div class="glass-card p-4 flex justify-between items-center ${s.isOff ? 'opacity-30' : ''}">
            <div class="flex flex-col"><span class="font-bold text-sm">${d}</span>
            <button onclick="db.ref('users/${currentUser.uid}/shifts/${d}/isOff').set(${!s.isOff})" class="text-[10px] text-left text-blue-500 font-bold">${s.isOff ? 'หยุด' : 'ทำงาน'}</button></div>
            <div class="flex gap-2"><input type="time" class="time-pill" value="${s.in}" onchange="db.ref('users/${currentUser.uid}/shifts/${d}/in').set(this.value)">
            <input type="time" class="time-pill" value="${s.out}" onchange="db.ref('users/${currentUser.uid}/shifts/${d}/out').set(this.value)"></div></div>`;
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

async function editDay(date) {
    const log = logs.find(l => l.date === date) || { checkIn: '', checkOut: '', isOff: false, delivery: 0 };
    const { value: res } = await Swal.fire({
        title: date, background: '#1c1c1e', color: '#fff',
        html: `
            <div class="text-left space-y-4">
                <label class="flex justify-between items-center bg-white/5 p-4 rounded-2xl"><span>วันหยุด</span><input type="checkbox" id="e-off" ${log.isOff ? 'checked' : ''}></label>
                <div class="grid grid-cols-2 gap-2"><input type="time" id="e-in" class="time-pill w-full" value="${log.checkIn}"><input type="time" id="e-out" class="time-pill w-full" value="${log.checkOut}"></div>
                <input type="number" id="e-del" class="w-full bg-white/5 p-4 rounded-xl outline-none" value="${log.delivery || 0}" placeholder="บิล Delivery">
                ${log.id ? `<button onclick="deleteLog('${log.id}'); Swal.close()" class="w-full py-3 text-red-500 font-bold border border-red-500/20 rounded-xl mt-4">ลบข้อมูล</button>` : ''}
            </div>`,
        showCancelButton: true,
        preConfirm: () => ({ isOff: document.getElementById('e-off').checked, checkIn: document.getElementById('e-in').value, checkOut: document.getElementById('e-out').value, delivery: parseInt(document.getElementById('e-del').value) || 0 })
    });
    if(res) {
        if(log.id) db.ref(`attendance/${currentUser.uid}/${log.id}`).update({ ...res, date });
        else db.ref(`attendance/${currentUser.uid}`).push({ ...res, date });
    }
}

async function handleFileUpload(input) {
    const file = input.files[0], tid = input.dataset.target || currentUser.uid;
    if (!file) return;
    const fd = new FormData(); fd.append("image", file);
    Swal.fire({ title: 'กำลังอัปโหลด...', didOpen: () => Swal.showLoading() });
    try {
        const r = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: fd });
        const res = await r.json();
        if (res.success) {
            await db.ref('users/' + tid).update({ photoURL: res.data.url });
            Swal.close(); toast("อัปเดตรูปสำเร็จ");
        }
    } catch (e) { toast("อัปโหลดล้มเหลว", "error"); }
}

function moveMonth(v) { viewDate.setMonth(viewDate.getMonth() + v); renderCal(); }
function toast(m, i="success") { Swal.fire({ title: m, icon: i, timer: 1500, showConfirmButton: false, background: '#1c1c1e', color: '#fff' }); }
function confirmLogout() { Swal.fire({ title: 'ออกจากระบบ?', showCancelButton: true, background: '#1c1c1e', color: '#fff' }).then(r => { if (r.isConfirmed) auth.signOut(); }); }

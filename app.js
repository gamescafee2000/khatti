const cfg = window.KHATTI_CONFIG;
const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { global: { fetch: khattiNet.fetch } });
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => Number(n || 0).toLocaleString('ar-IQ') + ' د.ع';
const fmtDate = d => new Date(d).toLocaleDateString('ar-IQ');
const statusAr = s => ({pending:'بانتظار الرد', accepted:'مقبول', rejected:'مرفوض'})[s] || s;
const msg = (el, text, ok = false) => { el.textContent = text; el.className = 'msg ' + (ok ? 'ok' : 'err'); };

async function getProfile() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  return data;
}

// ---------- تسجيل الدخول بالإيميل (رمز تحقق يُرسل للبريد) ----------
const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
// تطبيع الهاتف العراقي (اختياري، للتواصل فقط)
function normalizeIraqPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('00964')) d = d.slice(5);
  else if (d.startsWith('964')) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1);
  if (!/^7\d{9}$/.test(d)) return null;
  return '+964' + d;
}

let otpEmail = null, otpCooldownTimer = null;

function authView(note = '') {
  $('top').innerHTML = '';
  $('app').innerHTML = `
  <div class="card" id="stepEmail"><h2>تسجيل الدخول</h2>
    <p class="muted">أدخل بريدك الإلكتروني، وسيصلك رمز تحقق.</p>
    <input id="em" type="email" placeholder="البريد الإلكتروني" dir="ltr" autocomplete="email">
    <div id="signupFields" hidden>
      <input id="nm" placeholder="الاسم الكامل (للحسابات الجديدة)">
      <input id="ph" type="tel" placeholder="رقم الهاتف (اختياري)" dir="ltr" inputmode="tel">
      <select id="gv">${govOptions('', 'المحافظة')}</select>
      <select id="rl"><option value="student">طالب (مجاني)</option><option value="parent">ولي أمر (يدير أبناءه، مجاني)</option><option value="owner">صاحب خط نقل</option></select>
    </div>
    <button id="sendOtp">أرسل رمز التحقق</button>
    <div id="pmsg" class="msg">${esc(note)}</div></div>
  <div class="card" id="stepCode" hidden><h2>أدخل رمز التحقق</h2>
    <p class="muted" id="sentTo"></p>
    <input id="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="------" dir="ltr">
    <button id="verify">تحقق ودخول</button>
    <button class="sec" id="resend" disabled>إعادة الإرسال</button>
    <button class="sec" id="back">تغيير البريد</button>
    <div id="cmsg" class="msg"></div></div>`;

  $('em').oninput = () => { $('signupFields').hidden = !isEmail($('em').value.trim()); };
  $('sendOtp').onclick = () => sendOtp();
  $('verify').onclick = () => verifyOtp();
  $('resend').onclick = () => sendOtp(true);
  $('back').onclick = () => authView();
  $('otp').onkeydown = e => { if (e.key === 'Enter') verifyOtp(); };
}

async function sendOtp(isResend = false) {
  const email = (isResend ? otpEmail : $('em').value.trim().toLowerCase());
  const out = isResend ? $('cmsg') : $('pmsg');
  if (!isEmail(email)) return msg(out, 'اكتب بريداً إلكترونياً صحيحاً');

  const phoneRaw = $('ph')?.value.trim() || '';
  const phone = phoneRaw ? normalizeIraqPhone(phoneRaw) : null;
  if (phoneRaw && !phone) return msg(out, 'رقم الهاتف غير صحيح، أو احذفه إذا ما تبيه');

  // البيانات تُستخدم فقط عند إنشاء حساب جديد
  const options = {
    shouldCreateUser: true,
    data: {
      role: $('rl')?.value || 'student',
      name: ($('nm')?.value || '').trim(),
      governorate: $('gv')?.value || '',
      phone: phone || ''
    }
  };
  const { error } = await sb.auth.signInWithOtp({ email, options });
  if (error) {
    const m = /rate|too many|limit/i.test(error.message) ? 'طلبت رموزاً كثيرة، انتظر قليلاً' : 'تعذر إرسال الرمز. تأكد من البريد وحاول لاحقاً.';
    return msg(out, m);
  }
  otpEmail = email;
  $('stepEmail').hidden = true;
  $('stepCode').hidden = false;
  $('sentTo').textContent = 'أرسلنا رمز التحقق إلى ' + email + '. إذا ما وصلك، تفقد مجلد الرسائل غير المرغوبة.';
  msg($('cmsg'), 'تم إرسال الرمز', true);
  startCooldown(60);
}

function startCooldown(seconds) {
  const btn = $('resend');
  clearInterval(otpCooldownTimer);
  let left = seconds; btn.disabled = true;
  btn.textContent = `إعادة الإرسال بعد ${left} ثانية`;
  otpCooldownTimer = setInterval(() => {
    left--;
    if (left <= 0) { clearInterval(otpCooldownTimer); btn.disabled = false; btn.textContent = 'إعادة الإرسال'; }
    else btn.textContent = `إعادة الإرسال بعد ${left} ثانية`;
  }, 1000);
}

async function verifyOtp() {
  const token = ($('otp').value || '').replace(/\s/g, '');
  if (!/^\d{6,8}$/.test(token)) return msg($('cmsg'), 'أدخل الرمز المكوّن من الأرقام');
  const { error } = await sb.auth.verifyOtp({ email: otpEmail, token, type: 'email' });
  if (error) return msg($('cmsg'), 'الرمز غير صحيح أو منتهي. اطلب رمزاً جديداً.');
  start();
}

// شاشة اختيار المحافظة (للمستخدمين اللي ما عندهم محافظة بعد)
function govPickView(p) {
  $('top').innerHTML = '';
  $('app').innerHTML = `<div class="card"><h2>اختر محافظتك</h2>
    <p class="muted">نعرض لك العروض الخاصة بمحافظتك. تقدر تغيّرها لاحقاً من صفحة بياناتك.</p>
    <select id="gp">${govOptions('', 'اختر المحافظة')}</select>
    <button id="savegp">حفظ</button><div id="gpm" class="msg"></div></div>`;
  $('savegp').onclick = async () => {
    const g = $('gp').value;
    if (!g) return msg($('gpm'), 'اختر المحافظة');
    const { error } = await sb.from('profiles').update({ governorate: g }).eq('id', p.id);
    if (error) msg($('gpm'), 'تعذر الحفظ'); else start();
  };
}

async function start() {
  const p = await getProfile();
  if (!p) return authView();
  if (p.role === 'admin') { location.href = 'admin.html'; return; }
  if (!p.governorate) return govPickView(p);
  window.khattiRole = p.role;
  $('top').innerHTML = `<span>${esc(p.name)}</span> <button class="sec" id="out">خروج</button>`;
  $('out').onclick = async () => { await sb.auth.signOut(); start(); };
  p.role === 'owner' ? ownerView(p) : studentView(p);
}

// ---------- واجهة الطالب ----------
async function studentView(p) {
  const isParent = p.role === 'parent';
  const [lines, reqs, offers, ratings, kids] = await Promise.all([
    sb.from('lines').select('*').eq('active', true).order('id'),
    sb.from('requests').select('id,line_id,status,lines(name),children(name)').eq('student_id', p.id).order('id', { ascending: false }),
    sb.from('offers').select('*').eq('active', true).order('id'),
    sb.from('line_ratings').select('*'),
    isParent ? sb.from('children').select('*').eq('parent_id', p.id).order('id') : Promise.resolve({ data: [] })
  ]);
  const myComplaints = await sb.from('complaints').select('*').eq('from_id', p.id).order('id', { ascending: false });
  const R = Object.fromEntries((ratings.data || []).map(r => [r.line_id, r]));
  const K = kids.data || [];
  // خطوط لها طلبات مقبولة، وكل خط يُقيَّم مرة واحدة فقط (الحد في قاعدة البيانات)
  const acceptedMap = new Map();
  (reqs.data || []).filter(r => r.status === 'accepted').forEach(r => acceptedMap.set(r.line_id, r.lines?.name));

  $('app').innerHTML = `
   ${isParent ? `<div class="card"><h2>أبنائي</h2>
      ${K.map(k => `<div class="row"><span>${esc(k.name)}${k.school ? ' — ' + esc(k.school) : ''}</span>
        <button class="sec" data-del="${k.id}">حذف</button></div>`).join('') || '<p class="muted">أضف ابنك أو بنتك، والاشتراك يُسجَّل باسمهم</p>'}
      <input id="cn" placeholder="اسم الطالب">
      <input id="cs" placeholder="المدرسة أو الجامعة">
      <button id="addchild">إضافة</button><div id="cmsg" class="msg"></div></div>` : ''}
   <div class="card"><h2>العروض</h2>
     ${(offers.data || []).map(o => `<div class="offer"><b>${esc(o.title)}</b><div>${esc(o.body)}</div><div class="muted">${o.governorate ? esc(o.governorate) : 'لكل المحافظات'}</div></div>`).join('') || '<p class="muted">لا توجد عروض حالياً</p>'}</div>
   <div class="card"><h2>ابحث عن خط</h2>
     <input id="q" placeholder="الوجهة أو اسم الخط">
     <select id="gf"><option value="__mine">محافظتي (${esc(p.governorate)})</option><option value="__all">كل المحافظات</option>${GOVS.map(g => `<option value="${g}">${g}</option>`).join('')}</select>
     ${K.length ? `<label class="muted">الاشتراك لـ:</label>
       <select id="who"><option value="">نفسي</option>${K.map(k => `<option value="${k.id}">${esc(k.name)}</option>`).join('')}</select>` : ''}
     <div id="lines"></div></div>
   <div class="card"><h2>طلباتي</h2>
     ${(reqs.data || []).map(r => `<div class="row"><span>${esc(r.lines?.name || 'خط غير متاح')}${r.children ? ' — ' + esc(r.children.name) : ''}</span>
       <span class="badge">${statusAr(r.status)}</span></div>`).join('') || '<p class="muted">لا توجد طلبات</p>'}</div>
   ${acceptedMap.size ? `<div class="card"><h2>قيّم خطك</h2>
     <p class="muted">تقييم واحد لكل خط في الشهر، ويظهر للطلاب الجدد.</p>
     ${[...acceptedMap].map(([lid, name]) => `<div class="card line"><b>${esc(name)}</b>
       <select id="st-${lid}"><option value="5">★★★★★</option><option value="4">★★★★</option><option value="3">★★★</option><option value="2">★★</option><option value="1">★</option></select>
       <input id="cm-${lid}" maxlength="500" placeholder="تعليق اختياري">
       <button data-rate="${lid}">إرسال التقييم</button><div id="rm-${lid}" class="msg"></div></div>`).join('')}</div>` : ''}
   <div class="card"><h2>بياناتي</h2>
     <input id="pn" value="${esc(p.name)}" placeholder="الاسم">
     <select id="pgv">${govOptions(p.governorate)}</select>
     <div class="muted" dir="ltr">${esc(p.email || p.phone || '')}</div>
     <button id="save">حفظ</button><div id="msg" class="msg"></div></div>`;

  const acceptedLines = [...acceptedMap].map(([lid, name]) => `<option value="${lid}">${esc(name)}</option>`).join('');
  const CATS = { service: 'خدمة الخط', driver: 'سلوك السائق', delay: 'تأخير', price: 'السعر', technical: 'مشكلة تقنية', other: 'أخرى' };
  const ST = { open: 'بانتظار الرد', answered: 'تم الرد', closed: 'مغلقة' };
  $('app').insertAdjacentHTML('beforeend', `
   <div class="card"><h2>تقديم شكوى</h2>
     <p class="muted">شكواك تصل للإدارة، وإذا اخترت خطاً تصل لصاحبه أيضاً.</p>
     <select id="cpCat">${Object.entries(CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
     <select id="cpLine"><option value="">شكوى عامة (بدون خط)</option>${acceptedLines}</select>
     <textarea id="cpBody" maxlength="1000" placeholder="اكتب شكواك بالتفصيل (5 أحرف على الأقل)" style="width:100%;min-height:80px;padding:10px;border:1px solid #d1d5db;border-radius:10px"></textarea>
     <button id="cpSend">إرسال الشكوى</button><div id="cpMsg" class="msg"></div>
     <hr>
     <h2>شكاواي</h2>
     ${(myComplaints.data || []).map(c => `<div class="card line">
        <div class="row"><b>${esc(CATS[c.category])}</b><span class="badge">${ST[c.status]}</span></div>
        <div>${esc(c.body)}</div>
        ${c.admin_reply ? `<div class="offer">رد الإدارة: ${esc(c.admin_reply)}</div>` : ''}</div>`).join('') || '<p class="muted">لا توجد شكاوى</p>'}
   </div>`);
  $('cpSend').onclick = async () => {
    const body = $('cpBody').value.trim();
    if (body.length < 5) return msg($('cpMsg'), 'اكتب شكواك (5 أحرف على الأقل)');
    const { error } = await sb.from('complaints').insert({
      from_id: p.id, category: $('cpCat').value, line_id: $('cpLine').value ? +$('cpLine').value : null, body
    });
    if (error) msg($('cpMsg'), 'تعذر الإرسال، تأكد أن الخط مرتبط بطلب مقبول لك');
    else studentView(p);
  };

  const draw = q => {
    const f = $('gf').value;
    const gov = f === '__mine' ? p.governorate : f === '__all' ? null : f;
    const list = (lines.data || []).filter(l =>
      (!gov || l.governorate === gov) && (!q || (l.name + ' ' + l.destination).includes(q)));
    $('lines').innerHTML = list.map(l => {
      const left = l.seats - l.taken - (l.blocked_seats || 0), rt = R[l.id];
      return `<div class="card line"><b>${esc(l.name)}</b> <span class="badge">${({girls:"بنات فقط",boys:"أولاد فقط",mixed:"مختلط"})[l.gender_type] || ""}</span>
        <div class="muted">السيارة: ${esc(l.car_name || "—")} · المحافظة: ${esc(l.governorate || "—")}</div>
        <div class="muted">الوجهة: ${esc(l.destination)} · الانطلاق: ${esc(l.departure)}</div>
        <div class="muted">التقييم: ${rt ? '★ ' + rt.avg_stars + ' (' + rt.reviews_count + ' تقييم)' : 'لا توجد تقييمات بعد'}</div>
        <div class="row"><span>${money(l.price)} / شهر</span>
          <span class="${left > 0 ? 'ok' : 'err'}">${left > 0 ? 'مقاعد متوفرة: ' + left : 'ممتلئ'}</span></div>
        <div class="row"><button data-id="${l.id}" ${left > 0 ? '' : 'disabled'}>طلب اشتراك</button></div></div>`;
    }).join('') || '<p class="muted">لا توجد خطوط مطابقة</p>';
    document.querySelectorAll('button[data-id]').forEach(b => b.onclick = async () => {
      const who = $('who')?.value;
      const { error } = await sb.from('requests').insert({
        student_id: p.id, line_id: +b.dataset.id, child_id: who ? +who : null
      });
      if (error) alert(error.code === '23505' ? 'يوجد طلب سابق لنفس الشخص على هذا الخط'
        : 'تعذر إرسال الطلب');
      else studentView(p);
    });
  };
  draw('');
  $('q').oninput = e => draw(e.target.value.trim());
  $('gf').onchange = () => draw($('q').value.trim());

  if (isParent) {
    $('addchild').onclick = async () => {
      const name = $('cn').value.trim();
      if (name.length < 2) return msg($('cmsg'), 'اكتب اسم الطالب');
      const { error } = await sb.from('children').insert({ parent_id: p.id, name, school: $('cs').value.trim() });
      if (error) msg($('cmsg'), 'تعذر الإضافة'); else studentView(p);
    };
    document.querySelectorAll('button[data-del]').forEach(b => b.onclick = async () => {
      if (!confirm('حذف هذا الطالب يحذف طلباته أيضاً. متأكد؟')) return;
      await sb.from('children').delete().eq('id', b.dataset.del); studentView(p);
    });
  }

  document.querySelectorAll('button[data-rate]').forEach(b => b.onclick = async () => {
    const lid = b.dataset.rate;
    const { error } = await sb.from('reviews').insert({
      line_id: +lid, reviewer_id: p.id,
      stars: +$('st-' + lid).value, comment: $('cm-' + lid).value.trim()
    });
    if (error) msg($('rm-' + lid), error.code === '23505' ? 'قيّمت هذا الخط هذا الشهر بالفعل' : 'تعذر إرسال التقييم');
    else msg($('rm-' + lid), 'شكراً، تم إرسال تقييمك', true);
  });

  $('save').onclick = async () => {
    const { error } = await sb.from('profiles').update({ name: $('pn').value.trim(), governorate: $('pgv').value || null }).eq('id', p.id);
    msg($('msg'), error ? 'تعذر الحفظ' : 'تم الحفظ', !error);
  };
}

// ---------- واجهة صاحب الخط ----------
const ALLOWED_DOCS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

async function uploadRegistration(uid, file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${uid}/registration-${Date.now()}.${ext}`;
  const { error } = await sb.storage.from('owner-docs').upload(path, file, { contentType: file.type, upsert: false });
  return error ? null : path;
}

async function ownerView(p) {
  const [sub, prices, details, lines, incoming] = await Promise.all([
    sb.from('subscriptions').select('end_date').eq('owner_id', p.id).maybeSingle(),
    sb.from('settings').select('key,value').in('key', ['price_first', 'price_renewal']),
    sb.from('owner_details').select('*').eq('owner_id', p.id).maybeSingle(),
    sb.from('lines').select('*').eq('owner_id', p.id).order('id'),
    sb.from('requests').select('id,profiles(name,phone),lines!inner(name,owner_id,seats,taken)')
      .eq('lines.owner_id', p.id).eq('status', 'pending')
  ]);
  const pv = Object.fromEntries((prices.data || []).map(x => [x.key, x.value]));
  const myOffers = await sb.from('offers').select('*').eq('owner_id', p.id).order('id');
  const end = sub.data?.end_date;
  const now = Date.now();
  const active = !!end && new Date(end) > now;
  const days = active ? Math.ceil((new Date(end) - now) / 86400000) : 0;
  const deleteIn = end ? Math.ceil((new Date(end).getTime() + 15 * 86400000 - now) / 86400000) : 0;
  const price = p.has_paid ? pv.price_renewal : pv.price_first;
  const priceLabel = p.has_paid ? 'سعر التجديد' : 'سعر الاشتراك الأول';
  const d = details.data;

  // ----- تنبيهات قبل الانتهاء وقبل الحذف (داخل التطبيق) -----
  let banner = '';
  if (active && days <= 3)
    banner = `<div class="card" style="background:#fef3c7"><b>تنبيه:</b> ينتهي اشتراكك بعد ${days} ${days === 1 ? 'يوم' : 'أيام'}. جدّد قبل الانتهاء.</div>`;
  if (!active && end && deleteIn > 0 && deleteIn <= 3)
    banner = `<div class="card" style="background:#fee2e2"><b>تحذير عاجل:</b> سيُحذف حسابك نهائياً وينحظر رقمك خلال ${deleteIn} ${deleteIn === 1 ? 'يوم' : 'أيام'} إذا ما جددت.</div>`;

  // ----- الاشتراك والتفعيل -----
  const subCard = `<div class="card"><h2>اشتراكي في خطّي</h2>
     <p>الحالة: <span class="badge ${active ? '' : 'exp'}">${active ? 'فعّال (' + days + ' يوم متبقي)' : 'منتهٍ'}</span></p>
     ${end ? `<p class="muted">تاريخ الاستحقاق: ${fmtDate(end)}</p>` : ''}
     ${!active && end && deleteIn > 0 ? `<p class="err">إذا ما جددت خلال ${deleteIn} يوم سيُحذف حسابك نهائياً.</p>` : ''}
     <p class="muted">${priceLabel}: ${money(price)} / شهر</p>
     <input id="code" placeholder="كود التفعيل" dir="ltr">
     <button id="redeem">تفعيل</button><div id="msg" class="msg"></div></div>`;

  // ----- بيانات التسجيل ومراجعتها -----
  const formCard = (title, note) => `<div class="card"><h2>${title}</h2>
     ${note ? `<p class="muted">${note}</p>` : ''}
     <input id="fn" placeholder="الاسم الثلاثي" value="${esc(d?.full_name || '')}">
     <input id="nid" placeholder="رقم البطاقة الموحدة" dir="ltr" inputmode="numeric" value="${esc(d?.national_id || '')}">
     <input id="cp" placeholder="رقم لوحة السيارة" dir="ltr" value="${esc(d?.car_plate || '')}">
     <p class="muted">إجازة تسجيل المركبة (صورة أو PDF، أقصى حجم 5 ميغابايت)${d?.registration_path ? ' — مرفوعة سابقاً، ارفع جديدة إذا تبي تغيّرها' : ''}</p>
     <input id="reg" type="file" accept="image/jpeg,image/png,image/webp,application/pdf">
     <button id="savedet">إرسال للمراجعة</button><div id="dmsg" class="msg"></div></div>`;

  let regCard = '';
  if (!d) regCard = formCard('أكمل بياناتك', 'بعد الإرسال تراجع الإدارة بياناتك، ولا تقدر تضيف خطوطاً قبل الموافقة.');
  else if (d.status === 'pending') regCard = `<div class="card"><h2>بياناتك قيد المراجعة</h2>
     <p class="muted">الإدارة تراجع بياناتك وإجازة المركبة. ستظهر لك النتيجة هنا.</p>
     <div class="muted">${esc(d.full_name)} · بطاقة: ${esc(d.national_id)} · لوحة: ${esc(d.car_plate)}</div></div>`;
  else if (d.status === 'rejected') regCard = formCard('تم رفض البيانات',
     `سبب الرفض: ${esc(d.reject_reason || 'لم يُذكر')}. عدّل البيانات وأعد الإرسال.`);

  const approved = d?.status === 'approved';

  $('app').innerHTML = banner + subCard + regCard +
   (approved && active ? `<div class="card"><h2>إضافة خط</h2>
     <input id="ln" placeholder="اسم الخط"><input id="lc" placeholder="اسم السيارة (مثال: هايس أبيض)"><input id="ld" placeholder="الوجهة">
     <input id="lt" placeholder="وقت الانطلاق" dir="ltr"><input id="lp" type="number" placeholder="السعر د.ع">
     <input id="ls" type="number" placeholder="عدد المقاعد">
     <select id="lg"><option value="mixed">مختلط (للجميع)</option><option value="girls">بنات فقط</option><option value="boys">أولاد فقط</option></select><button id="addline">إضافة</button>
     <div id="lmsg" class="msg"></div></div>` : '') +
   (approved ? `<div class="card"><h2>خطوطي</h2>
     ${(lines.data || []).map(l => {
       const vac = l.seats - l.taken - (l.blocked_seats || 0);
       return `<div class="card line">
         <b>${esc(l.name)}</b>
         <div class="muted">الممتلئ: ${l.taken} · الشاغر: ${vac} · الكلي: ${l.seats}</div>
         <input data-cn="${l.id}" value="${esc(l.car_name || '')}" placeholder="اسم السيارة" maxlength="60">
         <div class="row">
           <label class="muted">المقاعد الكلية <input data-ts="${l.id}" type="number" min="1" value="${l.seats}"></label>
           <label class="muted">المقاعد الشاغرة <input data-vc="${l.id}" type="number" min="0" value="${vac}"></label>
         </div>
         <div class="row">
           <button data-save="${l.id}">حفظ البيانات</button>
           <select data-gt="${l.id}" style="width:auto;margin:0">
             <option value="mixed" ${l.gender_type === 'mixed' ? 'selected' : ''}>مختلط</option>
             <option value="girls" ${l.gender_type === 'girls' ? 'selected' : ''}>بنات فقط</option>
             <option value="boys" ${l.gender_type === 'boys' ? 'selected' : ''}>أولاد فقط</option></select>
           <button class="sec" data-t="${l.id}">${l.active ? 'إيقاف النشر' : 'نشر'}</button>
         </div>
         <div id="lm-${l.id}" class="msg"></div></div>`;
     }).join('') || '<p class="muted">لا توجد خطوط</p>'}</div>
     <div class="card"><h2>طلبات بانتظار القرار</h2>
     ${(incoming.data || []).map(r => `<div class="row"><span>${esc(r.profiles?.name || 'طالب')} — ${esc(r.lines.name)} (${r.lines.taken}/${r.lines.seats})</span>
       <span><button data-a="${r.id}" data-ok="1">قبول</button> <button class="sec" data-a="${r.id}" data-ok="0">رفض</button></span></div>`).join('')
       || '<p class="muted">لا توجد طلبات</p>'}</div>` : '');

  // ----- الأحداث -----
  const offersHtml = `<div class="card"><h2>محافظة الخدمة والعروض</h2>
    <select id="ogv">${govOptions(p.governorate)}</select>
    <button id="savegov">حفظ المحافظة</button><div id="gvm" class="msg"></div>
    <hr>
    <p class="muted">عروض تظهر لطلاب وأولياء الأمور في محافظتك (${esc(p.governorate || 'لم تُحدَّد')}).</p>
    <input id="oft" placeholder="عنوان العرض"><input id="ofb" placeholder="التفاصيل">
    <button id="addoffer2">إضافة عرض</button><div id="ofm" class="msg"></div>
    ${(myOffers.data || []).map(o => `<div class="row"><span>${esc(o.title)}</span>
      <span><button class="sec" data-oft="${o.id}" data-on="${o.active ? 0 : 1}">${o.active ? 'إخفاء' : 'إظهار'}</button>
      <button class="bad" data-ofd="${o.id}">حذف</button></span></div>`).join('')}</div>`;
  $('app').insertAdjacentHTML('beforeend', offersHtml);
  $('savegov').onclick = async () => {
    const g = $('ogv').value;
    if (!g) return msg($('gvm'), 'اختر المحافظة');
    const { error } = await sb.from('profiles').update({ governorate: g }).eq('id', p.id);
    if (error) msg($('gvm'), 'تعذر الحفظ'); else start();
  };
  $('addoffer2').onclick = async () => {
    const title = $('oft').value.trim();
    if (!title) return msg($('ofm'), 'اكتب عنوان العرض');
    const { error } = await sb.from('offers').insert({ owner_id: p.id, governorate: p.governorate, title, body: $('ofb').value.trim() });
    if (error) msg($('ofm'), 'تعذر إضافة العرض، تأكد من المحافظة والاشتراك'); else start();
  };
  document.querySelectorAll('button[data-oft]').forEach(b => b.onclick = async () => {
    await sb.from('offers').update({ active: b.dataset.on === '1' }).eq('id', b.dataset.oft); start();
  });
  document.querySelectorAll('button[data-ofd]').forEach(b => b.onclick = async () => {
    if (!confirm('حذف هذا العرض؟')) return;
    await sb.from('offers').delete().eq('id', b.dataset.ofd); start();
  });

  const myComplaintsOwner = await sb.from('complaints').select('*').eq('owner_id', p.id).order('id', { ascending: false });
  const CATS_O = { service: 'خدمة الخط', driver: 'سلوك السائق', delay: 'تأخير', price: 'السعر', technical: 'مشكلة تقنية', other: 'أخرى' };
  $('app').insertAdjacentHTML('beforeend', `<div class="card"><h2>شكاوى تخص خطوطك</h2>
    ${(myComplaintsOwner.data || []).map(c => `<div class="card line">
      <div class="row"><b>${esc(CATS_O[c.category])}</b><span class="muted">${new Date(c.created_at).toLocaleDateString('ar-IQ')}</span></div>
      <div>${esc(c.body)}</div>
      ${c.admin_reply ? `<div class="offer">رد الإدارة: ${esc(c.admin_reply)}</div>` : '<div class="muted">بانتظار رد الإدارة</div>'}</div>`).join('')
      || '<p class="muted">لا توجد شكاوى موجهة لك</p>'}</div>`);

  $('redeem').onclick = async () => {
    const { error } = await sb.rpc('redeem_code', { p_code: $('code').value });
    if (error) msg($('msg'), 'كود التفعيل غير صالح أو مستخدم أو منتهي. تواصل مع إدارة التطبيق.');
    else { msg($('msg'), 'تم التفعيل بنجاح', true); setTimeout(start, 500); }
  };

  $('savedet').onclick = async () => {
    const full = $('fn').value.trim().replace(/\s+/g, ' ');
    const nid = $('nid').value.trim();
    const plate = $('cp').value.trim();
    const file = $('reg').files[0];
    if (full.split(' ').length < 3) return msg($('dmsg'), 'اكتب الاسم الثلاثي كاملاً');
    if (!/^[0-9]{6,20}$/.test(nid)) return msg($('dmsg'), 'رقم البطاقة الموحدة أرقام فقط');
    if (plate.length < 3) return msg($('dmsg'), 'أدخل رقم لوحة السيارة');
    if (file && (!ALLOWED_DOCS.includes(file.type) || file.size > 5242880))
      return msg($('dmsg'), 'الملف لازم يكون صورة أو PDF، وأقصى حجم 5 ميغابايت');
    if (!file && !d?.registration_path) return msg($('dmsg'), 'ارفع إجازة تسجيل المركبة');

    let path = d?.registration_path || null;
    if (file) {
      path = await uploadRegistration(p.id, file);
      if (!path) return msg($('dmsg'), 'تعذر رفع الملف، حاول مرة ثانية');
    }
    const row = { owner_id: p.id, full_name: full, national_id: nid, car_plate: plate, registration_path: path };
    const { error } = d
      ? await sb.from('owner_details').update(row).eq('owner_id', p.id)
      : await sb.from('owner_details').insert(row);
    if (error) msg($('dmsg'), 'تعذر الإرسال، تأكد من البيانات وحاول مرة ثانية');
    else start();
  };

  if (approved && active) $('addline').onclick = async () => {
    const { error } = await sb.from('lines').insert({
      owner_id: p.id, name: $('ln').value.trim(), car_name: $('lc').value.trim(), destination: $('ld').value.trim(),
      departure: $('lt').value.trim(), price: +$('lp').value, seats: +$('ls').value,
      gender_type: $('lg').value
    });
    if (error) msg($('lmsg'), 'تعذر الإضافة. تأكد من البيانات والاشتراك.'); else start();
  };
  document.querySelectorAll('button[data-t]').forEach(b => b.onclick = async () => {
    const l = lines.data.find(x => x.id == b.dataset.t);
    await sb.from('lines').update({ active: !l.active }).eq('id', l.id);
    start();
  });
  document.querySelectorAll('button[data-save]').forEach(b => b.onclick = async () => {
    const id = b.dataset.save, l = lines.data.find(x => x.id == id), out = $('lm-' + id);
    const car = document.querySelector(`input[data-cn="${id}"]`).value.trim();
    const total = +document.querySelector(`input[data-ts="${id}"]`).value;
    const vacant = +document.querySelector(`input[data-vc="${id}"]`).value;
    if (!Number.isInteger(total) || total < 1) return msg(out, 'عدد المقاعد الكلي لازم يكون رقم أكبر من صفر');
    if (!Number.isInteger(vacant) || vacant < 0) return msg(out, 'عدد المقاعد الشاغرة لازم يكون صفر أو أكثر');
    const blocked = total - l.taken - vacant;
    if (blocked < 0) return msg(out, 'المقاعد الشاغرة أكبر من المتبقي. قلّل الشاغرة أو زد الكلية.');
    const { error } = await sb.from('lines').update({ car_name: car, seats: total, blocked_seats: blocked }).eq('id', id);
    if (error) msg(out, 'تعذر الحفظ، تأكد من الأرقام'); else start();
  });
  document.querySelectorAll('select[data-gt]').forEach(sel => sel.onchange = async () => {
    const { error } = await sb.from('lines').update({ gender_type: sel.value }).eq('id', sel.dataset.gt);
    if (error) alert('تعذر تغيير نوع الخط'); else start();
  });
  document.querySelectorAll('button[data-a]').forEach(b => b.onclick = async () => {
    const { error } = await sb.rpc('decide_request', { p_request: +b.dataset.a, p_accept: b.dataset.ok === '1' });
    if (error) alert('تعذر تنفيذ القرار: ' + error.message);
    start();
  });
}

window.addEventListener('khatti:online', () => start());
start().catch(() => {});

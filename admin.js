const cfg = window.KHATTI_CONFIG;
const sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { global: { fetch: khattiNet.fetch } });
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dt = d => new Date(d).toLocaleDateString('ar-IQ');
const deny = () => { document.querySelector('main').innerHTML = '<div class="card"><p class="err">لا تملك صلاحية الوصول إلى هذه الصفحة.</p></div>'; };
const STATUS = { pending: 'بانتظار المراجعة', approved: 'موافق عليه', rejected: 'مرفوض' };

async function init() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { document.querySelector('main').innerHTML = '<div class="card"><a href="index.html">سجّل دخولك أولاً</a></div>'; return; }
  const { data: p } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (p?.role !== 'admin') return deny();
  load();
}

async function load() {
  const [profs, subs, dets, blocked, dlog, prices, offers, codes, secrets] = await Promise.all([
    sb.from('profiles').select('id,role,name,phone,email,has_paid'),
    sb.from('subscriptions').select('owner_id,end_date'),
    sb.from('owner_details').select('*'),
    sb.from('blocked_phones').select('*').order('blocked_at', { ascending: false }),
    sb.from('deletion_log').select('*').order('deleted_at', { ascending: false }).limit(50),
    sb.from('settings').select('key,value').in('key', ['price_first', 'price_renewal']),
    sb.from('offers').select('*').order('id'),
    sb.from('activation_codes').select('months,used_at,created_at').order('created_at', { ascending: false }),
    sb.from('admin_secrets').select('key,value')
  ]);
  const P = profs.data || [], S = subs.data || [], D = dets.data || [], C = codes.data || [];
  const subOf = Object.fromEntries(S.map(s => [s.owner_id, s.end_date]));
  const detOf = Object.fromEntries(D.map(d => [d.owner_id, d]));
  const pv = Object.fromEntries((prices.data || []).map(x => [x.key, x.value]));
  const sv = Object.fromEntries((secrets.data || []).map(x => [x.key, x.value]));
  const owners = P.filter(p => p.role === 'owner');
  const pending = owners.filter(o => detOf[o.id]?.status === 'pending');
  const now = Date.now();

  const ownerCard = o => {
    const d = detOf[o.id], end = subOf[o.id];
    const left = end ? Math.ceil((new Date(end).getTime() + 15 * 864e5 - now) / 864e5) : null;
    return `<div class="card line">
      <b>${esc(d?.full_name || o.name || 'بدون اسم')}</b> <span class="muted" dir="ltr">${esc(o.email || o.phone || '')}</span>
      <div class="muted">${d ? `بطاقة: ${esc(d.national_id)} · لوحة: ${esc(d.car_plate)} · الحالة: ${STATUS[d.status]}` : 'لم يرفع بياناته بعد'}</div>
      ${d?.status === 'rejected' ? `<div class="muted">سبب الرفض: ${esc(d.reject_reason)}</div>` : ''}
      <div class="muted">الاستحقاق: ${end ? dt(end) : '—'} ${end && new Date(end) < now ? `· يُحذف بعد ${Math.max(left, 0)} يوم` : ''} · ${o.has_paid ? 'دفع سابقاً' : 'لم يدفع بعد'}</div>
      <div class="row">
        ${d?.registration_path ? `<button class="sec" data-doc="${esc(d.registration_path)}">إجازة المركبة</button>` : ''}
        ${d?.status === 'pending' ? `<button data-approve="${o.id}">موافقة</button><button class="bad" data-reject="${o.id}">رفض</button>` : ''}
        ${end ? `<button class="sec" data-ext="${o.id}">تمديد شهر</button>` : ''}
        ${d?.status === 'approved' && sv.telegram_bot_token ? `<button class="sec" data-tg="${o.id}">إرسال إلى تلكرام</button>` : ''}
      </div></div>`;
  };

  $('app').innerHTML = `
   <div class="card"><h2>بانتظار مراجعتك (${pending.length})</h2>
     ${pending.map(ownerCard).join('') || '<p class="muted">لا توجد طلبات بانتظار المراجعة</p>'}</div>

   <div class="card"><h2>أسعار الاشتراك</h2>
     <input id="pf" type="number" value="${pv.price_first || ''}" placeholder="سعر الاشتراك الأول (د.ع)">
     <input id="pr" type="number" value="${pv.price_renewal || ''}" placeholder="سعر التجديد (د.ع)">
     <button id="saveprices">حفظ الأسعار</button><div id="pmsg" class="muted">يطبق على الاشتراكات والتجديدات الجديدة فقط.</div></div>

   <div class="card"><h2>إعداد تلكرام</h2>
     <input id="tt" value="${esc(sv.telegram_bot_token || '')}" placeholder="توكن البوت" dir="ltr">
     <input id="tc" value="${esc(sv.telegram_chat_id || '')}" placeholder="معرّف المحادثة (chat id)" dir="ltr">
     <button id="savetg">حفظ</button><div id="tmsg" class="muted">استخدم محادثة خاصة بك، فرسائل البوت غير مشفرة من طرف لطرف.</div></div>

   <div class="card"><h2>كل أصحاب الخطوط (${owners.length})</h2>
     ${owners.map(ownerCard).join('') || '<p class="muted">لا يوجد أصحاب خطوط</p>'}</div>

   <div class="card"><h2>الأرقام المحظورة</h2>
     ${(blocked.data || []).map(b => `<div class="row"><span dir="ltr">${esc(b.phone)}</span>
       <span class="muted">${dt(b.blocked_at)}</span><button class="sec" data-unb="${esc(b.phone)}">فك الحظر</button></div>`).join('') || '<p class="muted">لا توجد أرقام محظورة</p>'}</div>

   <div class="card"><h2>سجل الحذف</h2>
     ${(dlog.data || []).map(l => `<div class="row"><span>${esc(l.name)} <span dir="ltr">${esc(l.phone)}</span></span><span class="muted">${dt(l.deleted_at)}</span></div>`).join('') || '<p class="muted">لا يوجد</p>'}</div>

   <div class="card"><h2>إصدار كود تفعيل</h2>
     <input id="cm" type="number" min="1" value="1" placeholder="عدد الأشهر">
     <input id="cam" type="number" min="0" placeholder="المبلغ المستلم (د.ع)">
     <button id="mkcode">إصدار كود</button><div id="cout"></div>
     <table><tr><th>المدة</th><th>الحالة</th><th>التاريخ</th></tr>
     ${C.map(c => `<tr><td>${c.months} شهر</td><td>${c.used_at ? 'مستخدم' : 'جديد'}</td><td>${dt(c.created_at)}</td></tr>`).join('')
       || '<tr><td colspan=3 class="muted">لا أكواد</td></tr>'}</table></div>

   <div class="card"><h2>العروض للطلاب</h2>
     <input id="ot" placeholder="عنوان العرض"><input id="ob" placeholder="التفاصيل">
     <select id="og">${govOptions('', 'كل المحافظات')}</select>
     <button id="addoffer">إضافة عرض</button>
     ${(offers.data || []).map(o => `<div class="row"><span>${esc(o.title)} <span class="muted">(${o.governorate ? esc(o.governorate) : 'كل المحافظات'})</span></span>
       <button class="${o.active ? 'sec' : ''}" data-off="${o.id}" data-on="${o.active ? 0 : 1}">${o.active ? 'إخفاء' : 'إظهار'}</button></div>`).join('')}</div>`;

  $('saveprices').onclick = async () => {
    const f = +$('pf').value, r = +$('pr').value;
    if (!(f > 0) || !(r > 0)) return alert('أدخل سعرين صحيحين');
    const a = await sb.from('settings').update({ value: String(f) }).eq('key', 'price_first');
    const b = await sb.from('settings').update({ value: String(r) }).eq('key', 'price_renewal');
    $('pmsg').textContent = (a.error || b.error) ? 'تعذر الحفظ' : 'تم الحفظ'; if (!a.error && !b.error) load();
  };
  $('savetg').onclick = async () => {
    const { error } = await sb.from('admin_secrets').upsert([
      { key: 'telegram_bot_token', value: $('tt').value.trim() },
      { key: 'telegram_chat_id', value: $('tc').value.trim() }]);
    $('tmsg').textContent = error ? 'تعذر الحفظ' : 'تم الحفظ'; if (!error) load();
  };
  $('mkcode').onclick = async () => {
    const months = +$('cm').value;
    if (!(months > 0)) return;
    const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    let s = ''; for (const b of bytes) s += alpha[b % alpha.length];
    const code = s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12);
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)))]
      .map(b => b.toString(16).padStart(2, '0')).join('');
    const amount = +$('cam').value;
    const { error } = await sb.from('activation_codes').insert({ code_hash: hash, months, amount: amount > 0 ? amount : null });
    $('cout').innerHTML = error ? '<p class="err">تعذر إصدار الكود</p>'
      : `<p>الكود (يظهر مرة واحدة، انسخه الآن):</p><div class="code">${code}</div>`;
    if (!error) load();
  };

  document.querySelectorAll('button[data-approve]').forEach(b => b.onclick = async () => {
    if (!confirm('الموافقة على هذا الحساب؟')) return;
    const { error } = await sb.rpc('admin_review_owner', { p_owner: b.dataset.approve, p_approve: true, p_reason: null });
    if (error) alert('تعذر الموافقة: ' + error.message); else load();
  });
  document.querySelectorAll('button[data-reject]').forEach(b => b.onclick = async () => {
    const reason = prompt('سبب الرفض (يظهر لصاحب الخط):');
    if (!reason || !reason.trim()) return;
    const { error } = await sb.rpc('admin_review_owner', { p_owner: b.dataset.reject, p_approve: false, p_reason: reason.trim() });
    if (error) alert('تعذر الرفض: ' + error.message); else load();
  });
  document.querySelectorAll('button[data-doc]').forEach(b => b.onclick = async () => {
    const { data, error } = await sb.storage.from('owner-docs').createSignedUrl(b.dataset.doc, 300);
    if (error) return alert('تعذر فتح الملف');
    window.open(data.signedUrl, '_blank');
  });
  document.querySelectorAll('button[data-ext]').forEach(b => b.onclick = async () => {
    const cur = subOf[b.dataset.ext];
    const d = new Date(Math.max(cur ? new Date(cur) : 0, Date.now())); d.setMonth(d.getMonth() + 1);
    const { error } = await sb.from('subscriptions').upsert({ owner_id: b.dataset.ext, end_date: d.toISOString() });
    if (error) alert('تعذر التمديد'); else load();
  });
  document.querySelectorAll('button[data-tg]').forEach(b => b.onclick = async () => {
    if (!confirm('سيُرسل الاسم والبطاقة الموحدة واللوحة إلى تلكرام. متأكد؟')) return;
    const { data, error } = await sb.functions.invoke('send-owner-telegram', { body: { owner_id: b.dataset.tg } });
    alert(!error && data?.ok ? 'تم الإرسال' : 'تعذر الإرسال: تأكد من إعداد تلكرام والنشر');
  });
  document.querySelectorAll('button[data-unb]').forEach(b => b.onclick = async () => {
    if (!confirm('فك الحظر عن هذا الرقم؟')) return;
    await sb.from('blocked_phones').delete().eq('phone', b.dataset.unb); load();
  });
  $('addoffer').onclick = async () => {
    if (!$('ot').value.trim()) return;
    await sb.from('offers').insert({ title: $('ot').value.trim(), body: $('ob').value.trim(), governorate: $('og').value || null }); load();
  };
  document.querySelectorAll('button[data-off]').forEach(b => b.onclick = async () => {
    await sb.from('offers').update({ active: b.dataset.on === '1' }).eq('id', b.dataset.off); load();
  });
  if (window.loadExtra) window.loadExtra($('app'));
}

window.addEventListener('khatti:online', () => init());
init().catch(() => {});

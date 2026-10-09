// أقسام إضافية في لوحة الإدارة: التقارير الشهرية، الشكاوى، التقييمات، سجل التدقيق
(function () {
  const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dt = d => new Date(d).toLocaleDateString('ar-IQ');
  const dtt = d => new Date(d).toLocaleString('ar-IQ');
  const money = n => Number(n || 0).toLocaleString('ar-IQ') + ' د.ع';
  const CAT = { service: 'خدمة الخط', driver: 'سلوك السائق', delay: 'تأخير', price: 'السعر', technical: 'مشكلة تقنية', other: 'أخرى' };
  const ST = { open: 'جديدة', answered: 'تم الرد', closed: 'مغلقة' };
  const ACT = { INSERT: 'إضافة', UPDATE: 'تعديل', DELETE: 'حذف' };

  // بداية ونهاية شهر معيّن (offset = 0 هذا الشهر، -1 الشهر الماضي...)
  const monthRange = offset => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
    return { start, end, label: start.toLocaleDateString('ar-IQ', { month: 'long', year: 'numeric' }) };
  };
  const inM = (d, r) => d && new Date(d) >= r.start && new Date(d) < r.end;

  // ---------- التقارير الشهرية ----------
  function reportsHtml(data, offset) {
    const r = monthRange(offset);
    const codes = data.codes.filter(c => inM(c.used_at, r));
    const revenue = codes.reduce((a, c) => a + (c.amount || 0), 0);
    const firstPaid = data.profiles.filter(p => inM(p.first_paid_at, r)).length;
    const renewals = codes.filter(c => c.kind === 'renewal').length;
    const newOwners = data.profiles.filter(p => p.role === 'owner' && inM(p.created_at, r)).length;
    const expired = data.subs.filter(s => inM(s.end_date, r) && new Date(s.end_date) < new Date());
    const lost = expired.length * (data.priceRenewal || 0);
    const deleted = data.dlog.filter(d => inM(d.deleted_at, r)).length;

    // آخر 6 أشهر للمقارنة
    const last6 = [-5, -4, -3, -2, -1, 0].map(o => {
      const rr = monthRange(o);
      return { label: rr.start.toLocaleDateString('ar-IQ', { month: 'short' }),
        revenue: data.codes.filter(c => inM(c.used_at, rr)).reduce((a, c) => a + (c.amount || 0), 0),
        newPaid: data.profiles.filter(p => inM(p.first_paid_at, rr)).length };
    });
    const maxRev = Math.max(1, ...last6.map(x => x.revenue));
    const maxNew = Math.max(1, ...last6.map(x => x.newPaid));
    const bar = (v, max, color) => `<div style="background:#e5e7eb;border-radius:6px;height:14px;margin:4px 0">
      <div style="background:${color};height:14px;border-radius:6px;width:${Math.round(v / max * 100)}%"></div></div>`;

    // أين تحتاج تتحرك: المنتهية اشتراكاتهم الآن
    const needAct = data.subs.filter(s => new Date(s.end_date) < new Date() &&
        new Date(s.end_date).getTime() + 15 * 864e5 > Date.now())
      .map(s => ({ s, p: data.profiles.find(x => x.id === s.owner_id) }))
      .sort((a, b) => new Date(a.s.end_date) - new Date(b.s.end_date));

    return `
    <div class="card"><h2>التقرير الشهري</h2>
      <div class="row">
        <button class="sec" data-mo="${offset - 1}">‹ الشهر السابق</button>
        <b>${e(r.label)}</b>
        <button class="sec" data-mo="${Math.min(offset + 1, 0)}" ${offset >= 0 ? 'disabled' : ''}>الشهر التالي ›</button>
      </div>
      <div class="row"><div class="card" style="flex:1;margin:4px"><div class="muted">الإيرادات</div><b>${money(revenue)}</b></div>
        <div class="card" style="flex:1;margin:4px"><div class="muted">اشتراكات جديدة</div><b>${firstPaid}</b></div></div>
      <div class="row"><div class="card" style="flex:1;margin:4px"><div class="muted">مجددون</div><b>${renewals}</b></div>
        <div class="card" style="flex:1;margin:4px"><div class="muted">أصحاب خطوط جدد</div><b>${newOwners}</b></div></div>
      <div class="row"><div class="card" style="flex:1;margin:4px"><div class="muted">انتهت اشتراكاتهم</div><b>${expired.length}</b></div>
        <div class="card" style="flex:1;margin:4px"><div class="muted">خسارة تقديرية من الانتهاء</div><b>${money(lost)}</b></div></div>
      <div class="muted">حُذف في هذا الشهر: ${deleted} حساب. الخسارة التقديرية = عدد الاشتراكات المنتهية × سعر التجديد الحالي.</div>
    </div>

    <div class="card"><h2>آخر 6 أشهر</h2>
      ${last6.map(x => `<div><span>${e(x.label)} · الإيرادات ${money(x.revenue)}</span>${bar(x.revenue, maxRev, '#14b8a6')}</div>`).join('')}
      <div style="margin-top:12px">${last6.map(x => `<div><span>${e(x.label)} · اشتراكات جديدة ${x.newPaid}</span>${bar(x.newPaid, maxNew, '#0f766e')}</div>`).join('')}</div>
    </div>

    <div class="card"><h2>هنا تحتاج تتحرك</h2>
      ${needAct.map(({ s, p }) => `<div class="row"><span>${e(p?.name || 'صاحب خط')} <span dir="ltr" class="muted">${e(p?.phone)}</span></span>
        <span class="err">انتهى ${dt(s.end_date)} · يُحذف بعد ${Math.max(0, Math.ceil((new Date(s.end_date).getTime() + 15 * 864e5 - Date.now()) / 864e5))} يوم</span></div>`).join('')
        || '<p class="muted">لا يوجد اشتراكات منتهية بانتظار التجديد</p>'}
    </div>`;
  }

  // ---------- الشكاوى ----------
  function complaintsHtml(complaints) {
    const sorted = [...complaints].sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1));
    return `<div class="card"><h2>الشكاوى (${complaints.filter(c => c.status === 'open').length} جديدة)</h2>
      ${sorted.map(c => `<div class="card line">
        <div class="row"><b>${e(CAT[c.category])}</b><span class="badge ${c.status === 'open' ? 'soon' : ''}">${ST[c.status]}</span></div>
        <div class="muted">${dtt(c.created_at)}</div>
        <div>${e(c.body)}</div>
        ${c.admin_reply ? `<div class="muted">ردّك: ${e(c.admin_reply)}</div>` : ''}
        <textarea id="rp-${c.id}" maxlength="1000" placeholder="اكتب الرد" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:10px;margin-top:6px">${e(c.admin_reply || '')}</textarea>
        <div class="row">
          <button data-reply="${c.id}">حفظ الرد</button>
          ${c.status !== 'closed' ? `<button class="sec" data-close="${c.id}">إغلاق</button>` : ''}
        </div></div>`).join('') || '<p class="muted">لا توجد شكاوى</p>'}
    </div>`;
  }

  // ---------- التقييمات ----------
  function reviewsHtml(reviews, lname) {
    return `<div class="card"><h2>التقييمات</h2>
      ${reviews.map(r => `<div class="row" style="border-bottom:1px solid #eee;padding:6px 0">
        <span><b>${e(lname[r.line_id] || 'خط')}</b> · ★${r.stars} · <span class="muted">${e(r.period)}</span>
          ${r.comment ? `<br>${e(r.comment)}` : ''}${r.hidden ? ' <span class="err">(مخفي)</span>' : ''}</span>
        <button class="${r.hidden ? '' : 'sec'}" data-rv="${r.id}" data-hide="${r.hidden ? 0 : 1}">${r.hidden ? 'إظهار' : 'إخفاء'}</button>
      </div>`).join('') || '<p class="muted">لا توجد تقييمات</p>'}</div>`;
  }

  // ---------- سجل التدقيق ----------
  function summarize(a) {
    const o = a.details?.old || {}, n = a.details?.new || {};
    if (a.table_name === 'settings') return `${e(n.key)}: ${e(o.value ?? '—')} ← ${e(n.value ?? '—')}`;
    if (a.table_name === 'subscriptions') return `تاريخ الاستحقاق: ${n.end_date ? dt(n.end_date) : '—'}`;
    if (a.table_name === 'activation_codes') return `كود لمدة ${e(n.months ?? '')} شهر${n.amount ? ' · ' + money(n.amount) : ''}`;
    if (a.table_name === 'blocked_phones') return `سبب الحظر: ${e(n.reason ?? o.reason ?? '')}`;
    if (a.table_name === 'owner_details') return `${e(a.details?.from ?? '')} ← ${e(a.details?.to ?? '')}${a.details?.reason ? ' (' + e(a.details.reason) + ')' : ''}`;
    return e(JSON.stringify(n || o).slice(0, 160));
  }
  function auditHtml(audit) {
    return `<div class="card"><h2>سجل التدقيق (آخر 150 عملية)</h2>
      <p class="muted">يسجّل كل تغيير على الأسعار والاشتراكات والأكواد والحظر والموافقات، ولا يمكن تعديله أو حذفه.</p>
      ${audit.map(a => `<div class="row" style="border-bottom:1px solid #eee;padding:6px 0">
        <span><b>${ACT[a.action] || e(a.action)}</b> · ${e(a.table_name)}<br><span class="muted">${summarize(a)}</span></span>
        <span class="muted">${dtt(a.created_at)}</span></div>`).join('') || '<p class="muted">لا توجد عمليات</p>'}</div>`;
  }

  // ---------- التحميل والأحداث ----------
  window.loadExtra = async function (container) {
    const [profiles, subs, codes, dlog, complaints, reviews, lines, audit, prices] = await Promise.all([
      sb.from('profiles').select('id,role,name,phone,created_at,first_paid_at'),
      sb.from('subscriptions').select('owner_id,end_date'),
      sb.from('activation_codes').select('months,amount,kind,used_at'),
      sb.from('deletion_log').select('deleted_at'),
      sb.from('complaints').select('*').order('created_at', { ascending: false }).limit(200),
      sb.from('reviews').select('id,line_id,stars,comment,period,hidden,created_at').order('created_at', { ascending: false }).limit(100),
      sb.from('lines').select('id,name'),
      sb.from('audit_log').select('*').order('created_at', { ascending: false }).limit(150),
      sb.from('settings').select('value').eq('key', 'price_renewal').single()
    ]);
    const data = {
      profiles: profiles.data || [], subs: subs.data || [], codes: codes.data || [],
      dlog: dlog.data || [], priceRenewal: +prices.data?.value || 0
    };
    const lname = Object.fromEntries((lines.data || []).map(l => [l.id, l.name]));
    const offset = container.dataset.mo ? +container.dataset.mo : 0;

    container.insertAdjacentHTML('beforeend',
      reportsHtml(data, offset) +
      complaintsHtml(complaints.data || []) +
      reviewsHtml(reviews.data || [], lname) +
      auditHtml(audit.data || []));

    container.querySelectorAll('button[data-mo]').forEach(b => b.onclick = () => {
      container.dataset.mo = b.dataset.mo; window.load();
    });
    container.querySelectorAll('button[data-reply]').forEach(b => b.onclick = async () => {
      const txt = document.getElementById('rp-' + b.dataset.reply).value.trim();
      if (!txt) return alert('اكتب الرد أولاً');
      const { error } = await sb.from('complaints').update({ admin_reply: txt }).eq('id', b.dataset.reply);
      if (error) alert('تعذر حفظ الرد'); else window.load();
    });
    container.querySelectorAll('button[data-close]').forEach(b => b.onclick = async () => {
      await sb.from('complaints').update({ status: 'closed' }).eq('id', b.dataset.close); window.load();
    });
    container.querySelectorAll('button[data-rv]').forEach(b => b.onclick = async () => {
      const { error } = await sb.from('reviews').update({ hidden: b.dataset.hide === '1' }).eq('id', b.dataset.rv);
      if (error) alert('تعذر التحديث'); else window.load();
    });
  };
})();

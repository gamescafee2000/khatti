// قائمة المحافظات العراقية (تطابق جدول governorates في قاعدة البيانات)
window.GOVS = ['بغداد', 'البصرة', 'نينوى', 'أربيل', 'السليمانية', 'دهوك', 'كركوك', 'ديالى', 'الأنبار',
  'بابل', 'كربلاء', 'واسط', 'صلاح الدين', 'النجف', 'القادسية', 'المثنى', 'ذي قار', 'ميسان'];

window.govOptions = (selected = '', placeholder = 'اختر المحافظة') =>
  `<option value="">${placeholder}</option>` +
  window.GOVS.map(g => `<option value="${g}" ${g === selected ? 'selected' : ''}>${g}</option>`).join('');

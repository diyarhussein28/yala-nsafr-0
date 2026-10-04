/* Yala Nsafr admin panel — Alpine.js application. All user-supplied data is rendered
 * with x-text (never x-html); the only x-html usage is for the static icon set below. */

const API = window.location.origin + '/api/v1';

// Chart instances live outside Alpine's reactive state: wrapping them in Alpine's proxy
// breaks Chart.js's internal canvas handling (its draw calls then hit a null context).
const CHARTS = {};

const ICONS = {
  dashboard: '<path d="M3 13h8V3H3zM13 21h8v-8h-8zM3 21h8v-6H3zM13 3v8h8V3z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  gavel: '<path d="m14 13-7.5 7.5a2.12 2.12 0 0 1-3-3L11 10"/><path d="m16 16 6-6M8 8l6-6M9 7l8 8M21 11l-8-8"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  siren: '<path d="M7 18v-6a5 5 0 1 1 10 0v6"/><path d="M5 21a1 1 0 0 1-1-1v-1a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1zM21 12h1M18.5 4.5 18 5M2 12h1M12 2v1M4.93 4.93l.71.71"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
  car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18M7 6h1v4M16.71 13.88l.7.71-2.82 2.82"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  map: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
};
function svg(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}

const fmt = {
  money(v) {
    const n = Number(v || 0);
    return n.toLocaleString('ar-EG', { maximumFractionDigits: 2 }) + ' ج.م';
  },
  num(v) { return Number(v || 0).toLocaleString('ar-EG'); },
  date(v) {
    if (!v) return '—';
    return new Date(v).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  },
  day(v) {
    if (!v) return '—';
    return new Date(v).toLocaleDateString('ar-EG', { timeZone: 'Africa/Cairo', day: 'numeric', month: 'short', year: 'numeric' });
  },
  ago(v) {
    if (!v) return '';
    const m = Math.round((Date.now() - new Date(v).getTime()) / 60000);
    if (m < 1) return 'الآن';
    if (m < 60) return `منذ ${m} د`;
    const h = Math.round(m / 60);
    if (h < 24) return `منذ ${h} س`;
    return `منذ ${Math.round(h / 24)} يوم`;
  },
  initial(name) { return (name || '؟').trim().charAt(0) || '؟'; },
};

const LABELS = {
  role: { passenger: 'راكب', driver: 'سائق', both: 'راكب وسائق', admin: 'مشرف' },
  userStatus: {
    pending_verification: ['بانتظار الإكمال', 'tone-accent'], active: ['نشط', 'tone-success'],
    suspended: ['موقوف', 'tone-accent'], banned: ['محظور', 'tone-danger'],
  },
  tripStatus: {
    scheduled: ['مجدولة', 'tone-info'], active: ['جارية', 'tone-success'],
    completed: ['مكتملة', 'tone-brand'], cancelled: ['ملغاة', 'tone-danger'],
  },
  bookingStatus: {
    pending_payment: ['بانتظار الدفع', 'tone-accent'], pending_driver_approval: ['بانتظار السائق', 'tone-accent'],
    confirmed: ['مؤكد', 'tone-success'], in_progress: ['جاري', 'tone-info'], trip_completed: ['مكتمل', 'tone-brand'],
    cancelled_by_passenger: ['ألغاه الراكب', 'tone-muted'], cancelled_by_driver: ['ألغاه السائق', 'tone-danger'],
    disputed: ['نزاع', 'tone-pink'], refunded: ['مسترد', 'tone-muted'],
  },
  paymentStatus: {
    pending: ['محجوز (لم يُخصم)', 'tone-accent'], captured: ['مُحصّل', 'tone-success'], released: ['مُلغى الحجز', 'tone-muted'],
    refunded: ['مسترد', 'tone-muted'], partially_refunded: ['استرداد جزئي', 'tone-info'], failed: ['فشل', 'tone-danger'],
  },
  disputeStatus: {
    open: ['مفتوح', 'tone-danger'], under_review: ['قيد المراجعة', 'tone-accent'], resolved_refund: ['استرداد للراكب', 'tone-success'],
    resolved_release: ['صرف للسائق', 'tone-success'], resolved_split: ['تقسيم', 'tone-success'], closed: ['مغلق', 'tone-muted'],
  },
  disputeReason: {
    no_show_driver: 'السائق لم يحضر', no_show_passenger: 'الراكب لم يحضر', unsafe_driving: 'قيادة غير آمنة',
    wrong_route: 'طريق خاطئ', payment_mismatch: 'خلاف على المبلغ', harassment: 'تحرش أو إزعاج', other: 'أخرى',
  },
  withdrawalStatus: { pending: ['قيد التنفيذ', 'tone-accent'], paid: ['تم التحويل', 'tone-success'], rejected: ['مرفوض/فشل', 'tone-danger'] },
  payout: { vodafone_cash: 'فودافون كاش', instapay: 'إنستاباي', bank: 'تحويل بنكي' },
  ledger: { cancellation_compensation: 'تعويض إلغاء', cash_commission_payment: 'سداد عمولة كاش', adjustment: 'تسوية إدارية' },
  audit: {
    'user.status': 'تغيير حالة مستخدم', 'user.verify_id.approve': 'قبول توثيق هوية', 'user.verify_id.reject': 'رفض توثيق هوية',
    'user.verify_driver.approve': 'قبول توثيق سائق', 'user.verify_driver.reject': 'رفض توثيق سائق',
    'dispute.assign': 'استلام نزاع', 'dispute.resolve': 'البت في نزاع', 'dispute.notify': 'رسالة لطرف نزاع',
    'config.update': 'تعديل الإعدادات', 'withdrawal.settle': 'تسوية طلب سحب', 'driver.ledger.add': 'قيد على رصيد سائق', 'sos.resolve': 'إغلاق تنبيه طوارئ',
  },
};

// Platform settings shown on the config page: key → [label, hint, unit, camelCase DTO field, step]
const CONFIG_GROUPS = [
  ['العمولة والاشتراك', [
    ['commission_rate', 'نسبة عمولة المنصة', 'من 0 إلى 0.5 — مثال 0.10 = 10%', 'نسبة', 'commissionRate', '0.01'],
    ['subscription_price_egp', 'سعر اشتراك السائق', '0 = لا يلزم اشتراك لنشر الرحلات', 'ج.م', 'subscriptionPriceEgp', '1'],
    ['subscription_period_days', 'مدة الاشتراك', 'عدد الأيام التي يغطيها الدفع الواحد', 'يوم', 'subscriptionPeriodDays', '1'],
    ['cash_commission_limit_egp', 'حد عمولة الكاش غير المسددة', 'فوقه لا يستطيع السائق نشر رحلات حتى يسدد', 'ج.م', 'cashCommissionLimitEgp', '1'],
  ]],
  ['سياسة الإلغاء', [
    ['free_cancel_hours', 'الإلغاء المجاني قبل', 'استرداد كامل إذا ألغى الراكب قبل هذه المدة من الانطلاق', 'ساعة', 'freeCancelHours', '1'],
    ['late_cancel_hours', 'لا استرداد بعد', 'أقل من هذه المدة قبل الانطلاق لا يُسترد شيء', 'ساعة', 'lateCancelHours', '1'],
    ['late_cancel_fee_pct', 'رسوم الإلغاء المتأخر', 'نسبة من المبلغ — مثال 0.15 = 15%', 'نسبة', 'lateCancelFeePct', '0.01'],
    ['driver_compensation_pct', 'تعويض السائق', 'نسبة من المبلغ تُضاف لرصيد السائق عند الإلغاء المتأخر', 'نسبة', 'driverCompensationPct', '0.01'],
  ]],
  ['النزاعات والتقييمات', [
    ['dispute_window_hours', 'مهلة فتح النزاع', 'بعد انتهاء الرحلة — وأيضاً مدة تعليق أرباح السائق', 'ساعة', 'disputeWindowHours', '1'],
    ['dispute_sla_hours', 'مهلة رد الطرف الآخر', 'بعدها يُبت آلياً أو يحوّل للإدارة', 'ساعة', 'disputeSlaHours', '1'],
    ['auto_confirm_hours', 'التأكيد التلقائي للاكتمال', 'ساعات بعد موعد الانطلاق', 'ساعة', 'autoConfirmHours', '1'],
    ['rating_reveal_days', 'كشف التقييم المخفي بعد', 'إن لم يقيّم الطرف الآخر', 'يوم', 'ratingRevealDays', '1'],
    ['low_rating_threshold', 'حد التقييم المنخفض', 'متوسط أقل منه يضع علامة مراجعة على الحساب', 'من 5', 'lowRatingThreshold', '0.1'],
    ['min_ratings_for_flag', 'أقل عدد تقييمات للعلامة', 'قبل تطبيق حد التقييم المنخفض', 'تقييم', 'minRatingsForFlag', '1'],
  ]],
];

function admin() {
  return {
    svg, fmt, LABELS, CONFIG_GROUPS,
    // session
    authenticated: false, booting: true, me: null, token: null,
    phone: '', otp: '', otpSent: false, authBusy: false, authErr: '',
    // shell
    page: 'dashboard', navOpen: false, theme: 'light', toasts: [], lightbox: null,
    // data
    analytics: null, series: [], seriesDays: 30, commission: null,
    users: { rows: [], total: 0, page: 1, limit: 20, loading: false },
    uq: { search: '', status: '', role: '', pending: '' },
    trips: { rows: [], total: 0, page: 1, limit: 20, loading: false }, tq: { status: '' },
    disputes: { rows: [], total: 0, page: 1, limit: 20, loading: false }, dq: { status: 'open' },
    withdrawals: { rows: [], loading: false }, wq: { status: 'pending' },
    sos: { rows: [], loading: false },
    audit: { rows: [], total: 0, page: 1, limit: 50, loading: false },
    config: {}, configDraft: {}, configBusy: false,
    queue: { id: [], driver: [], loading: false },
    // drawers
    drawer: null, // 'user' | 'trip' | 'dispute' | 'withdrawal'
    sel: null, selBusy: false, ledger: null,
    resolve: { resolution: 'resolved_refund', refundAmount: '', resolutionNotes: '', blockUserId: '', blockStatus: '' },
    notify: { target: 'both', message: '' },
    adjust: { type: 'adjustment', amount: '', note: '' },
    settle: { note: '' },
    globalQ: '', globalResults: null,

    get pageTitle() {
      return {
        dashboard: 'نظرة عامة', verify: 'طابور التوثيق', users: 'المستخدمون', trips: 'الرحلات', disputes: 'النزاعات',
        withdrawals: 'السحوبات', sos: 'تنبيهات الطوارئ', config: 'إعدادات المنصة', audit: 'سجل العمليات',
      }[this.page];
    },
    get nav() {
      const a = this.analytics;
      return [
        { label: 'التشغيل', items: [
          { id: 'dashboard', icon: 'dashboard', title: 'نظرة عامة' },
          { id: 'verify', icon: 'shield', title: 'طابور التوثيق', badge: a ? a.users.pendingIdVerifications + a.users.pendingDriverVerifications : 0 },
          { id: 'disputes', icon: 'gavel', title: 'النزاعات', badge: a ? a.disputes.open : 0 },
          { id: 'sos', icon: 'siren', title: 'الطوارئ', badge: this.sos.rows.length },
        ] },
        { label: 'البيانات', items: [
          { id: 'users', icon: 'users', title: 'المستخدمون' },
          { id: 'trips', icon: 'route', title: 'الرحلات' },
          { id: 'withdrawals', icon: 'wallet', title: 'السحوبات' },
        ] },
        { label: 'الإدارة', items: [
          { id: 'config', icon: 'settings', title: 'الإعدادات' },
          { id: 'audit', icon: 'history', title: 'سجل العمليات' },
        ] },
      ];
    },

    // ── Boot & auth ───────────────────────────────────────────────────────
    async init() {
      this.theme = this.store('ya_admin_theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      document.documentElement.dataset.theme = this.theme;
      this.token = this.store('ya_admin_token');
      if (this.token) {
        try {
          await this.loadMe();
          this.authenticated = true;
          this.afterLogin();
        } catch (e) {
          if (e.status === 401 || e.status === 403) this.clearSession();
        }
      }
      this.booting = false;
      window.addEventListener('hashchange', () => this.fromHash());
    },
    store(k, v) {
      try {
        if (v === undefined) return localStorage.getItem(k);
        if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
      } catch (_) { return null; }
    },
    toggleTheme() {
      this.theme = this.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = this.theme;
      this.store('ya_admin_theme', this.theme);
      this.$nextTick(() => this.drawCharts());
    },
    async loadMe() {
      const me = await this.api('GET', '/users/me');
      if (me.role !== 'admin') { const e = new Error('هذا الحساب ليس له صلاحيات الإدارة'); e.status = 403; throw e; }
      this.me = me;
    },
    async sendOtp() {
      this.authErr = ''; this.authBusy = true;
      try {
        let p = this.phone.replace(/[\s-]/g, '');
        if (p.startsWith('0')) p = '+20' + p.slice(1);
        if (!p.startsWith('+')) p = '+20' + p;
        this.phone = p;
        await this.api('POST', '/auth/otp/send', { phoneNumber: p });
        this.otpSent = true;
      } catch (e) { this.authErr = e.message; } finally { this.authBusy = false; }
    },
    async verifyOtp() {
      this.authErr = ''; this.authBusy = true;
      try {
        const res = await this.api('POST', '/auth/otp/verify', { phoneNumber: this.phone, code: this.otp.trim() });
        this.token = res.accessToken;
        this.store('ya_admin_token', res.accessToken);
        this.store('ya_admin_refresh', res.refreshToken);
        await this.loadMe();
        this.authenticated = true;
        this.afterLogin();
      } catch (e) {
        this.authErr = e.message;
        this.clearSession();
      } finally { this.authBusy = false; }
    },
    afterLogin() {
      this.fromHash();
      this.refreshCounters();
      clearInterval(this._poll);
      // Emergencies and new disputes should surface without a manual refresh
      this._poll = setInterval(() => this.refreshCounters(), 60000);
    },
    async refreshCounters() {
      try { this.analytics = await this.api('GET', '/admin/analytics'); } catch (_) {}
      try { this.sos.rows = await this.api('GET', '/trips/sos/pending'); } catch (_) {}
    },
    clearSession() {
      this.token = null; this.me = null; this.authenticated = false;
      this.store('ya_admin_token', null); this.store('ya_admin_refresh', null);
    },
    logout() {
      const rt = this.store('ya_admin_refresh');
      if (rt) fetch(API + '/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) }).catch(() => {});
      clearInterval(this._poll);
      this.clearSession(); this.otpSent = false; this.otp = '';
    },
    async refreshSession() {
      const rt = this.store('ya_admin_refresh');
      if (!rt) return false;
      try {
        const res = await fetch(API + '/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) });
        if (!res.ok) return false;
        const d = await res.json();
        this.token = d.accessToken;
        this.store('ya_admin_token', d.accessToken); this.store('ya_admin_refresh', d.refreshToken);
        return true;
      } catch (_) { return false; }
    },
    async api(method, path, body, retried) {
      const headers = { 'Content-Type': 'application/json' };
      if (this.token) headers.Authorization = 'Bearer ' + this.token;
      const res = await fetch(API + path, { method, headers, body: body != null ? JSON.stringify(body) : undefined });
      if (res.status === 401 && !retried && !path.startsWith('/auth/') && await this.refreshSession()) {
        return this.api(method, path, body, true);
      }
      let data = null;
      try { data = await res.json(); } catch (_) { data = null; }
      if (!res.ok) {
        const msg = data && data.message ? (Array.isArray(data.message) ? data.message.join('، ') : data.message) : 'خطأ ' + res.status;
        const e = new Error(msg); e.status = res.status;
        if (res.status === 401) { this.clearSession(); }
        throw e;
      }
      return data;
    },
    toast(msg, ok = true) {
      const t = { id: Math.random(), msg, ok };
      this.toasts.push(t);
      setTimeout(() => { this.toasts = this.toasts.filter((x) => x.id !== t.id); }, 4200);
    },

    // ── Navigation ────────────────────────────────────────────────────────
    fromHash() {
      const p = (location.hash || '#dashboard').slice(1).split('?')[0];
      this.open(this.pageTitleFor(p) ? p : 'dashboard', false);
    },
    pageTitleFor(p) { return ['dashboard', 'verify', 'users', 'trips', 'disputes', 'withdrawals', 'sos', 'config', 'audit'].includes(p); },
    open(p, push = true) {
      this.page = p; this.navOpen = false; this.drawer = null;
      if (push && location.hash !== '#' + p) history.pushState(null, '', '#' + p);
      ({
        dashboard: () => this.loadDashboard(), verify: () => this.loadQueue(), users: () => this.loadUsers(1),
        trips: () => this.loadTrips(1), disputes: () => this.loadDisputes(1), withdrawals: () => this.loadWithdrawals(),
        sos: () => this.loadSos(), config: () => this.loadConfig(), audit: () => this.loadAudit(1),
      })[p]?.();
    },

    // ── Dashboard ─────────────────────────────────────────────────────────
    async loadDashboard() {
      await this.refreshCounters();
      try { this.commission = await this.api('GET', '/admin/earnings/commission'); } catch (_) {}
      await this.loadSeries();
    },
    async loadSeries() {
      try { this.series = await this.api('GET', '/admin/analytics/timeseries?days=' + this.seriesDays); } catch (e) { this.toast(e.message, false); }
      this.$nextTick(() => this.drawCharts());
    },
    seriesSum(k) { return this.series.reduce((s, r) => s + Number(r[k] || 0), 0); },
    drawCharts() {
      if (!window.Chart || this.page !== 'dashboard' || !this.series.length) return;
      const css = getComputedStyle(document.documentElement);
      const c = (v) => css.getPropertyValue(v).trim();
      const labels = this.series.map((r) => new Date(r.day + 'T12:00:00').toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }));
      const base = {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { rtl: true, bodyFont: { family: 'Cairo' }, titleFont: { family: 'Cairo' } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: c('--text-3'), font: { family: 'Cairo' }, maxRotation: 0, autoSkipPadding: 14 } },
          y: { beginAtZero: true, grid: { color: c('--border') }, ticks: { color: c('--text-3'), font: { family: 'Cairo' }, precision: 0 } },
        },
      };
      const make = (id, cfg) => {
        const el = document.getElementById(id);
        if (!el) return;
        CHARTS[id]?.destroy();
        CHARTS[id] = new Chart(el, cfg);
      };
      make('chartMoney', {
        type: 'line',
        data: { labels, datasets: [
          { label: 'قيمة الرحلات', data: this.series.map((r) => r.gmv), borderColor: c('--brand'), backgroundColor: c('--brand') + '22', fill: true, tension: .35, pointRadius: 0, borderWidth: 2.5 },
          { label: 'العمولة', data: this.series.map((r) => r.commission), borderColor: '#f2a516', backgroundColor: 'transparent', tension: .35, pointRadius: 0, borderWidth: 2.5 },
        ] },
        options: base,
      });
      make('chartActivity', {
        type: 'bar',
        data: { labels, datasets: [
          { label: 'حجوزات', data: this.series.map((r) => r.bookings), backgroundColor: c('--brand'), borderRadius: 4, maxBarThickness: 14 },
          { label: 'رحلات مكتملة', data: this.series.map((r) => r.tripsCompleted), backgroundColor: '#2563eb', borderRadius: 4, maxBarThickness: 14 },
          { label: 'مستخدمون جدد', data: this.series.map((r) => r.newUsers), backgroundColor: '#f2a516', borderRadius: 4, maxBarThickness: 14 },
        ] },
        options: base,
      });
    },
    maxRoute() { return Math.max(1, ...((this.analytics?.topRoutes) || []).map((r) => Number(r.tripCount))); },

    async globalSearch() {
      const q = this.globalQ.trim();
      if (q.length < 2) { this.globalResults = null; return; }
      try { this.globalResults = await this.api('GET', '/admin/search?q=' + encodeURIComponent(q)); } catch (e) { this.toast(e.message, false); }
    },

    // ── Verification queue ────────────────────────────────────────────────
    async loadQueue() {
      this.queue.loading = true;
      try {
        const [id, drv] = await Promise.all([
          this.api('GET', '/admin/users?pendingVerification=id&limit=100'),
          this.api('GET', '/admin/users?pendingVerification=driver&limit=100'),
        ]);
        this.queue.id = id.data; this.queue.driver = drv.data;
      } catch (e) { this.toast(e.message, false); } finally { this.queue.loading = false; }
    },

    // ── Users ─────────────────────────────────────────────────────────────
    async loadUsers(page) {
      if (page) this.users.page = page;
      this.users.loading = true;
      try {
        const q = new URLSearchParams({ page: this.users.page, limit: this.users.limit });
        if (this.uq.search) q.set('search', this.uq.search);
        if (this.uq.status) q.set('status', this.uq.status);
        if (this.uq.role) q.set('role', this.uq.role);
        const r = await this.api('GET', '/admin/users?' + q);
        this.users.rows = r.data; this.users.total = r.total;
      } catch (e) { this.toast(e.message, false); } finally { this.users.loading = false; }
    },
    async openUser(id) {
      this.drawer = 'user'; this.sel = null; this.ledger = null;
      this.adjust = { type: 'adjustment', amount: '', note: '' };
      try {
        this.sel = await this.api('GET', '/admin/users/' + id);
        if (['driver', 'both'].includes(this.sel.role) || this.sel.driverVerified) {
          this.ledger = await this.api('GET', '/admin/drivers/' + id + '/ledger');
        }
      } catch (e) { this.toast(e.message, false); this.drawer = null; }
    },
    async userAction(path, msg, body) {
      if (!this.sel) return;
      this.selBusy = true;
      try {
        await this.api(body?.method || 'POST', '/admin/users/' + this.sel.id + path, body?.data);
        this.toast(msg);
        await this.openUser(this.sel.id);
        this.refreshCounters();
        if (this.page === 'verify') this.loadQueue(); else if (this.page === 'users') this.loadUsers();
      } catch (e) { this.toast(e.message, false); } finally { this.selBusy = false; }
    },
    setStatus(status) {
      const words = { active: 'تفعيل', suspended: 'إيقاف', banned: 'حظر' };
      if (status !== 'active' && !confirm(`تأكيد ${words[status]} الحساب؟ سيتم إنهاء جلساته الحالية.`)) return;
      this.userAction('/status', 'تم تحديث حالة الحساب', { method: 'PATCH', data: { status } });
    },
    async addLedger() {
      const amount = Number(this.adjust.amount);
      if (!amount || this.adjust.note.trim().length < 5) { this.toast('أدخل المبلغ وسبباً واضحاً (5 أحرف على الأقل)', false); return; }
      this.selBusy = true;
      try {
        await this.api('POST', '/admin/drivers/' + this.sel.id + '/ledger', { type: this.adjust.type, amount, note: this.adjust.note.trim() });
        this.toast('تم تسجيل القيد');
        this.ledger = await this.api('GET', '/admin/drivers/' + this.sel.id + '/ledger');
        this.adjust = { type: 'adjustment', amount: '', note: '' };
      } catch (e) { this.toast(e.message, false); } finally { this.selBusy = false; }
    },
    docs(u) {
      return [
        ['البطاقة — أمامي', u.nationalIdPhotoUrl],
        ['البطاقة — خلفي', u.nationalIdBackPhotoUrl],
        ['رخصة القيادة', u.drivingLicencePhotoUrl],
        ['صورة السيارة', u.vehiclePhotoUrl],
      ];
    },

    // ── Trips ─────────────────────────────────────────────────────────────
    async loadTrips(page) {
      if (page) this.trips.page = page;
      this.trips.loading = true;
      try {
        const q = new URLSearchParams({ page: this.trips.page, limit: this.trips.limit });
        if (this.tq.status) q.set('status', this.tq.status);
        const r = await this.api('GET', '/admin/trips?' + q);
        this.trips.rows = r.data; this.trips.total = r.total;
      } catch (e) { this.toast(e.message, false); } finally { this.trips.loading = false; }
    },
    async openTrip(id) {
      this.drawer = 'trip'; this.sel = null;
      try { this.sel = await this.api('GET', '/admin/trips/' + id); } catch (e) { this.toast(e.message, false); this.drawer = null; }
    },

    // ── Disputes ──────────────────────────────────────────────────────────
    async loadDisputes(page) {
      if (page) this.disputes.page = page;
      this.disputes.loading = true;
      try {
        const q = new URLSearchParams({ page: this.disputes.page, limit: this.disputes.limit });
        if (this.dq.status) q.set('status', this.dq.status);
        const r = await this.api('GET', '/admin/disputes?' + q);
        this.disputes.rows = r.data; this.disputes.total = r.total;
      } catch (e) { this.toast(e.message, false); } finally { this.disputes.loading = false; }
    },
    async openDispute(id) {
      this.drawer = 'dispute'; this.sel = null;
      this.resolve = { resolution: 'resolved_refund', refundAmount: '', resolutionNotes: '', blockUserId: '', blockStatus: '' };
      this.notify = { target: 'both', message: '' };
      try { this.sel = await this.api('GET', '/admin/disputes/' + id); } catch (e) { this.toast(e.message, false); this.drawer = null; }
    },
    slaLeft(d) {
      if (!d?.slaDeadline) return null;
      const h = (new Date(d.slaDeadline).getTime() - Date.now()) / 3600000;
      return h;
    },
    async assignDispute() {
      this.selBusy = true;
      try {
        await this.api('POST', '/admin/disputes/' + this.sel.dispute.id + '/assign');
        this.toast('تم استلام النزاع للمراجعة');
        await this.openDispute(this.sel.dispute.id); this.loadDisputes();
      } catch (e) { this.toast(e.message, false); } finally { this.selBusy = false; }
    },
    async submitResolution() {
      const r = this.resolve;
      if (r.resolutionNotes.trim().length < 5) { this.toast('اكتب سبب القرار', false); return; }
      const body = { resolution: r.resolution, resolutionNotes: r.resolutionNotes.trim() };
      if (r.resolution === 'resolved_split') body.refundAmount = Number(r.refundAmount);
      if (r.blockUserId && r.blockStatus) { body.blockUserId = r.blockUserId; body.blockStatus = r.blockStatus; }
      if (!confirm('تأكيد القرار؟ سيتم تنفيذ الاسترداد أو التحصيل عبر Kashier فوراً.')) return;
      this.selBusy = true;
      try {
        await this.api('POST', '/admin/disputes/' + this.sel.dispute.id + '/resolve', body);
        this.toast('تم البت في النزاع');
        await this.openDispute(this.sel.dispute.id); this.loadDisputes(); this.refreshCounters();
      } catch (e) { this.toast(e.message, false); } finally { this.selBusy = false; }
    },
    async sendNotify() {
      if (this.notify.message.trim().length < 5) return;
      this.selBusy = true;
      try {
        await this.api('POST', '/admin/disputes/' + this.sel.dispute.id + '/notify', { target: this.notify.target, message: this.notify.message.trim() });
        this.toast('تم إرسال الرسالة'); this.notify.message = '';
      } catch (e) { this.toast(e.message, false); } finally { this.selBusy = false; }
    },

    // ── Withdrawals ───────────────────────────────────────────────────────
    async loadWithdrawals() {
      this.withdrawals.loading = true;
      try { this.withdrawals.rows = await this.api('GET', '/admin/withdrawals?status=' + this.wq.status); } catch (e) { this.toast(e.message, false); } finally { this.withdrawals.loading = false; }
    },
    async settleWithdrawal(w, action) {
      const note = action === 'reject' ? prompt('سبب الرفض (يظهر للسائق):') : '';
      if (action === 'reject' && note === null) return;
      if (action === 'pay' && !confirm(`تأكيد أن مبلغ ${fmt.money(w.amount)} تم تحويله للسائق يدوياً؟`)) return;
      try {
        await this.api('PATCH', '/admin/withdrawals/' + w.id, { action, adminNote: note || undefined });
        this.toast(action === 'pay' ? 'تم تأكيد التحويل' : 'تم رفض الطلب وإرجاع المبلغ لرصيد السائق');
        this.loadWithdrawals();
      } catch (e) { this.toast(e.message, false); }
    },

    // ── SOS ───────────────────────────────────────────────────────────────
    async loadSos() {
      this.sos.loading = true;
      try { this.sos.rows = await this.api('GET', '/trips/sos/pending'); } catch (e) { this.toast(e.message, false); } finally { this.sos.loading = false; }
    },
    async resolveSos(a) {
      if (!confirm('تأكيد إغلاق تنبيه الطوارئ بعد التواصل مع المستخدم؟')) return;
      try { await this.api('PATCH', '/trips/sos/' + a.id + '/resolve'); this.toast('تم إغلاق التنبيه'); this.loadSos(); } catch (e) { this.toast(e.message, false); }
    },

    // ── Config ────────────────────────────────────────────────────────────
    async loadConfig() {
      try { this.config = await this.api('GET', '/admin/config'); this.configDraft = { ...this.config }; } catch (e) { this.toast(e.message, false); }
    },
    configDirty() { return Object.keys(this.configDraft).some((k) => String(this.configDraft[k]) !== String(this.config[k])); },
    async saveConfig() {
      const dto = {};
      for (const [, rows] of CONFIG_GROUPS) {
        for (const [key, , , , field] of rows) {
          if (String(this.configDraft[key]) !== String(this.config[key])) dto[field] = Number(this.configDraft[key]);
        }
      }
      if (!Object.keys(dto).length) return;
      this.configBusy = true;
      try { this.config = await this.api('PATCH', '/admin/config', dto); this.configDraft = { ...this.config }; this.toast('تم حفظ الإعدادات'); } catch (e) { this.toast(e.message, false); } finally { this.configBusy = false; }
    },

    // ── Audit ─────────────────────────────────────────────────────────────
    async loadAudit(page) {
      if (page) this.audit.page = page;
      this.audit.loading = true;
      try { const r = await this.api('GET', '/admin/audit-log?page=' + this.audit.page); this.audit.rows = r.data; this.audit.total = r.total; } catch (e) { this.toast(e.message, false); } finally { this.audit.loading = false; }
    },
    auditDetails(d) {
      if (!d) return '';
      return Object.entries(d).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ');
    },

    pages(t) { return Math.max(1, Math.ceil(t.total / t.limit)); },
    label(map, key) { return (LABELS[map][key] || [key, 'tone-muted'])[0]; },
    tone(map, key) { return (LABELS[map][key] || [key, 'tone-muted'])[1]; },
  };
}

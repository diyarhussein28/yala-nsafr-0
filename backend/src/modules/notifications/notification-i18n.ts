/**
 * English versions of the push notifications, for users whose preferredLanguage is 'en'.
 *
 * Notifications are written in Arabic where they are sent. Rather than threading a
 * language through every call site, each Arabic text is listed here as a template —
 * `{0}`, `{1}` stand for the parts filled in at runtime — next to its English version.
 * A sent text is matched against the templates, and the captured parts are translated
 * too (city names, nested phrases, Arabic-Indic digits). Anything unmatched (an admin's
 * free-text broadcast, a chat message) is sent as written. Keep two placeholders from
 * touching ("{1}{2}") — the split between them would be ambiguous.
 */

const TEMPLATES: Array<[string, string]> = [
  // Bookings
  ['طلب حجز جديد 🎉', 'New booking request 🎉'],
  ['طلب حجز جديد', 'New booking request'],
  ['راكب دفع {0} ج وينتظر موافقتك', 'A passenger paid EGP {0} and is waiting for your approval'],
  ['لديك طلب حجز جديد على رحلتك من {0} إلى {1} — لديك 30 دقيقة للرد', 'New booking request for your trip from {0} to {1} — you have 30 minutes to respond'],
  ['تمت الموافقة على حجزك ✅', 'Your booking is approved ✅'],
  ['تمت الموافقة على حجزك في رحلة {0} إلى {1}', 'Your booking on the {0} to {1} trip is approved'],
  ['طلب الحجز مرفوض', 'Booking request declined'],
  ['عذراً، رفض السائق طلب حجزك', 'Sorry, the driver declined your booking request'],
  ['انتهت مهلة الموافقة', 'Approval time ran out'],
  ['انتهت مهلة الموافقة على حجزك', 'The driver didn’t respond to your booking in time'],
  ['انتهت مهلة الدفع', 'Payment time ran out'],
  ['لم يكتمل الدفع في الوقت المحدد فتم إلغاء الحجز. يمكنك الحجز مرة أخرى إن كانت المقاعد متاحة.', 'The payment wasn’t completed in time, so the booking was cancelled. You can book again if seats are still available.'],
  ['إلغاء حجز', 'Booking cancelled'],
  ['{0} ألغى حجز {1} مقعد{2}', '{0} cancelled their booking of {1} seat{2}'],
  ['{0} ألغى حجز {1} مقاعد{2}', '{0} cancelled their booking of {1} seats{2}'],
  [' وستحصل على {0} جنيه تعويضاً', ' — you will receive EGP {0} in compensation'],
  ['تحذير: إلغاء متأخر', 'Warning: late cancellation'],
  ['تحذير: لديك تحذير إلغاء متأخر', 'Warning: you have a late-cancellation strike'],
  ['تم فتح نزاع على رحلتك', 'A dispute was opened on your trip'],
  ['تم فتح نزاع على أحد حجوزاتك. يُرجى إرسال ردك خلال {0} ساعة.', 'A dispute was opened on one of your bookings. Please send your response within {0} hours.'],
  ['مكافأة الدعوة', 'Referral reward'],
  ['رفيقك أكمل أول رحلة — حصلت على {0} جنيه في رصيدك!', 'Your friend completed their first trip — EGP {0} has been added to your balance!'],

  // Trips
  ['🚗 رحلتك بدأت!', '🚗 Your trip has started!'],
  ['السائق بدأ رحلة {0}. تتبع موقعه من التطبيق.', 'The driver started the {0} trip. Follow their location in the app.'],
  ['اكتملت الرحلة ✅', 'Trip completed ✅'],
  ['تم إنهاء الرحلة بنجاح. يمكنك الآن تقييم التجربة.', 'The trip has ended. You can now rate your experience.'],
  ['تم إلغاء الرحلة', 'Trip cancelled'],
  ['رحلة {0} → {1} تم إلغاؤها من قِبل السائق. سيتم استرداد مبلغك كاملاً.', 'The driver cancelled the {0} → {1} trip. You will get a full refund.'],
  ['تغيّر موعد رحلتك ⏰', 'Your trip time changed ⏰'],
  ['غيّر السائق موعد رحلة {0} → {1}. راجع التفاصيل، ويمكنك الإلغاء إن لم يناسبك الموعد الجديد.', 'The driver changed the time of the {0} → {1} trip. Check the details — you can cancel if the new time doesn’t suit you.'],
  ['تعليق جديد على الرحلة', 'New comment on the trip'],
  ['تعليق جديد على رحلتك', 'New comment on your trip'],
  ['السائق: {0}', 'Driver: {0}'],
  ['رسالة من {0}', 'Message from {0}'],

  // Scheduler
  ['رحلتك تبدأ خلال 30 دقيقة 🚗', 'Your trip starts in 30 minutes 🚗'],
  ['رحلتك تبدأ خلال 30 دقيقة ⏰', 'Your trip starts in 30 minutes ⏰'],
  ['{0} — الساعة {1}. تأكد من جاهزيتك.', '{0} — at {1}. Make sure you’re ready.'],
  ['{0} — الساعة {1}. كن مستعداً.', '{0} — at {1}. Be ready.'],
  ['⚠️ لم تبدأ رحلتك بعد', '⚠️ Your trip hasn’t started yet'],
  ['رحلة {0} تأخرت. لديك 15 دقيقة لبدء الرحلة وإلا ستُلغى تلقائياً وتُسترد مبالغ الركاب.', 'The {0} trip is late. You have 15 minutes to start it, or it will be cancelled automatically and passengers refunded.'],
  ['تم إلغاء رحلتك تلقائياً', 'Your trip was cancelled automatically'],
  ['رحلة {0} أُلغيت لعدم البدء في الموعد. تجنب التكرار لأنه يؤثر على تقييمك.', 'The {0} trip was cancelled because it didn’t start on time. Repeated no-shows affect your standing.'],
  ['إلغاء تلقائي — لم يبدأ السائق الرحلة', 'Cancelled automatically — the driver didn’t start the trip'],
  ['رحلة {0} لم تنطلق في موعدها. سيتم استرداد مبلغك كاملاً خلال 24 ساعة.', 'The {0} trip didn’t leave on time. You will get a full refund within 24 hours.'],

  // Driver strikes
  ['🚫 تم تعليق حسابك', '🚫 Your account is suspended'],
  ['تم تعليق حسابك بشكل دائم بسبب الإلغاء المتكرر. تواصل مع الدعم.', 'Your account has been suspended for repeated cancellations. Please contact support.'],
  ['⚠️ تم تعليق نشر الرحلات 30 يوماً', '⚠️ Trip posting paused for 30 days'],
  ['بسبب الإلغاء المتكرر، لن تتمكن من نشر رحلات لمدة 30 يوماً.', 'Because of repeated cancellations, you can’t post trips for 30 days.'],
  ['⚠️ تم تعليق نشر الرحلات 7 أيام', '⚠️ Trip posting paused for 7 days'],
  ['هذه إنذار {0} — تم تعليق حقك في نشر رحلات لمدة 7 أيام.', 'This is strike {0} — you can’t post trips for 7 days.'],

  // SOS
  ['🚨 SOS — طوارئ', '🚨 SOS — emergency'],
  ['أحد ركابك طلب الطوارئ! تحقق من التطبيق فوراً.', 'One of your passengers triggered SOS! Check the app now.'],
  ['🚨 SOS في رحلة', '🚨 SOS on a trip'],
  ['تنبيه طوارئ من مستخدم في رحلة {0} ← {1}', 'Emergency alert from a user on the {0} → {1} trip'],

  // Earnings and payouts
  ['تحديث على رصيدك', 'Balance update'],
  ['تمت إضافة {0} جنيه: {1}', 'EGP {0} added: {1}'],
  ['تم خصم {0} جنيه: {1}', 'EGP {0} deducted: {1}'],
  ['جاري تحويل أرباحك', 'Your earnings are on the way'],
  ['جاري تحويل {0} جنيه إلى {1}. سنبلغك فور اكتمال التحويل.', 'Transferring EGP {0} to {1}. We’ll let you know when it arrives.'],
  ['فشل التحويل', 'Transfer failed'],
  ['تعذّر تحويل {0} جنيه تلقائياً. سيتواصل معك الفريق قريباً.', 'We couldn’t transfer EGP {0} automatically. Our team will contact you soon.'],
  ['تم تحويل أرباحك ✅', 'Your earnings were transferred ✅'],
  ['تم تحويل أرباحك', 'Your earnings were transferred'],
  ['فشل تحويل أرباحك', 'Earnings transfer failed'],
  ['تم تحويل {0} جنيه إلى {1} بنجاح', 'EGP {0} was transferred to {1}'],
  ['تم تحويل {0} جنيه إلى حسابك بنجاح ✅', 'EGP {0} was transferred to your account ✅'],
  ['تعذّر تحويل {0} جنيه. تم إرجاع المبلغ إلى رصيدك وسيتواصل معك الفريق.', 'We couldn’t transfer EGP {0}. The amount is back in your balance and our team will contact you.'],
  ['تعذّر تحويل {0} جنيه. تم إرجاع المبلغ إلى رصيدك.', 'We couldn’t transfer EGP {0}. The amount is back in your balance.'],
  ['تم رفض طلب السحب', 'Withdrawal request declined'],
  ['تم رفض طلب سحب {0} جنيه: {1}', 'Your withdrawal of EGP {0} was declined: {1}'],
  ['تم رفض طلب سحب {0} جنيه', 'Your withdrawal of EGP {0} was declined'],
  ['تم سداد العمولة ✅', 'Commission paid ✅'],
  ['تم استلام {0} جنيه سداداً لعمولة رحلات الكاش. شكراً لك!', 'We received EGP {0} for your cash-trip commission. Thank you!'],
  ['سداد عمولة رحلات الكاش عبر Kashier', 'Cash-trip commission paid via Kashier'],

  // Subscriptions
  ['تم تفعيل اشتراكك ✅', 'Your subscription is active ✅'],
  ['اشتراك يلا نسافر Pro نشط حتى {0}.', 'Yala Nsafr Pro is active until {0}.'],
  ['اشتراكك ينتهي قريباً', 'Your subscription ends soon'],
  ['جدّد اشتراك يلا نسافر Pro لتستمر في نشر الرحلات دون انقطاع.', 'Renew Yala Nsafr Pro to keep posting trips without interruption.'],

  // Disputes
  ['وصل رد على نزاعك', 'Your dispute got a response'],
  ['رد إضافي على نزاعك', 'New response on your dispute'],
  ['قدّم الطرف الآخر رده. سيراجع فريقنا وجهتي النظر قريباً.', 'The other party has responded. Our team will review both sides soon.'],
  ['أضاف الطرف الآخر تفاصيل جديدة إلى رده. سيراجع فريقنا كل ما تم تقديمه.', 'The other party added details to their response. Our team will review everything submitted.'],
  ['نزاعك قيد المراجعة', 'Your dispute is under review'],
  ['انتهى وقت الرد وتم تحويل نزاعك إلى الإدارة للبت فيه.', 'The response time is over and your dispute has gone to our team for a decision.'],
  ['تم تحويل النزاع إلى الإدارة لمراجعة رد الطرفين والبت فيه.', 'The dispute has gone to our team to review both responses and decide.'],
  ['تم البت في النزاع', 'Dispute resolved'],
  ['تم البت في النزاع تلقائياً', 'Dispute resolved automatically'],
  ['تم البت في النزاع.', 'The dispute has been resolved.'],
  ['تم البت في النزاع: استرداد المبلغ للراكب.', 'Dispute resolved: the passenger is refunded.'],
  ['تم البت في النزاع: صرف المبلغ للسائق.', 'Dispute resolved: the amount is released to the driver.'],
  ['تم البت في النزاع: استرداد {0} جنيه للراكب والباقي للسائق.', 'Dispute resolved: EGP {0} refunded to the passenger, the rest to the driver.'],
  ['تم استرداد المبلغ تلقائياً لعدم رد الطرف الآخر في الوقت المحدد.', 'Refunded automatically because the other party didn’t respond in time.'],
  ['تم صرف المبلغ للسائق تلقائياً لعدم رد الطرف الآخر.', 'Released to the driver automatically because the other party didn’t respond.'],
  ['{0} الرحلة كانت بالدفع النقدي، لذا تتم التسوية المالية بين الطرفين مباشرةً.', '{0} The trip was paid in cash, so the two parties settle it directly.'],

  // Verification and admin
  ['تم توثيق هويتك ✅', 'Your ID is verified ✅'],
  ['راجعت الإدارة بطاقتك الشخصية وتم توثيق حسابك.', 'Our team reviewed your ID card and your account is now verified.'],
  ['تم توثيقك كسائق 🚗', 'You’re verified as a driver 🚗'],
  ['يمكنك الآن نشر رحلاتك على يلا نسافر.', 'You can now post your trips on Yala Nsafr.'],
  ['رسالة من إدارة يلا نسافر', 'Message from Yala Nsafr'],
];

/** Single words that appear as runtime parts of a template. */
const WORDS: Record<string, string> = {
  مقعد: 'seat',
  مقاعد: 'seats',
};

const CITIES: Record<string, string> = {
  القاهرة: 'Cairo', الإسكندرية: 'Alexandria', الجيزة: 'Giza', أسوان: 'Aswan', الأقصر: 'Luxor',
  الغردقة: 'Hurghada', 'شرم الشيخ': 'Sharm El Sheikh', بورسعيد: 'Port Said', الإسماعيلية: 'Ismailia',
  السويس: 'Suez', المنصورة: 'Mansoura', طنطا: 'Tanta', الزقازيق: 'Zagazig', أسيوط: 'Assiut',
  سوهاج: 'Sohag', المنيا: 'Minya', 'بني سويف': 'Beni Suef', الفيوم: 'Fayoum', دمياط: 'Damietta',
  'كفر الشيخ': 'Kafr El Sheikh', 'مرسى مطروح': 'Marsa Matrouh', العريش: 'Arish', الغربية: 'Gharbia',
  المنوفية: 'Menoufia',
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const COMPILED = TEMPLATES.map(([ar, en]) => ({
  pattern: new RegExp('^' + escapeRegExp(ar).replace(/\\\{\d+\\\}/g, '([\\s\\S]*?)') + '$'),
  // The order the placeholders appear in the Arabic text
  slots: [...ar.matchAll(/\{(\d+)\}/g)].map((m) => Number(m[1])),
  en,
}));

function translatePart(part: string): string {
  const normalized = part
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/‏/g, '');
  if (normalized === '') return normalized;
  if (WORDS[normalized]) return WORDS[normalized];
  if (CITIES[normalized]) return CITIES[normalized];
  // "القاهرة ← الإسكندرية" → "Cairo → Alexandria"
  const route = normalized.match(/^(.+?) [←→] (.+)$/);
  if (route && CITIES[route[1]] && CITIES[route[2]]) return `${CITIES[route[1]]} → ${CITIES[route[2]]}`;
  return translateText(normalized) ?? normalized;
}

function translateText(text: string): string | null {
  for (const { pattern, slots, en } of COMPILED) {
    const m = text.match(pattern);
    if (!m) continue;
    const values: string[] = [];
    slots.forEach((slot, i) => (values[slot] = translatePart(m[i + 1])));
    return en.replace(/\{(\d+)\}/g, (_, n: string) => values[Number(n)] ?? '');
  }
  return null;
}

/** The text in the user's language — English when it has a translation, else unchanged. */
export function localizeNotificationText(text: string, language: string | null | undefined): string {
  if (language !== 'en' || !text) return text;
  return translateText(text) ?? text;
}

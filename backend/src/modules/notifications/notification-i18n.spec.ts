import { localizeNotificationText as en } from './notification-i18n';

describe('notification texts in English', () => {
  const t = (text: string) => en(text, 'en');

  it('leaves Arabic users untouched', () => {
    expect(en('طلب حجز جديد 🎉', 'ar')).toBe('طلب حجز جديد 🎉');
    expect(en('طلب حجز جديد 🎉', undefined)).toBe('طلب حجز جديد 🎉');
  });

  it('translates fixed texts', () => {
    expect(t('طلب حجز جديد 🎉')).toBe('New booking request 🎉');
    expect(t('تم البت في النزاع')).toBe('Dispute resolved');
  });

  it('fills runtime parts and translates city names in them', () => {
    expect(t('لديك طلب حجز جديد على رحلتك من القاهرة إلى الإسكندرية — لديك 30 دقيقة للرد')).toBe(
      'New booking request for your trip from Cairo to Alexandria — you have 30 minutes to respond',
    );
    expect(t('القاهرة ← المنصورة — الساعة 07:30. كن مستعداً.')).toBe('Cairo → Mansoura — at 07:30. Be ready.');
  });

  it('translates nested phrases and words', () => {
    expect(t('سارة ألغى حجز 2 مقاعد وستحصل على 36 جنيه تعويضاً')).toBe(
      'سارة cancelled their booking of 2 seats — you will receive EGP 36 in compensation',
    );
    expect(t('تم البت في النزاع: صرف المبلغ للسائق. الرحلة كانت بالدفع النقدي، لذا تتم التسوية المالية بين الطرفين مباشرةً.')).toBe(
      'Dispute resolved: the amount is released to the driver. The trip was paid in cash, so the two parties settle it directly.',
    );
    expect(t('تمت إضافة 50 جنيه: سداد عمولة رحلات الكاش عبر Kashier')).toBe(
      'EGP 50 added: Cash-trip commission paid via Kashier',
    );
  });

  it('normalizes Arabic-Indic digits in dates', () => {
    expect(t('اشتراك يلا نسافر Pro نشط حتى ١٢‏/١٠‏/٢٠٢٦.')).toBe('Yala Nsafr Pro is active until 12/10/2026.');
  });

  it('keeps texts it has no translation for (e.g. admin broadcasts)', () => {
    expect(t('عرض خاص هذا الأسبوع')).toBe('عرض خاص هذا الأسبوع');
    expect(t('تم رفض طلب سحب 300 جنيه: بيانات الحساب غير صحيحة')).toBe(
      'Your withdrawal of EGP 300 was declined: بيانات الحساب غير صحيحة',
    );
  });
});

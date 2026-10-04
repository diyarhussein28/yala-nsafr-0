import 'package:latlong2/latlong.dart';

/// Approximate city-centre coordinates for the cities the app offers, used to place a
/// trip's destination on the map when the trip has no exact coordinates.
const egyptCityCenters = <String, LatLng>{
  'القاهرة': LatLng(30.0444, 31.2357),
  'الإسكندرية': LatLng(31.2001, 29.9187),
  'الجيزة': LatLng(30.0131, 31.2089),
  'أسوان': LatLng(24.0889, 32.8998),
  'الأقصر': LatLng(25.6872, 32.6396),
  'الغردقة': LatLng(27.2579, 33.8116),
  'شرم الشيخ': LatLng(27.9158, 34.3300),
  'بورسعيد': LatLng(31.2653, 32.3019),
  'الإسماعيلية': LatLng(30.5965, 32.2715),
  'السويس': LatLng(29.9668, 32.5498),
  'المنصورة': LatLng(31.0409, 31.3785),
  'طنطا': LatLng(30.7865, 31.0004),
  'الزقازيق': LatLng(30.5877, 31.5020),
  'أسيوط': LatLng(27.1783, 31.1859),
  'سوهاج': LatLng(26.5591, 31.6957),
  'المنيا': LatLng(28.1099, 30.7503),
  'بني سويف': LatLng(29.0661, 31.0994),
  'الفيوم': LatLng(29.3084, 30.8428),
  'دمياط': LatLng(31.4165, 31.8133),
  'كفر الشيخ': LatLng(31.1107, 30.9388),
  'مرسى مطروح': LatLng(31.3543, 27.2373),
  'العريش': LatLng(31.1316, 33.7984),
  'الغربية': LatLng(30.8754, 31.0335),
  'المنوفية': LatLng(30.5503, 31.0106),
};

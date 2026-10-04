import 'package:flutter_test/flutter_test.dart';
import 'package:yala_nsafr/core/services/update_checker.dart';

void main() {
  test('semantic version comparison', () {
    expect(UpdateChecker.compare('1.0.0', '1.0.0'), 0);
    expect(UpdateChecker.compare('1.0.9', '1.1.0'), lessThan(0));
    expect(UpdateChecker.compare('1.10.0', '1.9.3'), greaterThan(0));
    expect(UpdateChecker.compare('2.0', '1.99.99'), greaterThan(0));
    expect(UpdateChecker.compare('1.2.3+45', '1.2.3'), 0);
  });
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_endpoints.dart';
import '../../../../core/i18n/tr.dart';

class KashierWebViewScreen extends ConsumerStatefulWidget {
  final String bookingId;
  final String paymentUrl;

  const KashierWebViewScreen({
    super.key,
    required this.bookingId,
    required this.paymentUrl,
  });

  @override
  ConsumerState<KashierWebViewScreen> createState() =>
      _KashierWebViewScreenState();
}

class _KashierWebViewScreenState extends ConsumerState<KashierWebViewScreen> {
  late final WebViewController _controller;
  bool _healing = false;
  bool _loadError = false;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(NavigationDelegate(
        onNavigationRequest: _onNavigationRequest,
        onWebResourceError: (_) => setState(() => _loadError = true),
      ))
      ..loadRequest(Uri.parse(widget.paymentUrl));
  }

  NavigationDecision _onNavigationRequest(NavigationRequest request) {
    final url = request.url;
    // Intercept Kashier's redirect after payment (any URL containing our endpoint)
    if (url.contains('payment-done') || url.contains('kashier/payment')) {
      if (!_healing) {
        _healing = true;
        final uri = Uri.parse(url);
        _handlePaymentResult(
          kashierOrderId: uri.queryParameters['orderId'],
          merchantOrderId: uri.queryParameters['merchantOrderId'],
          status: uri.queryParameters['status'] ?? '',
        );
      }
      return NavigationDecision.prevent;
    }
    return NavigationDecision.navigate;
  }

  Future<void> _handlePaymentResult({
    required String? kashierOrderId,
    required String? merchantOrderId,
    required String status,
  }) async {
    setState(() => _healing = true);

    final upperStatus = status.toUpperCase();
    if (kashierOrderId != null &&
        (upperStatus == 'SUCCESS' || upperStatus == 'AUTHORIZED' || upperStatus.isEmpty)) {
      try {
        await ref.read(dioProvider).post(
          Endpoints.bookingHeal(widget.bookingId),
          data: {'kashierOrderId': kashierOrderId},
        );
      } catch (_) {}
    }

    if (mounted) context.go('/my-bookings');
  }

  Future<bool> _onWillPop() async {
    if (_healing) return false;
    final leave = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(tr('هل تريد المغادرة؟')),
        content: Text(tr('الدفع لم يكتمل بعد. يمكنك مراجعة حجوزاتك لاحقاً.')),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(tr('متابعة الدفع')),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(tr('مغادرة')),
          ),
        ],
      ),
    );
    return leave ?? false;
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _onWillPop() && context.mounted) context.go('/my-bookings');
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(tr('إتمام الدفع')),
          automaticallyImplyLeading: false,
          leading: IconButton(
            icon: const Icon(Icons.close),
            onPressed: () async {
              if (await _onWillPop() && context.mounted) {
                context.go('/my-bookings');
              }
            },
          ),
        ),
        body: _healing
            ? Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const CircularProgressIndicator(),
                    const SizedBox(height: 16),
                    Text(
                      tr('جاري تأكيد الدفع...'),
                      style: const TextStyle(fontSize: 16),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      tr('يرجى الانتظار'),
                      style: const TextStyle(color: Colors.grey),
                    ),
                  ],
                ),
              )
            : _loadError
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.wifi_off_rounded,
                            size: 64, color: Colors.grey),
                        const SizedBox(height: 16),
                        Text(tr('تعذّر تحميل صفحة الدفع')),
                        const SizedBox(height: 16),
                        FilledButton(
                          onPressed: () {
                            setState(() => _loadError = false);
                            _controller.reload();
                          },
                          child: Text(tr('إعادة المحاولة')),
                        ),
                      ],
                    ),
                  )
                : WebViewWidget(controller: _controller),
      ),
    );
  }
}

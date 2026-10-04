import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../../core/api/api_client.dart';
import '../../core/i18n/tr.dart';

/// Kashier hosted checkout for an immediate charge (a subscription period, or the
/// commission a driver owes on cash trips).
///
/// Pops with `true` once the server has confirmed the payment with Kashier, `false`
/// otherwise. The redirect's own query string is never trusted — it only tells us the
/// checkout finished, and the server then asks Kashier what actually happened.
class KashierCheckoutScreen extends ConsumerStatefulWidget {
  final String sessionUrl;
  /// Endpoint the server checks with Kashier and applies the payment on
  final String confirmEndpoint;

  const KashierCheckoutScreen({
    super.key,
    required this.sessionUrl,
    required this.confirmEndpoint,
  });

  @override
  ConsumerState<KashierCheckoutScreen> createState() =>
      _KashierCheckoutScreenState();
}

class _KashierCheckoutScreenState
    extends ConsumerState<KashierCheckoutScreen> {
  WebViewController? _controller;
  bool _confirming = false;
  bool _loadError = false;

  @override
  void initState() {
    super.initState();
    // PAYMENT_MOCK on the server returns a mock:// URL — there is no page to show, the
    // confirm call alone applies the payment in development.
    if (widget.sessionUrl.startsWith('mock://')) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _confirm());
      return;
    }
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(NavigationDelegate(
        onNavigationRequest: (request) {
          if (request.url.contains('payment-done')) {
            _confirm();
            return NavigationDecision.prevent;
          }
          return NavigationDecision.navigate;
        },
        onWebResourceError: (_) {
          if (mounted) setState(() => _loadError = true);
        },
      ))
      ..loadRequest(Uri.parse(widget.sessionUrl));
  }

  Future<void> _confirm() async {
    if (_confirming) return;
    setState(() => _confirming = true);

    bool paid = false;
    // The webhook may land a moment after the redirect, so check a few times
    for (var attempt = 0; attempt < 4 && !paid; attempt++) {
      if (attempt > 0) await Future<void>.delayed(const Duration(seconds: 2));
      try {
        final res = await ref
            .read(dioProvider)
            .post(widget.confirmEndpoint);
        paid = (res.data as Map<String, dynamic>)['status'] == 'paid';
      } catch (_) {
        // Retried below; the server-side reconciliation is the backstop
      }
    }

    if (mounted) Navigator.of(context).pop(paid);
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_confirming,
      child: Scaffold(
        appBar: AppBar(
          title: Text(tr('الدفع')),
          automaticallyImplyLeading: false,
          leading: _confirming
              ? null
              : IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.of(context).pop(false),
                ),
        ),
        body: _confirming || _controller == null
            ? Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const CircularProgressIndicator(),
                    const SizedBox(height: 16),
                    Text(tr('جاري تأكيد الدفع...'), style: const TextStyle(fontSize: 16)),
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
                            _controller!.reload();
                          },
                          child: Text(tr('إعادة المحاولة')),
                        ),
                      ],
                    ),
                  )
                : WebViewWidget(controller: _controller!),
      ),
    );
  }
}

import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:projectprice_app/app_supabase.dart';
import 'package:projectprice_app/legal_notice_card.dart';
import 'package:projectprice_app/my_projects_screen.dart';

class PriceProjectScreen extends StatefulWidget {
  const PriceProjectScreen({super.key});

  @override
  State<PriceProjectScreen> createState() => _PriceProjectScreenState();
}

class _PriceProjectScreenState extends State<PriceProjectScreen> {
  final ImagePicker _picker = ImagePicker();
  final TextEditingController _descriptionController = TextEditingController();
  final TextEditingController _zipCodeController = TextEditingController();
  XFile? _selectedImage;
  Uint8List? _selectedImageBytes;
  bool _isLoading = false;
  bool _isSaving = false;
  String? _errorMessage;
  String? _estimateSummary;
  List<_EstimateTier> _tiers = const [];
  Map<String, _TierPreviewImage> _tierPreviewImages = const {};
  int _selectedTierIndex = 2;
  Map<String, dynamic>? _savedHomeowner;
  HomeownerAccount? _sessionHomeowner;

  @override
  void initState() {
    super.initState();
    _hydrateSessionHomeowner();
  }

  @override
  void dispose() {
    _descriptionController.dispose();
    _zipCodeController.dispose();
    super.dispose();
  }

  bool get _hasValidZipCode {
    return RegExp(r'^\d{5}$').hasMatch(_zipCodeController.text.trim());
  }

  Future<void> _hydrateSessionHomeowner() async {
    if (!isSupabaseConfigured) {
      return;
    }

    final homeowner = await loadCurrentHomeowner();
    if (!mounted) {
      return;
    }

    setState(() {
      _sessionHomeowner = homeowner;
    });
  }

  Future<void> _pickImage(ImageSource source) async {
    final picked = await _picker.pickImage(
      source: source,
      imageQuality: 80,
      maxWidth: 1600,
    );
    if (!mounted || picked == null) {
      return;
    }

    final bytes = await picked.readAsBytes();

    setState(() {
      _selectedImage = picked;
      _selectedImageBytes = bytes;
      _tiers = const [];
      _tierPreviewImages = const {};
      _selectedTierIndex = 2;
      _estimateSummary = null;
      _errorMessage = null;
    });
  }

  int _preferredPremiumIndex(List<_EstimateTier> tiers) {
    if (tiers.isEmpty) return 0;
    final premiumIndex = tiers.indexWhere((tier) {
      final normalized = tier.name.trim().toLowerCase();
      return normalized == 'premium' || normalized.contains('premium');
    });
    if (premiumIndex >= 0) return premiumIndex;

    // Fallback: if names are unexpected, pick the highest-cost tier.
    var bestIndex = 0;
    var bestHigh = tiers[0].rangeHigh;
    for (var i = 1; i < tiers.length; i += 1) {
      if (tiers[i].rangeHigh > bestHigh) {
        bestHigh = tiers[i].rangeHigh;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  List<_EstimateTier> _prioritizeSelectedTierFirst(List<_EstimateTier> tiers) {
    if (tiers.length <= 1) return tiers;
    final selectedIndex = _preferredPremiumIndex(tiers);
    if (selectedIndex <= 0 || selectedIndex >= tiers.length) return tiers;
    final selected = tiers[selectedIndex];
    final others = <_EstimateTier>[];
    for (var i = 0; i < tiers.length; i += 1) {
      if (i == selectedIndex) continue;
      others.add(tiers[i]);
    }
    return [selected, ...others];
  }

  bool get _canGenerateEstimate {
    return !_isLoading &&
        _selectedImageBytes != null &&
        _descriptionController.text.trim().isNotEmpty &&
        _hasValidZipCode;
  }

  String get _apiBaseUrl {
    if (kIsWeb &&
        Uri.base.hasAuthority &&
        (Uri.base.scheme == 'http' || Uri.base.scheme == 'https')) {
      return Uri.base.origin;
    }

    return const String.fromEnvironment(
      'PROJECTPRICE_API_BASE_URL',
      defaultValue: 'https://project-price-app.netlify.app',
    );
  }

  Uri _functionEndpoint(String functionName) {
    final rawBase = _apiBaseUrl.trim();
    final normalizedBase = rawBase.endsWith('/') ? rawBase.substring(0, rawBase.length - 1) : rawBase;
    final base = Uri.parse(normalizedBase);
    final segments = <String>[
      ...base.pathSegments.where((segment) => segment.isNotEmpty),
      '.netlify',
      'functions',
      functionName,
    ];
    return base.replace(pathSegments: segments, queryParameters: null, fragment: null);
  }

  // Compile-time secret injected via --dart-define=APP_API_SECRET=...
  // Empty string means no auth header is sent (safe fallback while secret is being set up).
  static const String _appApiSecret = String.fromEnvironment('APP_API_SECRET', defaultValue: '');

  Map<String, String> get _apiHeaders {
    final headers = <String, String>{'Content-Type': 'application/json'};
    if (_appApiSecret.isNotEmpty) {
      headers['x-app-token'] = _appApiSecret;
    }
    return headers;
  }

  String _guessMimeType(String path) {
    final lower = path.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.heic')) return 'image/heic';
    return 'image/jpeg';
  }

  Map<String, dynamic>? _tryDecodeJsonObject(String raw) {
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) return decoded;
      return null;
    } catch (_) {
      return null;
    }
  }

  String _cleanServerSnippet(String raw) {
    final stripped = raw
        .replaceAll(RegExp(r'<[^>]*>'), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    if (stripped.isEmpty) return 'No response body.';
    return stripped.length > 180
        ? '${stripped.substring(0, 180)}...'
        : stripped;
  }

  Future<void> _generateEstimates() async {
    if (!_canGenerateEstimate ||
        _selectedImageBytes == null ||
        _selectedImage == null) {
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final endpoint = _functionEndpoint('project-price-generate-estimates');
      final payload = {
        'description': _descriptionController.text.trim(),
        'zipCode': _zipCodeController.text.trim(),
        'imageBase64': base64Encode(_selectedImageBytes!),
        'mimeType': _guessMimeType(_selectedImage!.path),
      };

      final response = await http
          .post(
            endpoint,
            headers: _apiHeaders,
            body: jsonEncode(payload),
          )
          .timeout(const Duration(seconds: 70));

      final decoded = _tryDecodeJsonObject(response.body);
      if (response.statusCode >= 400) {
        throw Exception(
          (decoded?['error'] as String?) ??
              'Generate estimates failed (${response.statusCode}). ${_cleanServerSnippet(response.body)}',
        );
      }

      if (decoded == null) {
        throw Exception(
          'Generate estimates returned non-JSON (${response.statusCode}). ${_cleanServerSnippet(response.body)}',
        );
      }

      final rawTiers = (decoded['tiers'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .toList();
      final rawPreviewImages =
          decoded['tierPreviewImages'] as Map<String, dynamic>?;
      if (rawTiers.length < 3) {
        throw Exception('Estimate response is incomplete.');
      }

      if (mounted) {
        final parsedPreviews = _parseTierPreviewImages(rawPreviewImages);
        final parsedTiers = rawTiers.map(_EstimateTier.fromJson).toList();
        final prioritizedTiers = _prioritizeSelectedTierFirst(parsedTiers);
        setState(() {
          _estimateSummary = decoded['summary'] as String?;
          _tiers = prioritizedTiers;
          _tierPreviewImages = parsedPreviews;
          _selectedTierIndex = 0;
        });
      }
    } catch (error) {
      if (mounted) {
        final text = error.toString();
        final isHostLookupFailure =
            text.contains('SocketException') || text.contains('SocketFailed host lookup');
        final isRetryableGenerationError =
            text.contains('504') ||
            text.toLowerCase().contains('timed out') ||
            text.toLowerCase().contains('timeout');
        setState(() {
          _errorMessage = isHostLookupFailure
              ? 'Network host lookup failed. Please switch network (Wi-Fi/mobile data) and try again.'
              : isRetryableGenerationError
                  ? 'Please click Generate again to complete your request.'
                  : 'We could not complete your request right now. Please click Generate again.';
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  String _formatUsd(int value) {
    final digits = value.toString();
    return digits.replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (match) => ',',
    );
  }

  Future<void> _openSaveDialog() async {
    final tier = _selectedTier;
    if (tier == null) return;

    final result = await showDialog<_SaveProjectFormResult>(
      context: context,
      builder: (context) => _SaveProjectDialog(
        selectedTier: tier,
        description: _descriptionController.text.trim(),
        requirePassword: _sessionHomeowner == null,
        initialEmail:
            _sessionHomeowner?.email ?? _savedHomeowner?['email']?.toString(),
        initialPhone:
            _sessionHomeowner?.phone ?? _savedHomeowner?['phone']?.toString(),
        initialFullName: _sessionHomeowner?.fullName ??
            _savedHomeowner?['fullName']?.toString(),
        initialStreetAddress: _sessionHomeowner?.streetAddress ??
            _savedHomeowner?['streetAddress']?.toString(),
        initialZipCode: _sessionHomeowner?.zipCode ??
            _savedHomeowner?['zipCode']?.toString(),
      ),
    );

    if (result == null) {
      return;
    }

    await _saveProject(result);
  }

  Future<void> _saveProject(_SaveProjectFormResult form) async {
    final tier = _selectedTier;
    if (tier == null) return;

    setState(() {
      _isSaving = true;
      _errorMessage = null;
    });

    try {
      final endpoint = _functionEndpoint('project-price-save-project');
      final premiumPreview = _tierPreviewImages['premium'];
      final selectedPreview = _previewForTierName(tier.name);
      final renderToPersist = premiumPreview ?? selectedPreview;
      final payload = {
        'userId': _sessionHomeowner?.userId ?? _savedHomeowner?['userId'],
        'fullName': form.fullName,
        'email': form.email,
        'phone': form.phone,
        'streetAddress': form.streetAddress,
        'zipCode': form.zipCode,
        'password': form.password,
        'description': _descriptionController.text.trim(),
        'summary': _estimateSummary,
        if (_selectedImageBytes != null && _selectedImage != null) ...{
          'imageBase64': base64Encode(_selectedImageBytes!),
          'mimeType': _guessMimeType(_selectedImage!.path),
        },
        if (renderToPersist != null) ...{
          'renderedImageBase64': base64Encode(renderToPersist.imageBytes),
          'renderedMimeType': renderToPersist.mimeType,
        },
        'selectedTier': {
          'name': tier.name,
          'rangeLow': tier.rangeLow,
          'rangeHigh': tier.rangeHigh,
          'rationale': tier.rationale,
        },
        'allTiers': _tiers
            .map(
              (item) => {
                'name': item.name,
                'rangeLow': item.rangeLow,
                'rangeHigh': item.rangeHigh,
                'rationale': item.rationale,
              },
            )
            .toList(),
      };

      final response = await http
          .post(
            endpoint,
            headers: _apiHeaders,
            body: jsonEncode(payload),
          )
          .timeout(const Duration(seconds: 45));

      final decoded = _tryDecodeJsonObject(response.body);
      if (response.statusCode >= 400) {
        throw Exception(
          (decoded?['error'] as String?) ??
              'Save project failed (${response.statusCode}). ${_cleanServerSnippet(response.body)}',
        );
      }

      if (decoded == null) {
        throw Exception(
          'Save project returned non-JSON (${response.statusCode}). ${_cleanServerSnippet(response.body)}',
        );
      }

      final homeowner = decoded['homeowner'] as Map<String, dynamic>?;
      if (mounted) {
        setState(() {
          _savedHomeowner = homeowner;
        });
      }

      var successMessage = 'Saved to My Projects.';
      if (_sessionHomeowner == null &&
          isSupabaseConfigured &&
          form.password.isNotEmpty) {
        try {
          await signInHomeowner(email: form.email, password: form.password);
          await _hydrateSessionHomeowner();
          successMessage = 'Saved to My Projects and signed in.';
        } catch (_) {
          successMessage =
              'Saved to My Projects. Sign in from My Projects if needed.';
        }
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(successMessage)),
        );

        await Navigator.of(context).push(
          MaterialPageRoute<void>(builder: (_) => const MyProjectsScreen()),
        );
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _errorMessage = error.toString().replaceFirst('Exception: ', '');
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _isSaving = false;
        });
      }
    }
  }

  Future<void> _routeSaveToMyProjects() async {
    if (_sessionHomeowner != null) {
      await _openSaveDialog();
      return;
    }

    final action = await _showAccountChoiceSheet(
      createSubtitle:
          'Create an account and save this project into My Projects.',
      loginSubtitle: 'Log in first, then save this project into My Projects.',
    );

    if (action == 'create') {
      await _openSaveDialog();
      return;
    }

    if (action == 'login') {
      await _openLoginThenSaveFlow();
    }
  }

  Future<void> _openLoginThenSaveFlow() async {
    final credentials = await showDialog<_LoginCredentials>(
      context: context,
      builder: (_) => const _LoginToContinueDialog(),
    );

    if (credentials == null) {
      return;
    }

    setState(() {
      _isSaving = true;
      _errorMessage = null;
    });

    try {
      await signInHomeowner(
        email: credentials.email,
        password: credentials.password,
      );
      await _hydrateSessionHomeowner();
      if (!mounted) {
        return;
      }
      await _openSaveDialog();
    } catch (error) {
      if (mounted) {
        setState(() {
          _errorMessage = error.toString().replaceFirst('Exception: ', '');
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _isSaving = false;
        });
      }
    }
  }

  Future<String?> _showAccountChoiceSheet({
    required String createSubtitle,
    required String loginSubtitle,
  }) {
    return showModalBottomSheet<String>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.person_add_alt_1_outlined),
              title: const Text('Create account'),
              subtitle: Text(createSubtitle),
              onTap: () => Navigator.of(context).pop('create'),
            ),
            ListTile(
              leading: const Icon(Icons.login),
              title: const Text('Log in'),
              subtitle: Text(loginSubtitle),
              onTap: () => Navigator.of(context).pop('login'),
            ),
          ],
        ),
      ),
    );
  }

  _EstimateTier? get _selectedTier {
    if (_tiers.isEmpty) {
      return null;
    }
    final safeIndex = _selectedTierIndex.clamp(0, _tiers.length - 1);
    return _tiers[safeIndex];
  }

  _TierPreviewImage? _previewForTierName(String tierName) {
    final normalized = tierName.trim().toLowerCase();
    final direct = _tierPreviewImages[normalized];
    if (direct != null) {
      return direct;
    }

    if (normalized.contains('premium')) return _tierPreviewImages['premium'];
    if (normalized.contains('standard')) return _tierPreviewImages['standard'];
    if (normalized.contains('basic')) return _tierPreviewImages['basic'];
    return null;
  }

  Map<String, _TierPreviewImage> _parseTierPreviewImages(
    Map<String, dynamic>? payload,
  ) {
    if (payload == null || payload.isEmpty) return const {};

    final parsed = <String, _TierPreviewImage>{};
    payload.forEach((key, value) {
      if (value is! Map<String, dynamic>) return;
      final imageBase64 = (value['imageBase64'] as String?)?.trim() ?? '';
      if (imageBase64.isEmpty) return;

      try {
        parsed[key.toLowerCase()] = _TierPreviewImage(
          imageBytes: base64Decode(imageBase64),
          mimeType: (value['mimeType'] as String?)?.trim() ?? 'image/png',
        );
      } catch (_) {
        // Ignore malformed preview images; UI will fall back to overlay markers.
      }
    });
    return parsed;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: Image.asset(
                'assets/images/app_icon_base.jpg',
                width: 24,
                height: 24,
                fit: BoxFit.cover,
              ),
            ),
            const SizedBox(width: 8),
            const Text('Price a Project'),
          ],
        ),
      ),
      body: GestureDetector(
        behavior: HitTestBehavior.translucent,
        onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Step 1 of 3: Add a photo, project details, and your zip code for local pricing.',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 14),
              Container(
                width: double.infinity,
                constraints: const BoxConstraints(minHeight: 220),
                decoration: BoxDecoration(
                  color: const Color(0xFFF4F8FF),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFFD6E6FF)),
                ),
                child: _selectedImage == null
                    ? const Center(
                        child: Padding(
                          padding: EdgeInsets.all(20),
                          child: Text(
                            'No photo selected yet. Use Camera or Gallery below.',
                            textAlign: TextAlign.center,
                          ),
                        ),
                      )
                    : ClipRRect(
                        borderRadius: BorderRadius.circular(16),
                        child: Image.memory(
                          _selectedImageBytes!,
                          fit: BoxFit.cover,
                        ),
                      ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _pickImage(ImageSource.camera),
                      icon: const Icon(Icons.photo_camera),
                      label: const Text('Camera'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _pickImage(ImageSource.gallery),
                      icon: const Icon(Icons.collections),
                      label: const Text('Gallery'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              TextField(
                controller: _zipCodeController,
                keyboardType: TextInputType.number,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  labelText: 'Project zip code',
                  hintText: '44101',
                  helperText: 'Add your zip code for localized pricing.',
                  errorText: _zipCodeController.text.isEmpty || _hasValidZipCode
                      ? null
                      : 'Enter a valid 5-digit zip code.',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _descriptionController,
                minLines: 4,
                maxLines: 6,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  labelText: 'Project description',
                  hintText:
                      'Example: Replace leaking kitchen faucet and check water pressure.',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: _canGenerateEstimate ? _generateEstimates : null,
                  icon: const Icon(Icons.auto_awesome),
                  label: Text(
                    _isLoading ? 'Generating...' : 'Generate 3 AI Estimates',
                  ),
                ),
              ),
              if (_isLoading) ...[
                const SizedBox(height: 12),
                const LinearProgressIndicator(minHeight: 6),
              ],
              if (_errorMessage != null) ...[
                const SizedBox(height: 14),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFF0F0),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFFFD1D1)),
                  ),
                  child: Text(
                    _errorMessage!,
                    style: const TextStyle(color: Color(0xFF8E1E1E)),
                  ),
                ),
              ],
              if (_tiers.isNotEmpty) ...[
                const SizedBox(height: 20),
                Text(
                  'Estimated Cost Tiers',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                if ((_estimateSummary ?? '').isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 6, bottom: 10),
                    child: Text(_estimateSummary!),
                  ),
                const SizedBox(height: 4),
                Text(
                  'Tap a tier to preview how that selection feels on the customer photo.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 12),
                _TierOverlayPreview(
                  imageBytes: _selectedImageBytes!,
                  tier: _selectedTier!,
                  generatedPreview: _previewForTierName(_selectedTier!.name),
                ),
                const SizedBox(height: 12),
                ..._tiers.map(
                  (tier) {
                    final tierIndex = _tiers.indexOf(tier);
                    final isSelected = tierIndex == _selectedTierIndex;
                    final accent = _tierAccentColor(tier.name);
                    return GestureDetector(
                      onTap: () {
                        setState(() {
                          _selectedTierIndex = tierIndex;
                        });
                      },
                      child: Container(
                        width: double.infinity,
                        margin: const EdgeInsets.only(bottom: 10),
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? accent.withValues(alpha: 0.12)
                              : const Color(0xFFF8FBFF),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color:
                                isSelected ? accent : const Color(0xFFD6E6FF),
                            width: isSelected ? 2 : 1,
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    tier.name,
                                    style:
                                        Theme.of(context).textTheme.titleMedium,
                                  ),
                                ),
                                if (isSelected)
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 10,
                                      vertical: 5,
                                    ),
                                    decoration: BoxDecoration(
                                      color: accent,
                                      borderRadius: BorderRadius.circular(999),
                                    ),
                                    child: const Text(
                                      'Previewing',
                                      style: TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w700,
                                        fontSize: 12,
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '\$${_formatUsd(tier.rangeLow)} - \$${_formatUsd(tier.rangeHigh)}',
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                fontSize: 16,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(tier.rationale),
                          ],
                        ),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: _isSaving ? null : _routeSaveToMyProjects,
                    icon: const Icon(Icons.bookmark_added_outlined),
                    label: Text(
                      _isSaving
                          ? 'Saving...'
                          : 'Save Selected Option To My Projects',
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Choose Create account or Log in, then save this option into My Projects.',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
              const SizedBox(height: 18),
              const LegalNoticeCard(),
            ],
            ),
          ),
        ),
      ),
    );
  }
}

Color _tierAccentColor(String tierName) {
  switch (tierName.toLowerCase()) {
    case 'basic':
      return const Color(0xFF3A6EA8);
    case 'premium':
      return const Color(0xFF9B6A00);
    case 'standard':
    default:
      return const Color(0xFF16A36A);
  }
}

class _TierOverlayPreview extends StatelessWidget {
  const _TierOverlayPreview({
    required this.imageBytes,
    required this.tier,
    this.generatedPreview,
  });

  final Uint8List imageBytes;
  final _EstimateTier tier;
  final _TierPreviewImage? generatedPreview;

  List<_OverlayMarker> get _markers {
    final normalized = tier.name.toLowerCase();
    if (normalized == 'basic') {
      return const [
        _OverlayMarker(
          label: 'Builder-grade materials',
          icon: Icons.build_circle_outlined,
        ),
        _OverlayMarker(
          label: 'Core repair scope',
          icon: Icons.straighten,
        ),
        _OverlayMarker(
          label: 'Budget finish',
          icon: Icons.savings_outlined,
        ),
      ];
    }
    if (normalized == 'premium') {
      return const [
        _OverlayMarker(
          label: 'Premium fixture upgrade',
          icon: Icons.workspace_premium_outlined,
        ),
        _OverlayMarker(
          label: 'Detail finish work',
          icon: Icons.auto_awesome,
        ),
        _OverlayMarker(
          label: 'Enhanced scope',
          icon: Icons.layers_outlined,
        ),
      ];
    }
    return const [
      _OverlayMarker(
        label: 'Quality fixture',
        icon: Icons.verified_outlined,
      ),
      _OverlayMarker(
        label: 'Balanced labor scope',
        icon: Icons.handyman_outlined,
      ),
      _OverlayMarker(
        label: 'Cleaner finish',
        icon: Icons.design_services_outlined,
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final accent = _tierAccentColor(tier.name);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFFF5F9FF),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFD6E6FF)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${tier.name} visual preview',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: accent,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  tier.name,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          AspectRatio(
            aspectRatio: 1,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Image.memory(
                    generatedPreview?.imageBytes ?? imageBytes,
                    fit: BoxFit.cover,
                  ),
                  DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          accent.withValues(alpha: 0.10),
                          accent.withValues(alpha: 0.35),
                        ],
                      ),
                    ),
                  ),
                  Positioned(
                    left: 14,
                    right: 14,
                    top: 14,
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.42),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            tier.name,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            generatedPreview != null
                                ? 'AI preview: ${tier.rationale}'
                                : tier.rationale,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Colors.white,
                              height: 1.3,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (generatedPreview == null &&
                      !tier.name.toLowerCase().contains('premium'))
                    Positioned(
                      left: 10,
                      right: 10,
                      bottom: 10,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 10,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.48),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: _markers
                              .map(
                                (marker) => Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 7,
                                  ),
                                  decoration: BoxDecoration(
                                    color: Colors.white.withValues(alpha: 0.95),
                                    borderRadius: BorderRadius.circular(999),
                                    border: Border.all(
                                      color: accent.withValues(alpha: 0.65),
                                    ),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(marker.icon, size: 15, color: accent),
                                      const SizedBox(width: 6),
                                      Text(
                                        marker.label,
                                        style: const TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              )
                              .toList(),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TierPreviewImage {
  const _TierPreviewImage({
    required this.imageBytes,
    required this.mimeType,
  });

  final Uint8List imageBytes;
  final String mimeType;
}

class _OverlayMarker {
  const _OverlayMarker({
    required this.label,
    required this.icon,
  });

  final String label;
  final IconData icon;
}

class _EstimateTier {
  const _EstimateTier({
    required this.name,
    required this.rangeLow,
    required this.rangeHigh,
    required this.rationale,
  });

  final String name;
  final int rangeLow;
  final int rangeHigh;
  final String rationale;

  factory _EstimateTier.fromJson(Map<String, dynamic> json) {
    return _EstimateTier(
      name: (json['name'] as String? ?? 'Tier').trim(),
      rangeLow: (json['rangeLow'] as num?)?.round() ?? 0,
      rangeHigh: (json['rangeHigh'] as num?)?.round() ?? 0,
      rationale:
          (json['rationale'] as String? ?? 'Estimated from project scope.')
              .trim(),
    );
  }
}

class _SaveProjectFormResult {
  const _SaveProjectFormResult({
    required this.fullName,
    required this.email,
    required this.phone,
    required this.streetAddress,
    required this.zipCode,
    required this.password,
  });

  final String fullName;
  final String email;
  final String phone;
  final String streetAddress;
  final String zipCode;
  final String password;
}

class _SaveProjectDialog extends StatefulWidget {
  const _SaveProjectDialog({
    required this.selectedTier,
    required this.description,
    this.requirePassword = true,
    this.initialFullName,
    this.initialEmail,
    this.initialPhone,
    this.initialStreetAddress,
    this.initialZipCode,
  });

  final _EstimateTier selectedTier;
  final String description;
  final bool requirePassword;
  final String? initialFullName;
  final String? initialEmail;
  final String? initialPhone;
  final String? initialStreetAddress;
  final String? initialZipCode;

  @override
  State<_SaveProjectDialog> createState() => _SaveProjectDialogState();
}

class _SaveProjectDialogState extends State<_SaveProjectDialog> {
  late final TextEditingController _fullNameController;
  late final TextEditingController _emailController;
  late final TextEditingController _phoneController;
  late final TextEditingController _streetController;
  late final TextEditingController _zipController;
  late final TextEditingController _passwordController;
  String? _error;

  @override
  void initState() {
    super.initState();
    _fullNameController =
        TextEditingController(text: widget.initialFullName ?? '');
    _emailController = TextEditingController(text: widget.initialEmail ?? '');
    _phoneController = TextEditingController(text: widget.initialPhone ?? '');
    _streetController =
        TextEditingController(text: widget.initialStreetAddress ?? '');
    _zipController = TextEditingController(text: widget.initialZipCode ?? '');
    _passwordController = TextEditingController();
  }

  @override
  void dispose() {
    _fullNameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _streetController.dispose();
    _zipController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _submit() {
    final fullName = _fullNameController.text.trim();
    final email = _emailController.text.trim();
    final phone = _phoneController.text.trim();
    final street = _streetController.text.trim();
    final zip = _zipController.text.trim();
    final password = _passwordController.text.trim();

    if ([fullName, email, phone, street, zip].any((value) => value.isEmpty)) {
      setState(() {
        _error = 'All fields are required to save a project.';
      });
      return;
    }

    if (widget.requirePassword && password.isEmpty) {
      setState(() {
        _error = 'Password is required to create an account.';
      });
      return;
    }

    if (widget.requirePassword && password.length < 8) {
      setState(() {
        _error = 'Password must be at least 8 characters.';
      });
      return;
    }

    Navigator.of(context).pop(
      _SaveProjectFormResult(
        fullName: fullName,
        email: email,
        phone: phone,
        streetAddress: street,
        zipCode: zip,
        password: password,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(
        widget.requirePassword
            ? 'Create account to save project'
            : 'Save project to My Projects',
      ),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.requirePassword
                  ? 'Save ${widget.selectedTier.name} for this project and create the homeowner account in one step.'
                  : 'Save ${widget.selectedTier.name} for this project using your current account.',
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _fullNameController,
              decoration: const InputDecoration(labelText: 'Full name'),
            ),
            TextField(
              controller: _emailController,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(labelText: 'Email'),
            ),
            TextField(
              controller: _phoneController,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'Phone'),
            ),
            TextField(
              controller: _streetController,
              decoration: const InputDecoration(labelText: 'Street address'),
            ),
            TextField(
              controller: _zipController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Zip code'),
            ),
            if (widget.requirePassword)
              TextField(
                controller: _passwordController,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Create password'),
              ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(
                _error!,
                style: const TextStyle(color: Color(0xFF8E1E1E)),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _submit,
          child: const Text('Save To My Projects'),
        ),
      ],
    );
  }
}

class _LoginCredentials {
  const _LoginCredentials({
    required this.email,
    required this.password,
  });

  final String email;
  final String password;
}

class _LoginToContinueDialog extends StatefulWidget {
  const _LoginToContinueDialog();

  @override
  State<_LoginToContinueDialog> createState() => _LoginToContinueDialogState();
}

class _LoginToContinueDialogState extends State<_LoginToContinueDialog> {
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _submit() {
    final email = _emailController.text.trim();
    final password = _passwordController.text.trim();
    if (email.isEmpty || password.isEmpty) {
      setState(() {
        _error = 'Email and password are required.';
      });
      return;
    }

    Navigator.of(context).pop(
      _LoginCredentials(email: email, password: password),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Log in to continue'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _emailController,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(labelText: 'Email'),
          ),
          TextField(
            controller: _passwordController,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'Password'),
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(
              _error!,
              style: const TextStyle(color: Color(0xFF8E1E1E)),
            ),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _submit,
          child: const Text('Log In'),
        ),
      ],
    );
  }
}

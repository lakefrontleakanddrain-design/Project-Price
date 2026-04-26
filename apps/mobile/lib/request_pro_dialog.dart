import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

const List<String> projectPriceProjectTypes = [
  'Roofing',
  'Plumbing',
  'HVAC',
  'Electrical',
  'General Contractor',
  'Painting',
  'Flooring',
  'Windows and Doors',
  'Siding',
  'Landscaping',
];

class RequestProFormResult {
  const RequestProFormResult({
    required this.fullName,
    required this.email,
    required this.phone,
    required this.streetAddress,
    required this.zipCode,
    required this.projectType,
    required this.description,
  });

  final String fullName;
  final String email;
  final String phone;
  final String streetAddress;
  final String zipCode;
  final String projectType;
  final String description;
}

class RequestProDialog extends StatefulWidget {
  const RequestProDialog({
    super.key,
    required this.title,
    required this.submitLabel,
    this.initialFullName,
    this.initialEmail,
    this.initialPhone,
    this.initialStreetAddress,
    this.initialZipCode,
    this.initialProjectType,
    this.initialDescription,
  });

  final String title;
  final String submitLabel;
  final String? initialFullName;
  final String? initialEmail;
  final String? initialPhone;
  final String? initialStreetAddress;
  final String? initialZipCode;
  final String? initialProjectType;
  final String? initialDescription;

  @override
  State<RequestProDialog> createState() => _RequestProDialogState();
}

class _RequestProDialogState extends State<RequestProDialog> {
  late final TextEditingController _fullNameController;
  late final TextEditingController _emailController;
  late final TextEditingController _phoneController;
  late final TextEditingController _streetController;
  late final TextEditingController _zipController;
  late final TextEditingController _descriptionController;
  late String _selectedProjectType;
  String? _error;

  @override
  void initState() {
    super.initState();
    _fullNameController = TextEditingController(text: widget.initialFullName ?? '');
    _emailController = TextEditingController(text: widget.initialEmail ?? '');
    _phoneController = TextEditingController(text: widget.initialPhone ?? '');
    _streetController = TextEditingController(text: widget.initialStreetAddress ?? '');
    _zipController = TextEditingController(text: widget.initialZipCode ?? '');
    _descriptionController = TextEditingController(text: widget.initialDescription ?? '');
    _selectedProjectType = _normalizeProjectType(widget.initialProjectType);
  }

  @override
  void dispose() {
    _fullNameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _streetController.dispose();
    _zipController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  String _normalizeProjectType(String? value) {
    final normalized = (value ?? '').trim().toLowerCase();
    for (final item in projectPriceProjectTypes) {
      if (item.toLowerCase() == normalized) {
        return item;
      }
    }
    return projectPriceProjectTypes.first;
  }

  void _submit() {
    final fullName = _fullNameController.text.trim();
    final email = _emailController.text.trim();
    final phone = _phoneController.text.trim();
    final streetAddress = _streetController.text.trim();
    final zipCode = _zipController.text.trim();
    final description = _descriptionController.text.trim();

    if ([fullName, email, phone, streetAddress, zipCode, description]
        .any((value) => value.isEmpty)) {
      setState(() {
        _error = 'All fields are required to request a pro estimate.';
      });
      return;
    }

    Navigator.of(context).pop(
      RequestProFormResult(
        fullName: fullName,
        email: email,
        phone: phone,
        streetAddress: streetAddress,
        zipCode: zipCode,
        projectType: _selectedProjectType,
        description: description,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.title),
      content: GestureDetector(
        behavior: HitTestBehavior.translucent,
        onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
        child: SingleChildScrollView(
          child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
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
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _selectedProjectType,
              items: projectPriceProjectTypes
                  .map(
                    (value) => DropdownMenuItem<String>(
                      value: value,
                      child: Text(value),
                    ),
                  )
                  .toList(),
              onChanged: (value) {
                if (value == null) return;
                setState(() {
                  _selectedProjectType = value;
                });
              },
              decoration: const InputDecoration(labelText: 'Project type'),
            ),
            TextField(
              controller: _descriptionController,
              minLines: 4,
              maxLines: 6,
              decoration: const InputDecoration(labelText: 'Project description'),
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
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _submit,
          child: Text(widget.submitLabel),
        ),
      ],
    );
  }
}

String _projectPriceApiBaseUrl() {
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

Uri _projectPriceFunctionEndpoint(String functionName) {
  final rawBase = _projectPriceApiBaseUrl().trim();
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

Future<Map<String, dynamic>> fetchProjectPriceLead({
  String? userId,
  String? projectId,
  required RequestProFormResult form,
}) async {
  final endpoint = _projectPriceFunctionEndpoint('project-price-submit-lead');
  final response = await http
      .post(
        endpoint,
        headers: const {'Content-Type': 'application/json'},
        body: jsonEncode({
          'userId': userId,
          'projectId': projectId,
          'fullName': form.fullName,
          'email': form.email,
          'phone': form.phone,
          'streetAddress': form.streetAddress,
          'zipCode': form.zipCode,
          'projectType': form.projectType,
          'description': form.description,
        }),
      )
      .timeout(const Duration(seconds: 45));

  final decoded = jsonDecode(response.body) as Map<String, dynamic>;
  if (response.statusCode >= 400) {
    throw Exception(
      (decoded['error'] as String?) ?? 'Unable to request a pro estimate.',
    );
  }

  return decoded;
}
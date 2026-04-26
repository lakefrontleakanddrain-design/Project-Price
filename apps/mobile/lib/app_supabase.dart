import 'package:supabase_flutter/supabase_flutter.dart';

const _supabaseUrl = String.fromEnvironment(
  'PROJECTPRICE_SUPABASE_URL',
  defaultValue: '',
);
const _supabaseAnonKey = String.fromEnvironment(
  'PROJECTPRICE_SUPABASE_ANON_KEY',
  defaultValue: '',
);

bool get isSupabaseConfigured {
  return _supabaseUrl.isNotEmpty &&
      _supabaseAnonKey.isNotEmpty &&
      !_supabaseUrl.startsWith('PLACEHOLDER_') &&
      !_supabaseAnonKey.startsWith('PLACEHOLDER_');
}

Future<void> initializeProjectPriceSupabase() async {
  if (!isSupabaseConfigured) {
    return;
  }

  await Supabase.initialize(
    url: _supabaseUrl,
    anonKey: _supabaseAnonKey,
  );
}

SupabaseClient? get projectPriceSupabase {
  if (!isSupabaseConfigured) {
    return null;
  }

  return Supabase.instance.client;
}

class HomeownerAccessException implements Exception {
  const HomeownerAccessException(this.message);

  final String message;

  @override
  String toString() => message;
}

const _homeownerOnlyMessage =
    'Only homeowner accounts can sign in to the mobile app. Professionals should use the pro portal.';

class HomeownerAccount {
  const HomeownerAccount({
    required this.userId,
    required this.email,
    required this.fullName,
    required this.phone,
    required this.streetAddress,
    required this.zipCode,
  });

  final String userId;
  final String email;
  final String fullName;
  final String phone;
  final String streetAddress;
  final String zipCode;
}

Future<Map<String, dynamic>?> _loadCurrentUserRow(
  SupabaseClient client,
  String userId,
) async {
  try {
    return await client
        .from('users')
        .select('id,role,full_name,phone,zip_code,street_address')
        .eq('id', userId)
        .maybeSingle();
  } catch (error) {
    final text = error.toString();
    if (!text.contains('street_address')) {
      rethrow;
    }

    return client
        .from('users')
        .select('id,role,full_name,phone,zip_code')
        .eq('id', userId)
        .maybeSingle();
  }
}

Future<void> _ensureHomeownerAccess(
  SupabaseClient client,
  User authUser,
) async {
  final userRow = await _loadCurrentUserRow(client, authUser.id);
  final role = userRow?['role']?.toString().trim().toLowerCase();
  if (role != null && role.isNotEmpty && role != 'homeowner') {
    await client.auth.signOut();
    throw const HomeownerAccessException(_homeownerOnlyMessage);
  }
}

Future<HomeownerAccount?> loadCurrentHomeowner() async {
  final client = projectPriceSupabase;
  final authUser = client?.auth.currentUser;
  if (client == null || authUser == null || authUser.email == null) {
    return null;
  }

  final userRow = await _loadCurrentUserRow(client, authUser.id);
  final role = userRow?['role']?.toString().trim().toLowerCase();
  if (role != null && role.isNotEmpty && role != 'homeowner') {
    await client.auth.signOut();
    throw const HomeownerAccessException(_homeownerOnlyMessage);
  }

  return HomeownerAccount(
    userId: authUser.id,
    email: authUser.email!.trim().toLowerCase(),
    fullName: userRow?['full_name']?.toString() ?? '',
    phone: userRow?['phone']?.toString() ?? '',
    streetAddress: userRow?['street_address']?.toString() ?? '',
    zipCode: userRow?['zip_code']?.toString() ?? '',
  );
}

Future<AuthResponse> signInHomeowner({
  required String email,
  required String password,
}) async {
  final client = projectPriceSupabase;
  if (client == null) {
    throw Exception('Supabase mobile auth is not configured.');
  }

  final response = await client.auth.signInWithPassword(
    email: email.trim(),
    password: password,
  );

  final authUser = response.user;
  if (authUser != null) {
    await _ensureHomeownerAccess(client, authUser);
  }

  return response;
}

Future<void> signOutHomeowner() async {
  final client = projectPriceSupabase;
  if (client == null) {
    return;
  }

  await client.auth.signOut();
}

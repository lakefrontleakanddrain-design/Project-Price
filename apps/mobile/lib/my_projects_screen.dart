import 'package:flutter/material.dart';
import 'package:projectprice_app/app_supabase.dart';
import 'package:projectprice_app/legal_notice_card.dart';
import 'package:projectprice_app/project_price_legal.dart';
import 'package:projectprice_app/request_pro_dialog.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class MyProjectsScreen extends StatefulWidget {
  const MyProjectsScreen({
    super.key,
    this.initialEmail,
    this.findProMode = false,
  });

  final String? initialEmail;
  final bool findProMode;

  @override
  State<MyProjectsScreen> createState() => _MyProjectsScreenState();
}

class _MyProjectsScreenState extends State<MyProjectsScreen> {
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  bool _isLoading = false;
  bool _isRequesting = false;
  String? _errorMessage;
  HomeownerAccount? _homeownerInfo;
  List<Map<String, dynamic>> _projects = const [];

  @override
  void initState() {
    super.initState();
    _emailController.text = widget.initialEmail ?? '';
    _bootstrap();
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  User? get _currentUser => projectPriceSupabase?.auth.currentUser;

  Future<void> _bootstrap() async {
    if (!isSupabaseConfigured || _currentUser == null) {
      return;
    }

    await _loadProjects();
  }

  Future<void> _loadProjects() async {
    final client = projectPriceSupabase;
    final authUser = _currentUser;
    if (client == null || authUser == null) {
      setState(() {
        _errorMessage = 'Sign in to load saved projects.';
      });
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final homeowner = await loadCurrentHomeowner();
      final projectRows = await client
          .from('projects')
          .select(
            'id,name,project_type,zip_code,description,estimated_cost_range,created_at,photo_url',
          )
          .eq('owner_id', authUser.id)
          .order('created_at', ascending: false);

      if (mounted) {
        setState(() {
          _homeownerInfo = homeowner;
          _projects = (projectRows as List<dynamic>)
              .whereType<Map<String, dynamic>>()
              .toList();
        });
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
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _signIn() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text.trim();
    if (email.isEmpty || password.isEmpty) {
      setState(() {
        _errorMessage = 'Email and password are required.';
      });
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      await signInHomeowner(email: email, password: password);
      if (mounted) {
        await _loadProjects();
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
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _signOut() async {
    await signOutHomeowner();
    if (!mounted) {
      return;
    }

    setState(() {
      _homeownerInfo = null;
      _projects = const [];
      _passwordController.clear();
      _errorMessage = null;
    });
  }

  Future<void> _openRequestDialog(Map<String, dynamic> project) async {
    final homeowner = _homeownerInfo;
    if (homeowner == null) {
      return;
    }

    final result = await showDialog<RequestProFormResult>(
      context: context,
      builder: (_) => RequestProDialog(
        title: 'Request exact quote from a pro',
        submitLabel: 'Request From A Pro',
        initialFullName: homeowner.fullName,
        initialEmail: homeowner.email,
        initialPhone: homeowner.phone,
        initialStreetAddress: homeowner.streetAddress,
        initialZipCode: project['zip_code']?.toString() ?? homeowner.zipCode,
        initialProjectType: project['project_type']?.toString(),
        initialDescription: project['description']?.toString(),
      ),
    );

    if (result == null) {
      return;
    }

    await _requestFromPro(project, result);
  }

  Future<void> _requestFromPro(
    Map<String, dynamic> project,
    RequestProFormResult form,
  ) async {
    final homeowner = _homeownerInfo;
    if (homeowner == null) {
      return;
    }

    setState(() {
      _isRequesting = true;
      _errorMessage = null;
    });

    try {
      final response = await fetchProjectPriceLead(
        userId: homeowner.userId,
        projectId: project['id']?.toString(),
        form: form,
      );

      if (!mounted) {
        return;
      }

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            response['message']?.toString() ?? 'Lead submitted.',
          ),
        ),
      );
      await _loadProjects();
    } catch (error) {
      if (mounted) {
        setState(() {
          _errorMessage = error.toString().replaceFirst('Exception: ', '');
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _isRequesting = false;
        });
      }
    }
  }

  Future<void> _openQuickRequestDialog() async {
    final result = await showDialog<RequestProFormResult>(
      context: context,
      builder: (_) => RequestProDialog(
        title: 'Request exact quote from a pro',
        submitLabel: 'Request From A Pro',
        initialEmail: _emailController.text.trim().isEmpty
            ? null
            : _emailController.text.trim(),
      ),
    );

    if (result == null) {
      return;
    }

    setState(() {
      _isRequesting = true;
      _errorMessage = null;
    });

    try {
      final response = await fetchProjectPriceLead(form: result);
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(response['message']?.toString() ?? 'Lead submitted.'),
        ),
      );
    } catch (error) {
      if (mounted) {
        setState(() {
          _errorMessage = error.toString().replaceFirst('Exception: ', '');
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _isRequesting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasSession = _currentUser != null;

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
            Text(widget.findProMode ? 'Find a Pro' : 'My Projects'),
          ],
        ),
        actions: [
          if (hasSession)
            TextButton(
              onPressed: _isLoading ? null : _signOut,
              child: const Text('Sign out'),
            ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (!isSupabaseConfigured) ...[
                Text(
                  widget.findProMode
                      ? 'Find a Pro is available without homeowner sign-in in this build.'
                      : 'Mobile homeowner auth is not configured for this build.',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 12),
                Text(
                  widget.findProMode
                      ? 'Use the button below to submit your request directly. Saved-project login remains unavailable until Supabase defines are provided.'
                      : 'Build with PROJECTPRICE_SUPABASE_URL and PROJECTPRICE_SUPABASE_ANON_KEY dart defines to enable persistent homeowner sign-in.',
                ),
                if (widget.findProMode) ...[
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _isRequesting ? null : _openQuickRequestDialog,
                      icon: const Icon(Icons.handyman_outlined),
                      label: Text(
                        _isRequesting
                            ? 'Requesting...'
                            : 'Request Exact Quote From A Pro',
                      ),
                    ),
                  ),
                ],
              ] else if (!hasSession) ...[
                Text(
                  widget.findProMode
                      ? 'Sign in to choose a saved project and request an exact quote from a pro.'
                      : 'Sign in to load your saved projects.',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                    labelText: 'Email',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _passwordController,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Password',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 14),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _isLoading ? null : _signIn,
                    child: Text(_isLoading ? 'Signing in...' : 'Sign In'),
                  ),
                ),
                const SizedBox(height: 10),
                const Text(
                  'Homeowner login only. Pros should use the pro portal.',
                ),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: () {
                      Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => const ProjectPriceLegalScreen(),
                        ),
                      );
                    },
                    icon: const Icon(Icons.policy_outlined),
                    label: const Text('Legal & Privacy'),
                  ),
                ),
              ] else ...[
                Text(
                  widget.findProMode
                      ? 'Choose a saved project below to request one exact quote from a pro.'
                      : 'Review the projects saved to your homeowner account.',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 14),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _isLoading ? null : _loadProjects,
                    child: Text(
                      _isLoading
                          ? 'Loading...'
                          : widget.findProMode
                              ? 'Refresh Saved Projects'
                              : 'Refresh My Projects',
                    ),
                  ),
                ),
              ],
              if (_errorMessage != null) ...[
                const SizedBox(height: 14),
                Text(
                  _errorMessage!,
                  style: const TextStyle(color: Color(0xFF8E1E1E)),
                ),
              ],
              if (_homeownerInfo != null) ...[
                const SizedBox(height: 20),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF6FBFF),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: const Color(0xFFD6E6FF)),
                  ),
                  child: Text(
                    '${_homeownerInfo!.fullName}\n${_homeownerInfo!.streetAddress} ${_homeownerInfo!.zipCode}\n${_homeownerInfo!.email}',
                  ),
                ),
              ],
              const SizedBox(height: 18),
              if (hasSession && !_isLoading && _projects.isEmpty)
                Text(
                  widget.findProMode
                      ? 'No saved projects yet. Save one from Price a Project first, then come back here to request a pro estimate.'
                      : 'No saved projects yet. Save one from Price a Project.',
                ),
              ..._projects.map(
                (project) {
                  return Container(
                    width: double.infinity,
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: const Color(0xFFE4ECF8)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          project['name']?.toString() ?? 'Saved project',
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        if ((project['photo_url'] as String?)?.isNotEmpty == true) ...[
                          const SizedBox(height: 8),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: Image.network(
                              project['photo_url'] as String,
                              height: 160,
                              width: double.infinity,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                            ),
                          ),
                        ],
                        const SizedBox(height: 4),
                        Text(project['estimated_cost_range']?.toString() ?? ''),
                        const SizedBox(height: 4),
                        Text(project['description']?.toString() ?? ''),
                        const SizedBox(height: 12),
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton.icon(
                            onPressed:
                                _isRequesting ? null : () => _openRequestDialog(project),
                            icon: const Icon(Icons.handyman_outlined),
                            label: Text(
                              _isRequesting
                                  ? 'Requesting...'
                                  : 'Request Exact Quote From A Pro',
                            ),
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
              const SizedBox(height: 8),
              const LegalNoticeCard(),
            ],
          ),
        ),
      ),
    );
  }
}

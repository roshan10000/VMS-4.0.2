/* =============================================================================
 *  VMS  ·  Login page
 * ============================================================================= */

(function () {
  const form  = document.getElementById('login-form');
  const error = document.getElementById('login-error');
  const btn   = document.getElementById('login-btn');

  // If already logged in, skip to dashboard.
  if (Auth.user()) {
    location.href = 'pages/dashboard.html';
    return;
  }

  // Surface expired-session message
  if (new URLSearchParams(location.search).get('expired') === '1') {
    showError('Your session expired. Please sign in again.');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const username = form.username.value.trim();
    const password = form.password.value;

    if (!username || !password) {
      showError('Username and password are required.');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span><span>Signing in…</span>';

    try {
      const data = await Auth.login(username, password);
      // small delay so the spinner registers — better UX than a hard flicker
      setTimeout(() => {
        if (data.role === 'Admin') location.href = 'pages/admin.html';
        else                        location.href = 'pages/dashboard.html';
      }, 200);
    } catch (err) {
      showError(err.message || 'Sign-in failed.');
      btn.disabled = false;
      btn.innerHTML = 'Sign in';
    }
  });

  function showError(msg) {
    error.textContent = msg;
    error.classList.add('show');
  }
  function hideError() {
    error.classList.remove('show');
  }
})();

<script>
	import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-svelte';
	import heroImage from '../../assets/hero.png';
	import { loginWithCredentials } from '../lib/auth.js';

	const PENDING_REDIRECT_STORAGE_KEY = 'ims-pending-redirect';

	let email = '';
	let password = '';
	let showPassword = false;
	let message = '';
	let error = '';

	function readPendingRedirectIntent() {
		let pending = null;

		try {
			const raw = window.sessionStorage.getItem(PENDING_REDIRECT_STORAGE_KEY);
			if (raw) {
				pending = JSON.parse(raw);
			}
		} catch {
			pending = null;
		}

		try {
			window.sessionStorage.removeItem(PENDING_REDIRECT_STORAGE_KEY);
		} catch {
			// Ignore cleanup errors.
		}

		if (pending && String(pending.page || '').toLowerCase() === 'requests') {
			return {
				page: 'requests',
				requestId: String(pending.requestId || '').trim(),
			};
		}

		const params = new URLSearchParams(window.location.search || '');
		const page = String(params.get('page') || '').trim().toLowerCase();
		if (page !== 'requests') {
			return null;
		}

		return {
			page: 'requests',
			requestId: String(params.get('requestId') || '').trim(),
		};
	}

	function applyPostLoginRedirect(user) {
		const role = String(user?.role || '').trim().toLowerCase();
		const fallbackPath = role === 'supervisor' ? '/supervisor' : '/';
		const intent = readPendingRedirectIntent();

		if (!intent || intent.page !== 'requests') {
			window.location.hash = fallbackPath;
			return;
		}

		const targetPath = role === 'supervisor' ? '/supervisor/requests' : '/requests';
		const params = new URLSearchParams();
		params.set('page', 'requests');
		if (intent.requestId) {
			params.set('requestId', intent.requestId);
		}

		window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
		window.location.hash = targetPath;
	}

	async function handleLogin() {
		error = '';
		message = '';

		if (!email || !password) {
			error = 'Please enter your email/username and password.';
			return;
		}

		try {
			const user = await loginWithCredentials(email, password);
			message = 'Authenticated successfully. Redirecting...';
			setTimeout(() => {
				applyPostLoginRedirect(user);
			}, 420);
		} catch (err) {
			error = err?.message || 'Invalid credentials. Please try again.';
		}
	}

	function handleForgotPassword() {
		error = '';
		message = email
			? `If an account exists for ${email}, recovery instructions have been sent.`
			: 'Enter your email address first so we can process account recovery.';
	}

	function goToSignup() {
		window.location.hash = '/signup';
	}
</script>

<section class="login-shell" style={`--bg-image: url(${heroImage});`}>
	<div class="page-content">
		<section class="brand-panel">
			<h1>Internship Management System</h1>
			<p>
				Securely manage internship progress, approvals, and hour tracking with a platform built for telecom-level
				operations.
			</p>
		</section>

		<form class="login-card" on:submit|preventDefault={handleLogin}>
			<header class="card-head">
				<h2>Log In</h2>
				<p>Sign in to manage OJT records, approvals, and progress.</p>
			</header>

			<label class="field">
				<span>Email</span>
				<div class="input-wrap">
					<span class="input-icon"><Mail size={16} strokeWidth={2.2} /></span>
					<input bind:value={email} type="text" autocomplete="username" placeholder="Enter your email address" />
				</div>
			</label>

			<label class="field">
				<span>Password</span>
				<div class="input-wrap password-wrap">
					<span class="input-icon"><LockKeyhole size={16} strokeWidth={2.2} /></span>
					<input
						bind:value={password}
						type={showPassword ? 'text' : 'password'}
						autocomplete="current-password"
						placeholder="Enter your password"
					/>
					<button
						type="button"
						class="toggle-password"
						on:click={() => (showPassword = !showPassword)}
						aria-label={showPassword ? 'Hide password' : 'Show password'}
					>
						{#if showPassword}
							<EyeOff size={16} />
						{:else}
							<Eye size={16} />
						{/if}
					</button>
				</div>
			</label>

			<div class="link-row">
				<button type="button" class="text-link" on:click={handleForgotPassword}>Forgot Password?</button>
			</div>

			{#if error}
				<p class="feedback error">{error}</p>
			{/if}

			{#if message}
				<p class="feedback success">{message}</p>
			{/if}

			<button class="login-btn" type="submit">Log In</button>

			<p class="signup-row">
				Need access?
				<button type="button" class="text-link strong" on:click={goToSignup}>Create Account</button>
			</p>
		</form>
	</div>
</section>

<style>
	.login-shell {
		position: relative;
		width: 100%;
		height: 100dvh;
		min-height: 100vh;
		background: #020617;
		isolation: isolate;
		overflow: hidden;
	}

	.login-shell::before {
		content: '';
		position: absolute;
		inset: -1.2rem;
		background-image: var(--bg-image);
		background-size: cover;
		background-position: center;
		filter: blur(9px) saturate(1.1);
		transform: scale(1.06);
		z-index: -3;
	}

	.login-shell::after {
		content: '';
		position: absolute;
		inset: 0;
		background:
			radial-gradient(circle at 78% 45%, rgba(76, 124, 255, 0.26) 0%, rgba(76, 124, 255, 0) 52%),
			linear-gradient(105deg, rgba(5, 11, 30, 0.82) 18%, rgba(5, 17, 42, 0.66) 58%, rgba(9, 13, 36, 0.87) 100%);
		z-index: -2;
	}

	.page-content {
		width: min(1240px, 100%);
		box-sizing: border-box;
		min-height: 100vh;
		margin: 0 auto;
		padding: clamp(1rem, 3.8vw, 3.5rem);
		display: grid;
		grid-template-columns: minmax(250px, 1fr) minmax(320px, 460px);
		align-items: center;
		gap: clamp(1.4rem, 4vw, 3.4rem);
	}

	.brand-panel {
		max-width: 540px;
		color: #e2e8f0;
		padding-inline: clamp(0rem, 2vw, 1.6rem);
	}

	.brand-kicker {
		margin: 0;
		font-size: 0.76rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #c7d2fe;
	}

	.brand-panel h1 {
		margin: 0.8rem 0 0;
		font-size: clamp(2rem, 5vw, 3.4rem);
		line-height: 1.06;
		letter-spacing: -0.02em;
		color: #f8fafc;
	}

	.brand-panel p {
		margin: 1rem 0 0;
		line-height: 1.68;
		color: rgba(226, 232, 240, 0.9);
		max-width: 44ch;
	}

	.login-card {
		position: relative;
		padding: clamp(1.15rem, 2.5vw, 1.9rem);
		border-radius: 1.35rem;
		background: linear-gradient(150deg, rgba(255, 255, 255, 0.19) 0%, rgba(233, 239, 255, 0.08) 100%);
		border: 1px solid rgba(226, 232, 240, 0.42);
		backdrop-filter: blur(16px);
		box-shadow:
			0 22px 50px -28px rgba(11, 22, 66, 0.9),
			0 0 0 1px rgba(255, 255, 255, 0.08) inset;
		display: flex;
		flex-direction: column;
		gap: 0.88rem;
	}

	.card-head h2 {
		margin: 0.22rem 0 0;
		font-size: 1.65rem;
		line-height: 1.2;
		letter-spacing: -0.01em;
		color: #f8fafc;
	}

	.card-head p {
		margin: 0.38rem 0 0;
		color: #cbd5e1;
		font-size: 0.94rem;
	}

	.product-tag {
		margin: 0;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #bfdbfe;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.field span {
		color: #e2e8f0;
		font-weight: 600;
		font-size: 0.83rem;
	}

	.input-wrap {
		position: relative;
	}

	.input-icon {
		position: absolute;
		left: 0.76rem;
		top: 50%;
		transform: translateY(-50%);
		color: #cbd5e1;
		pointer-events: none;
	}

	input {
		width: 100%;
		height: 2.82rem;
		border-radius: 0.84rem;
		border: 1px solid rgba(203, 213, 225, 0.36);
		background: rgba(15, 23, 42, 0.5);
		padding: 0.66rem 0.9rem 0.66rem 2.45rem;
		color: #f8fafc;
		font-size: 0.95rem;
		outline: none;
		transition: border-color 160ms ease, box-shadow 180ms ease, background-color 160ms ease;
	}

	input::placeholder {
		color: #94a3b8;
	}

	input:focus {
		border-color: rgba(129, 140, 248, 0.85);
		box-shadow:
			0 0 0 3px rgba(79, 70, 229, 0.28),
			0 10px 20px -16px rgba(76, 124, 255, 0.62);
		background: rgba(15, 23, 42, 0.7);
	}

	.password-wrap input {
		padding-right: 2.75rem;
	}

	.toggle-password {
		position: absolute;
		right: 0.52rem;
		top: 50%;
		transform: translateY(-50%);
		width: 2rem;
		height: 2rem;
		border-radius: 0.6rem;
		border: 0;
		background: transparent;
		color: #cbd5e1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background-color 160ms ease, color 160ms ease;
	}

	.toggle-password:hover {
		background: rgba(148, 163, 184, 0.18);
		color: #f8fafc;
	}

	.link-row {
		display: flex;
		justify-content: flex-end;
	}

	.text-link {
		border: 0;
		background: transparent;
		padding: 0;
		cursor: pointer;
		font-size: 0.9rem;
		color: #cbd5e1;
		transition: color 150ms ease, text-shadow 150ms ease;
	}

	.text-link:hover {
		color: #e2e8f0;
		text-shadow: 0 0 12px rgba(99, 102, 241, 0.38);
	}

	.text-link.strong {
		font-weight: 700;
		color: #93c5fd;
		margin-left: 0.3rem;
	}

	.text-link.strong:hover {
		color: #c4b5fd;
	}

	.login-btn {
		position: relative;
		height: 2.95rem;
		border-radius: 0.9rem;
		border: 0;
		font-size: 0.98rem;
		font-weight: 700;
		letter-spacing: 0.01em;
		color: #ffffff;
		background: linear-gradient(100deg, #0057ff 0%, #4f46e5 52%, #7c3aed 100%);
		cursor: pointer;
		transition: transform 140ms ease, box-shadow 170ms ease, filter 170ms ease;
		box-shadow: 0 18px 38px -20px rgba(79, 70, 229, 0.95);
	}

	.login-btn:hover {
		transform: translateY(-1px);
		filter: brightness(1.04);
		box-shadow: 0 22px 44px -24px rgba(124, 58, 237, 0.9);
	}

	.login-btn:active {
		transform: translateY(1px) scale(0.996);
	}

	.feedback {
		margin: 0;
		border-radius: 0.72rem;
		padding: 0.62rem 0.76rem;
		font-size: 0.84rem;
	}

	.feedback.error {
		border: 1px solid rgba(248, 113, 113, 0.55);
		background: rgba(127, 29, 29, 0.42);
		color: #fecaca;
	}

	.feedback.success {
		border: 1px solid rgba(74, 222, 128, 0.42);
		background: rgba(20, 83, 45, 0.4);
		color: #bbf7d0;
	}

	.signup-row {
		margin: 0.25rem 0 0;
		text-align: center;
		font-size: 0.9rem;
		color: #cbd5e1;
	}

	@media (max-width: 980px) {
		.page-content {
			grid-template-columns: 1fr;
			justify-items: center;
			gap: 1.2rem;
		}

		.brand-panel {
			text-align: center;
			max-width: 680px;
		}

		.brand-panel p {
			max-width: 100%;
		}

		.login-card {
			width: min(460px, 100%);
		}
	}

	@media (max-width: 640px) {
		.page-content {
			padding: 0.9rem;
		}

		.brand-panel {
			display: none;
		}

		.login-card {
			padding: 1rem;
			width: 100%;
		}
	}
</style>

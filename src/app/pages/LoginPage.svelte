<script>
	import { Eye, EyeOff } from 'lucide-svelte';
	import { loginWithCredentials } from '../lib/auth.js';

	let email = '';
	let password = '';
	let showPassword = false;
	let message = '';
	let error = '';

	function isValidEmail(value) {
		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
	}

	async function handleLogin() {
		error = '';
		message = '';

		if (!email || !password) {
			error = 'Please enter your email and password.';
			return;
		}

		if (!isValidEmail(email)) {
			error = 'Please enter a valid email address.';
			return;
		}

		try {
			await loginWithCredentials(email, password);
			message = 'Logged in successfully. Redirecting...';
			setTimeout(() => {
				window.location.hash = '/';
			}, 450);
		} catch (err) {
			error = err?.message || 'Invalid email or password. Please try again.';
		}
	}

	function handleForgotPassword() {
		error = '';
		message = email
			? `Password recovery link sent to ${email}.`
			: 'Enter your email first so we can send a recovery link.';
	}

	function goToSignup() {
		window.location.hash = '/signup';
	}
</script>

<section class="auth-shell">
	<div class="auth-card">
		<aside class="auth-visual">
			<p class="eyebrow">Internship Management System</p>
			<h1>Manage internship progress with confidence.</h1>
			<p class="subcopy">Track hours, review milestones, and keep your OJT workflow organized in one place.</p>
			<div class="dots">
				<span></span>
				<span></span>
				<span></span>
			</div>
		</aside>

		<form class="auth-form" on:submit|preventDefault={handleLogin}>
			<div class="form-head">
				<h2>Log In</h2>
				<p>Welcome back. Please sign in to continue.</p>
			</div>

			<label>
				<span>Email</span>
				<input bind:value={email} type="email" autocomplete="email" />
			</label>

			<label>
				<span>Password</span>
				<div class="password-wrap">
					<input bind:value={password} type={showPassword ? 'text' : 'password'} autocomplete="current-password" />
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

			{#if error}
				<p class="feedback error">{error}</p>
			{/if}

			{#if message}
				<p class="feedback success">{message}</p>
			{/if}

			<button class="primary" type="submit">Log In</button>

			<div class="links">
				<button type="button" class="text-link" on:click={handleForgotPassword}>Forgot Password?</button>
				<button type="button" class="text-link strong" on:click={goToSignup}>Create Account</button>
			</div>
		</form>
	</div>
</section>

<style>
	.auth-shell {
		min-height: 100vh;
		padding: clamp(1rem, 3vw, 2.5rem);
		background: radial-gradient(circle at top right, #dbeafe 0%, #eff6ff 28%, #f8fafc 55%, #ffffff 100%);
		display: grid;
		place-items: center;
	}

	.auth-card {
		width: min(980px, 100%);
		background: #ffffff;
		border: 1px solid #dbe4ff;
		border-radius: 1.25rem;
		box-shadow: 0 28px 54px -38px rgba(15, 23, 42, 0.34);
		display: grid;
		grid-template-columns: 1.1fr 1fr;
		overflow: hidden;
	}

	.auth-visual {
		padding: clamp(1.5rem, 4vw, 3rem);
		background: linear-gradient(145deg, #1e3a8a 0%, #312e81 46%, #4f46e5 100%);
		color: #e0e7ff;
	}

	.eyebrow {
		margin: 0;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		font-size: 0.72rem;
		font-weight: 700;
		color: #c7d2fe;
	}

	.auth-visual h1 {
		margin: 0.8rem 0 0;
		font-size: clamp(1.45rem, 2.2vw, 2rem);
		line-height: 1.22;
		color: #ffffff;
	}

	.subcopy {
		margin-top: 0.9rem;
		color: #cbd5ff;
		line-height: 1.55;
		max-width: 34ch;
	}

	.dots {
		margin-top: 1.4rem;
		display: flex;
		gap: 0.5rem;
	}

	.dots span {
		width: 0.58rem;
		height: 0.58rem;
		border-radius: 999px;
		background: rgba(224, 231, 255, 0.74);
	}

	.auth-form {
		padding: clamp(1.3rem, 4vw, 2.5rem);
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.form-head h2 {
		margin: 0;
		color: #0f172a;
		font-size: 1.5rem;
		font-weight: 700;
	}

	.form-head p {
		margin: 0.35rem 0 0;
		color: #475569;
		font-size: 0.93rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	label span {
		color: #334155;
		font-size: 0.85rem;
		font-weight: 600;
	}

	input {
		width: 100%;
		border-radius: 0.8rem;
		border: 1px solid #c7d2fe;
		background: #f8faff;
		padding: 0.8rem 0.95rem;
		color: #0f172a;
		outline: none;
		transition: border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease;
	}

	input:focus {
		border-color: #6366f1;
		box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.18);
		background: #ffffff;
	}

	.password-wrap {
		position: relative;
	}

	.password-wrap input {
		padding-right: 2.7rem;
	}

	.toggle-password {
		position: absolute;
		right: 0.55rem;
		top: 50%;
		transform: translateY(-50%);
		width: 2rem;
		height: 2rem;
		border: 0;
		border-radius: 0.6rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		color: #64748b;
		cursor: pointer;
	}

	.toggle-password:hover {
		background: #e2e8f0;
		color: #334155;
	}

	.feedback {
		margin: 0;
		padding: 0.65rem 0.75rem;
		border-radius: 0.7rem;
		font-size: 0.84rem;
	}

	.feedback.error {
		background: #fee2e2;
		border: 1px solid #fca5a5;
		color: #b91c1c;
	}

	.feedback.success {
		background: #dcfce7;
		border: 1px solid #86efac;
		color: #166534;
	}

	.primary {
		margin-top: 0.15rem;
		width: 100%;
		border-radius: 0.85rem;
		border: 0;
		padding: 0.82rem 0.95rem;
		background: linear-gradient(90deg, #4338ca 0%, #4f46e5 100%);
		color: #ffffff;
		font-weight: 700;
		cursor: pointer;
		transition: transform 140ms ease, box-shadow 140ms ease;
	}

	.primary:hover {
		transform: translateY(-1px);
		box-shadow: 0 16px 28px -20px rgba(67, 56, 202, 0.75);
	}

	.links {
		margin-top: 0.1rem;
		display: flex;
		justify-content: space-between;
		gap: 0.8rem;
		flex-wrap: wrap;
	}

	.text-link {
		color: #475569;
		background: transparent;
		border: 0;
		padding: 0;
		font-size: 0.9rem;
		cursor: pointer;
	}

	.text-link.strong {
		color: #4338ca;
		font-weight: 700;
	}

	@media (max-width: 880px) {
		.auth-card {
			grid-template-columns: 1fr;
		}

		.auth-visual {
			min-height: 170px;
		}
	}

	:global(.dark) .auth-shell {
		background: radial-gradient(circle at top right, #111827 0%, #0f172a 42%, #020617 100%);
	}

	:global(.dark) .auth-card {
		background: #111827;
		border-color: #334155;
	}

	:global(.dark) .form-head h2,
	:global(.dark) label span {
		color: #f8fafc;
	}

	:global(.dark) .form-head p,
	:global(.dark) .text-link {
		color: #cbd5e1;
	}

	:global(.dark) input {
		background: #1e293b;
		border-color: #334155;
		color: #f8fafc;
	}

	:global(.dark) .toggle-password {
		color: #94a3b8;
	}

	:global(.dark) .toggle-password:hover {
		background: #334155;
		color: #e2e8f0;
	}

	:global(.dark) input:focus {
		border-color: #818cf8;
		box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.23);
	}

	:global(.dark) .text-link.strong {
		color: #a5b4fc;
	}
</style>

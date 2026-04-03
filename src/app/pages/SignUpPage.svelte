<script>
	import { Eye, EyeOff } from 'lucide-svelte';
	import { registerAccount, upsertStudentOjtProfile } from '../lib/auth.js';

	let name = '';
	let email = '';
	let password = '';
	let confirmPassword = '';
	let showPassword = false;
	let showConfirmPassword = false;
	let role = 'Student';
	let error = '';
	let info = '';
	let stage = 'account';

	let totalHours = '';
	let startDate = '';
	let estimatedEndDate = '';
	let course = '';
	let school = '';
	let showCourseSuggestions = false;
	let showSchoolSuggestions = false;

	const courseCatalog = [
		'BS Computer Engineering',
		'BS Civil Engineering',
		'BS Information Technology',
		'BS Computer Science',
		'BS Information Systems',
		'BS Electrical Engineering',
		'BS Mechanical Engineering',
		'BS Industrial Engineering',
		'BS Accountancy',
		'BS Business Administration',
		'BS Hospitality Management',
		'BS Nursing'
	];

	const schoolCatalog = [
		'University of Michigan',
		'University of Mindanao',
		'University of the Philippines',
		'Ateneo de Davao University',
		'De La Salle University',
		'Mapua University',
		'University of San Carlos',
		'University of Santo Tomas',
		'Mindanao State University',
		'Polytechnic University of the Philippines',
		'Cebu Institute of Technology University',
		'University of Southeastern Philippines'
	];

	function isValidEmail(value) {
		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
	}

	function goBackToLogin() {
		window.location.hash = '/login';
	}

	async function submitAccount() {
		error = '';
		info = '';

		if (!name || !email || !password || !confirmPassword || !role) {
			error = 'Please complete name, email, password, and role.';
			return;
		}

		if (!isValidEmail(email)) {
			error = 'Please provide a valid email address.';
			return;
		}

		if (password.length < 8) {
			error = 'Password must be at least 8 characters long.';
			return;
		}

		if (password !== confirmPassword) {
			error = 'Password and confirm password do not match.';
			return;
		}

		if (role === 'Supervisor') {
			try {
				await registerAccount({
					name,
					email,
					password,
					role,
				});
				stage = 'success';
				info = 'You have successfully created your account. You can now log in.';
			} catch (err) {
				error = err?.message || 'Unable to create account right now.';
			}
			return;
		}

		stage = 'ojt';
		info = 'Great. Complete OJT setup to finish your Student signup.';
	}

	async function submitStudentSignup() {
		error = '';
		info = '';

		if (!totalHours || !startDate || !estimatedEndDate || !course || !school) {
			error = 'Please complete all OJT setup details.';
			return;
		}

		if (Number(totalHours) <= 0) {
			error = 'Total OJT hours must be greater than zero.';
			return;
		}

		try {
			const user = await registerAccount({
				name,
				email,
				password,
				role,
			});

			await upsertStudentOjtProfile({
				user_id: user?.user_id,
				total_ojt_hours: Number(totalHours),
				start_date: startDate,
				estimated_end_date: estimatedEndDate,
				course,
				school,
			});

			stage = 'success';
			info = 'You have successfully created your account. You can now log in.';
		} catch (err) {
			error = err?.message || 'Unable to create account right now.';
		}
	}

	function backToAccountStep() {
		stage = 'account';
		error = '';
		info = '';
	}

	function filterSuggestions(options, query) {
		const term = query.trim().toLowerCase();

		if (!term) {
			return [];
		}

		return options.filter((option) => option.toLowerCase().includes(term)).slice(0, 8);
	}

	function selectCourse(value) {
		course = value;
		showCourseSuggestions = false;
	}

	function selectSchool(value) {
		school = value;
		showSchoolSuggestions = false;
	}

	function hideCourseSuggestions() {
		setTimeout(() => {
			showCourseSuggestions = false;
		}, 100);
	}

	function hideSchoolSuggestions() {
		setTimeout(() => {
			showSchoolSuggestions = false;
		}, 100);
	}

	$: filteredCourses = filterSuggestions(courseCatalog, course);
	$: filteredSchools = filterSuggestions(schoolCatalog, school);
</script>

<section class="signup-shell">
	<div class="signup-card">
		<header class="signup-head">
			<p class="eyebrow">Internship Management System</p>
			<h1>Create Account</h1>
			<p>Set up your account and continue to your internship dashboard.</p>
		</header>

		{#if stage === 'account'}
			<form class="signup-form" on:submit|preventDefault={submitAccount}>
				<label>
					<span>Name</span>
					<input bind:value={name} type="text" placeholder="Enter your full name" autocomplete="name" />
				</label>

				<label>
					<span>Email</span>
					<input bind:value={email} type="email" autocomplete="email" />
				</label>

				<label>
					<span>Password</span>
					<div class="password-wrap">
						<input
							bind:value={password}
							type={showPassword ? 'text' : 'password'}
							autocomplete="new-password"
							placeholder="Create password"
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

				<label>
					<span>Confirm Password</span>
					<div class="password-wrap">
						<input
							bind:value={confirmPassword}
							type={showConfirmPassword ? 'text' : 'password'}
							autocomplete="new-password"
							placeholder="Confirm password"
						/>
						<button
							type="button"
							class="toggle-password"
							on:click={() => (showConfirmPassword = !showConfirmPassword)}
							aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
						>
							{#if showConfirmPassword}
								<EyeOff size={16} />
							{:else}
								<Eye size={16} />
							{/if}
						</button>
					</div>
				</label>

				<label>
					<span>Role</span>
					<select bind:value={role}>
						<option value="Supervisor">Supervisor</option>
						<option value="Student">Student</option>
					</select>
				</label>

				{#if error}
					<p class="feedback error">{error}</p>
				{/if}

				{#if info}
					<p class="feedback success">{info}</p>
				{/if}

				<div class="actions">
					<button class="primary" type="submit">Sign Up</button>
					<button class="secondary" type="button" on:click={goBackToLogin}>Back to Login</button>
				</div>
			</form>
		{/if}

		{#if stage === 'ojt'}
			<section class="ojt-panel">
				<h2>Student OJT Setup</h2>
				<p>Complete your OJT details before finishing account creation.</p>

				<form class="signup-form" on:submit|preventDefault={submitStudentSignup}>
					<label>
						<span>Total OJT Hours</span>
						<input bind:value={totalHours} type="number" min="1" placeholder="e.g. 480" />
					</label>

					<div class="date-grid">
						<label>
							<span>Start Date</span>
							<input bind:value={startDate} type="date" />
						</label>

						<label>
							<span>Estimated End Date</span>
							<input bind:value={estimatedEndDate} type="date" />
						</label>
					</div>

					<label>
						<span>Course</span>
						<div class="typeahead-wrap">
							<input
								bind:value={course}
								autocomplete="off"
								on:focus={() => (showCourseSuggestions = true)}
								on:blur={hideCourseSuggestions}
							/>

							{#if showCourseSuggestions && course.trim().length > 0 && filteredCourses.length > 0}
								<ul class="suggestions" role="listbox" aria-label="Course suggestions">
									{#each filteredCourses as item}
										<li>
											<button type="button" class="suggestion-item" on:mousedown={() => selectCourse(item)}>
												{item}
											</button>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					</label>

					<label>
						<span>School</span>
						<div class="typeahead-wrap">
							<input
								bind:value={school}
								type="text"
								placeholder="Enter your school"
								autocomplete="off"
								on:focus={() => (showSchoolSuggestions = true)}
								on:blur={hideSchoolSuggestions}
							/>

							{#if showSchoolSuggestions && school.trim().length > 0 && filteredSchools.length > 0}
								<ul class="suggestions" role="listbox" aria-label="School suggestions">
									{#each filteredSchools as item}
										<li>
											<button type="button" class="suggestion-item" on:mousedown={() => selectSchool(item)}>
												{item}
											</button>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					</label>

					{#if error}
						<p class="feedback error">{error}</p>
					{/if}

					<div class="actions">
						<button class="primary" type="submit">Sign Up</button>
						<button class="secondary" type="button" on:click={goBackToLogin}>Back to Login</button>
						<button class="text-btn" type="button" on:click={backToAccountStep}>Back to Account Details</button>
					</div>
				</form>
			</section>
		{/if}

		{#if stage === 'success'}
			<section class="success-panel">
				<h2>Account Ready</h2>
				<p>{info}</p>
				<div class="actions">
					<button class="primary" type="button" on:click={goBackToLogin}>Back to Login</button>
				</div>
			</section>
		{/if}
	</div>
</section>

<style>
	.signup-shell {
		min-height: 100vh;
		padding: clamp(1rem, 3vw, 2.3rem);
		background: radial-gradient(circle at top left, #e0e7ff 0%, #eef2ff 25%, #f8fafc 55%, #ffffff 100%);
		display: grid;
		place-items: center;
	}

	.signup-card {
		width: min(760px, 100%);
		background: #ffffff;
		border: 1px solid #d6ddff;
		border-radius: 1.2rem;
		box-shadow: 0 30px 58px -40px rgba(15, 23, 42, 0.35);
		padding: clamp(1.2rem, 3vw, 2rem);
	}

	.signup-head {
		margin-bottom: 1rem;
	}

	.eyebrow {
		margin: 0;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #4f46e5;
		font-weight: 700;
	}

	.signup-head h1 {
		margin: 0.45rem 0 0;
		color: #0f172a;
		font-size: clamp(1.45rem, 2vw, 1.8rem);
		font-weight: 700;
	}

	.signup-head p {
		margin: 0.45rem 0 0;
		color: #475569;
		font-size: 0.92rem;
	}

	.signup-form {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	label span {
		font-size: 0.84rem;
		color: #334155;
		font-weight: 600;
	}

	input,
	select {
		width: 100%;
		border: 1px solid #c7d2fe;
		border-radius: 0.78rem;
		background: #f8faff;
		color: #0f172a;
		padding: 0.76rem 0.9rem;
		outline: none;
		transition: border-color 160ms ease, box-shadow 160ms ease;
	}

	input:focus,
	select:focus {
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

	.typeahead-wrap {
		position: relative;
	}

	.suggestions {
		position: absolute;
		top: calc(100% + 0.4rem);
		left: 0;
		right: 0;
		margin: 0;
		padding: 0.35rem;
		list-style: none;
		background: #ffffff;
		border: 1px solid #c7d2fe;
		border-radius: 0.8rem;
		box-shadow: 0 20px 35px -28px rgba(15, 23, 42, 0.35);
		max-height: 200px;
		overflow-y: auto;
		z-index: 20;
	}

	.suggestion-item {
		width: 100%;
		text-align: left;
		background: transparent;
		border: 0;
		color: #1e293b;
		padding: 0.55rem 0.65rem;
		border-radius: 0.58rem;
		cursor: pointer;
		font-size: 0.86rem;
	}

	.suggestion-item:hover {
		background: #e0e7ff;
		color: #312e81;
	}

	.date-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.85rem;
	}

	.actions {
		margin-top: 0.15rem;
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
	}

	.primary,
	.secondary,
	.text-btn {
		border: 0;
		border-radius: 0.8rem;
		padding: 0.74rem 1rem;
		font-weight: 700;
		cursor: pointer;
	}

	.primary {
		background: linear-gradient(90deg, #4338ca 0%, #4f46e5 100%);
		color: #ffffff;
	}

	.secondary {
		background: #e0e7ff;
		color: #3730a3;
	}

	.text-btn {
		background: transparent;
		color: #475569;
		padding-inline: 0;
	}

	.feedback {
		margin: 0;
		padding: 0.64rem 0.74rem;
		border-radius: 0.66rem;
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

	.ojt-panel,
	.success-panel {
		padding: 0.4rem 0 0;
	}

	.ojt-panel h2,
	.success-panel h2 {
		margin: 0;
		color: #0f172a;
		font-size: 1.22rem;
	}

	.ojt-panel p,
	.success-panel p {
		margin: 0.42rem 0 1rem;
		color: #475569;
	}

	@media (max-width: 680px) {
		.date-grid {
			grid-template-columns: 1fr;
		}

		.actions {
			flex-direction: column;
			align-items: stretch;
		}

		.text-btn {
			text-align: left;
		}
	}

	:global(.dark) .signup-shell {
		background: radial-gradient(circle at top left, #111827 0%, #0f172a 48%, #020617 100%);
	}

	:global(.dark) .signup-card {
		background: #111827;
		border-color: #334155;
	}

	:global(.dark) .signup-head h1,
	:global(.dark) .ojt-panel h2,
	:global(.dark) .success-panel h2,
	:global(.dark) label span {
		color: #f8fafc;
	}

	:global(.dark) .signup-head p,
	:global(.dark) .ojt-panel p,
	:global(.dark) .success-panel p,
	:global(.dark) .text-btn {
		color: #cbd5e1;
	}

	:global(.dark) input,
	:global(.dark) select {
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

	:global(.dark) .suggestions {
		background: #111827;
		border-color: #334155;
		box-shadow: 0 22px 32px -24px rgba(2, 6, 23, 0.8);
	}

	:global(.dark) .suggestion-item {
		color: #e2e8f0;
	}

	:global(.dark) .suggestion-item:hover {
		background: #312e81;
		color: #e0e7ff;
	}

	:global(.dark) input:focus,
	:global(.dark) select:focus {
		border-color: #818cf8;
		box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.23);
	}

	:global(.dark) .secondary {
		background: #312e81;
		color: #e0e7ff;
	}
</style>

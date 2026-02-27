const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const supabase = require('../config/supabase');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

class AuthService {
	static generateToken(user) {
		return jwt.sign(
			{ id: user.id, role: user.role },
			process.env.JWT_SECRET,
			{ expiresIn: process.env.JWT_EXPIRE || process.env.JWT_EXPIRES_IN || '1d' }
		);
	}

	static async register(userData) {
		const { full_name, email, password } = userData;
		const hashedPassword = await bcrypt.hash(password, 10);

		const { data, error } = await supabase
			.from('users')
			.insert([
				{
					full_name,
					email,
					password: hashedPassword,
					role: 'customer',
					provider: 'local'
				}
			])
			.select('id, full_name, email, role')
			.single();

		if (error) {
			throw new Error(error.message || 'Registration failed');
		}

		return {
			...data,
			token: this.generateToken(data)
		};
	}

	static async login(email, password) {
		const { data, error } = await supabase
			.from('users')
			.select('*')
			.eq('email', email)
			.single();

		if (error || !data) {
			throw new Error('User not found');
		}

		if (!data.password) {
			throw new Error('This account uses Google login');
		}

		const validPassword = await bcrypt.compare(password, data.password);
		if (!validPassword) {
			throw new Error('Wrong password');
		}

		return {
			id: data.id,
			full_name: data.full_name,
			email: data.email,
			role: data.role,
			token: this.generateToken(data)
		};
	}

	static async googleLogin(idToken) {
		const ticket = await googleClient.verifyIdToken({
			idToken,
			audience: process.env.GOOGLE_CLIENT_ID
		});

		const payload = ticket.getPayload();
		const { email, name } = payload;

		const { data: existingUser, error: fetchError } = await supabase
			.from('users')
			.select('*')
			.eq('email', email)
			.single();

		if (fetchError && fetchError.code !== 'PGRST116') {
			throw new Error(fetchError.message || 'Failed to fetch user');
		}

		let user = existingUser;

		if (!user) {
			const { data: createdUser, error: createError } = await supabase
				.from('users')
				.insert([
					{
						full_name: name,
						email,
						password: null,
						role: 'customer',
						provider: 'google'
					}
				])
				.select('*')
				.single();

			if (createError) {
				throw new Error(createError.message || 'Failed to create Google user');
			}

			user = createdUser;
		}

		return {
			id: user.id,
			full_name: user.full_name,
			email: user.email,
			role: user.role,
			token: this.generateToken(user)
		};
	}

	static async getProfile(id) {
		const { data, error } = await supabase
			.from('users')
			.select('id, full_name, email, role, provider, created_at')
			.eq('id', id)
			.single();

		if (error || !data) {
			throw new Error('User not found');
		}

		return data;
	}
}

module.exports = AuthService;

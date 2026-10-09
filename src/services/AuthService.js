const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const db = require('../config/database');
const HttpError = require('../utils/http-error');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

class AuthService {
	static generateToken(user) {
		return jwt.sign(
			{ id: user.id, role: user.role },
			process.env.JWT_SECRET,
			{ expiresIn: process.env.JWT_EXPIRE || process.env.JWT_EXPIRES_IN || '1d', algorithm: 'HS256' }
		);
	}

	static async register(userData) {
		const { full_name, email, password } = userData;
		const hashedPassword = await bcrypt.hash(password, 10);

		const { data, error } = await db
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
			if (error.code === '23505') throw new HttpError(409, 'Email is already registered');
			throw error;
		}

		return {
			...data,
			token: this.generateToken(data)
		};
	}

	static async login(email, password) {
		const { data, error } = await db
			.from('users')
			.select('*')
			.eq('email', email)
			.maybeSingle();

		if (error) throw error;
		if (!data) throw new HttpError(401, 'Invalid email or password');

		if (!data.password) {
			throw new HttpError(401, 'Invalid email or password');
		}

		const validPassword = await bcrypt.compare(password, data.password);
		if (!validPassword) {
			throw new HttpError(401, 'Invalid email or password');
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
		if (!payload || payload.email_verified !== true || typeof payload.email !== 'string') {
			throw new HttpError(401, 'Google authentication failed');
		}
		const email = payload.email.trim().toLowerCase();
		const name = typeof payload.name === 'string' && payload.name.trim()
			? payload.name.trim()
			: email.split('@')[0];

		const { data: existingUser, error: fetchError } = await db
			.from('users')
			.select('*')
			.eq('email', email)
			.maybeSingle();

		if (fetchError) throw fetchError;

		let user = existingUser;

		if (!user) {
			const { data: createdUser, error: createError } = await db
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
				if (createError.code === '23505') throw new HttpError(409, 'Unable to create Google account');
				throw createError;
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
		const { data, error } = await db
			.from('users')
			.select('id, full_name, email, role, provider, created_at')
			.eq('id', id)
			.maybeSingle();

		if (error) throw error;
		if (!data) throw new HttpError(404, 'User not found');

		return data;
	}
}

module.exports = AuthService;

# Advanced E-commerce Backend

Backend API for an e-commerce project built with Node.js, Express, and Supabase, using a controller-service-model architecture.

## Tech Stack

- **Runtime**: Node.js + Express
- **Database**: Supabase (PostgreSQL)
- **Authentication**: JWT (`jsonwebtoken`) + password hashing (`bcryptjs`)
- **Social Login**: Google Sign-In (`google-auth-library`)
- **File Upload Utility**: `multer` (installed)

## Features

- JWT-based auth with role support (`admin`, `customer`)
- Local registration/login and Google login
- Product, category, and variant management
- Address management per authenticated user
- Cart and order creation flow
- Health endpoint with Supabase connectivity check

## Project Structure

```text
Backend Ecommerce/
├── src/
│   ├── app.js
│   ├── server.js
│   ├── config/
│   │   └── supabase.js
│   ├── controllers/
│   ├── middlewares/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   ├── validations/
│   └── database/
├── tests/
├── uploads/
├── package.json
└── README.md
```

## Environment Variables

Create a `.env` file in the project root with:

```env
PORT=5000
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
JWT_SECRET=your_jwt_secret
JWT_EXPIRE=1d
GOOGLE_CLIENT_ID=your_google_oauth_client_id
```

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase project (with required tables)

### Installation & Run

```bash
npm install
npm run dev
```

Production mode:

```bash
npm start
```

## API Routes

Base URL: `http://localhost:5000`

### Health
- `GET /api/health/db-check` - Check Supabase connection

### Auth
- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - Login user
- `POST /api/auth/google` - Login/register with Google ID token
- `GET /api/auth/profile` - Get current user profile (Protected)

### Users (Admin)
- `GET /api/users` - Get all users (Admin)
- `GET /api/users/:id` - Get user by ID (Admin)

### Products
- `GET /api/products` - Get all products
- `POST /api/products` - Create product (Admin)
- `PUT /api/products/:id` - Update product (Admin)
- `DELETE /api/products/:id` - Delete product (Admin)

### Categories
- `GET /api/categories` - Get all categories
- `POST /api/categories` - Create category (Admin)
- `PUT /api/categories/:id` - Update category (Admin)
- `DELETE /api/categories/:id` - Delete category (Admin)

### Variants
- `GET /api/variants` - Get all variants
- `POST /api/variants` - Create variant
- `PUT /api/variants/:id` - Update variant
- `DELETE /api/variants/:id` - Delete variant

### Addresses (Protected)
- `GET /api/addresses` - Get current user's addresses
- `POST /api/addresses` - Create address
- `PUT /api/addresses/:id` - Update address
- `DELETE /api/addresses/:id` - Delete address

### Cart (Protected)
- `GET /api/cart` - Get current user's cart items
- `POST /api/cart` - Add item to cart
- `DELETE /api/cart/:id` - Remove cart item

### Orders (Protected)
- `POST /api/orders` - Create order from current user's cart

## Scripts

- `npm run dev` - Run with nodemon
- `npm start` - Run with Node.js

## Notes

- Role-based access is enforced through auth and role middlewares.
- If the server fails on startup, verify Supabase credentials and JWT settings in `.env`.

## License

MIT
